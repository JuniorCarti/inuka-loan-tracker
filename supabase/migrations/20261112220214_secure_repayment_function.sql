
-- ============================================================
-- INUKA AFRICA - SECURE LOAN REPAYMENT FUNCTION
-- ============================================================
-- Purpose:
--   Record repayments safely and atomically.
--
-- Security:
--   1. Validate repayment inputs
--   2. Normalize payment references
--   3. Lock loan rows against concurrent repayments
--   4. Reject nonexistent loans
--   5. Prevent overpayments
--   6. Prevent duplicate payment references
--   7. Update repayment totals atomically
--
-- Access:
--   Trusted backend only.
--   Not directly executable by anon/authenticated roles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_repayment(
    p_loan_id UUID,
    p_payment_reference TEXT,
    p_amount_cents BIGINT,
    p_payment_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_loan public.loans%ROWTYPE;
    v_repayment_id UUID;
    v_payment_reference TEXT;
    v_outstanding_cents BIGINT;
BEGIN

    -- 1. Validate loan ID
    IF p_loan_id IS NULL THEN
        RAISE EXCEPTION 'Loan ID is required'
            USING ERRCODE = '22023';
    END IF;

    -- 2. Validate repayment date
    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'Payment date is required'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Validate repayment amount
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'Repayment must be greater than zero'
            USING ERRCODE = '22023';
    END IF;

    -- 4. Validate payment reference
    IF p_payment_reference IS NULL
       OR length(btrim(p_payment_reference)) = 0 THEN
        RAISE EXCEPTION 'Payment reference is required'
            USING ERRCODE = '22023';
    END IF;

    -- 5. Normalize reference
    v_payment_reference := upper(btrim(p_payment_reference));

    -- 6. Lock the loan row
    -- Concurrent repayments for the same loan are serialized.
    SELECT *
    INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id
    FOR UPDATE;

    -- 7. Verify loan exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan does not exist'
            USING ERRCODE = 'P0002';
    END IF;

    -- 8. Calculate outstanding balance
    v_outstanding_cents :=
        v_loan.total_due_cents - v_loan.total_repaid_cents;

    -- 9. Prevent overpayments
    IF p_amount_cents > v_outstanding_cents THEN
        RAISE EXCEPTION
            'Repayment exceeds outstanding balance'
            USING ERRCODE = '23514';
    END IF;

    -- 10. Insert repayment
    -- The unique database constraint/index prevents
    -- duplicate payment references.
    INSERT INTO public.repayments (
        loan_id,
        payment_reference,
        amount_cents,
        payment_date
    )
    VALUES (
        p_loan_id,
        v_payment_reference,
        p_amount_cents,
        p_payment_date
    )
    RETURNING id INTO v_repayment_id;

    -- 11. Update total repaid
    UPDATE public.loans
    SET total_repaid_cents =
        total_repaid_cents + p_amount_cents
    WHERE id = p_loan_id;

    -- 12. Return repayment ID
    RETURN v_repayment_id;

END;
$$;

-- ============================================================
-- FUNCTION ACCESS CONTROL
-- ============================================================

-- Remove default execution permissions.
REVOKE ALL ON FUNCTION public.record_repayment(
    UUID, TEXT, BIGINT, DATE
) FROM PUBLIC, anon, authenticated;

-- Allow trusted backend role to execute.
GRANT EXECUTE ON FUNCTION public.record_repayment(
    UUID, TEXT, BIGINT, DATE
) TO service_role;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
