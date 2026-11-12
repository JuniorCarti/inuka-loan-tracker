
-- ============================================================
-- INUKA AFRICA - INITIAL LOAN DATABASE SCHEMA
-- ============================================================
-- Migration: 20261112215730_initial_loan_schema.sql
--
-- Purpose:
--   Manage clients, loans, and loan repayments.
--
-- Monetary values:
--   All amounts are stored as integer cents.
--   Example: KES 10,000.00 = 1000000 cents.
--
-- Security:
--   Row Level Security enabled.
--   Direct access restricted for public API roles.
--   Financial operations handled by trusted backend.
-- ============================================================


-- ============================================================
-- 1. CLIENTS TABLE
-- ============================================================

CREATE TABLE public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    client_number TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valid_client_number
        CHECK (
            length(btrim(client_number)) > 0
            AND client_number = btrim(client_number)
        ),

    CONSTRAINT valid_client_name
        CHECK (
            length(btrim(name)) > 0
        )
);

-- Prevent client numbers differing only by case.
CREATE UNIQUE INDEX idx_clients_number_normalized
ON public.clients (
    upper(btrim(client_number))
);


-- ============================================================
-- 2. LOANS TABLE
-- ============================================================

CREATE TABLE public.loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    client_id UUID NOT NULL
        REFERENCES public.clients(id)
        ON DELETE RESTRICT,

    loan_reference TEXT NOT NULL UNIQUE,

    principal_cents BIGINT NOT NULL,

    total_due_cents BIGINT NOT NULL,

    total_repaid_cents BIGINT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valid_loan_reference
        CHECK (
            length(btrim(loan_reference)) > 0
            AND loan_reference = btrim(loan_reference)
        ),

    CONSTRAINT valid_principal
        CHECK (
            principal_cents > 0
        ),

    CONSTRAINT valid_total_due
        CHECK (
            total_due_cents >= principal_cents
        ),

    CONSTRAINT valid_total_repaid
        CHECK (
            total_repaid_cents >= 0
            AND total_repaid_cents <= total_due_cents
        )
);

-- Prevent loan references differing only by case.
CREATE UNIQUE INDEX idx_loans_reference_normalized
ON public.loans (
    upper(btrim(loan_reference))
);

-- Improve client loan lookups.
CREATE INDEX idx_loans_client_id
ON public.loans (
    client_id
);


-- ============================================================
-- 3. REPAYMENTS TABLE
-- ============================================================

CREATE TABLE public.repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    loan_id UUID NOT NULL
        REFERENCES public.loans(id)
        ON DELETE RESTRICT,

    payment_reference TEXT NOT NULL UNIQUE,

    amount_cents BIGINT NOT NULL,

    payment_date DATE NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valid_repayment_amount
        CHECK (
            amount_cents > 0
        ),

    CONSTRAINT valid_payment_reference
        CHECK (
            length(btrim(payment_reference)) > 0
            AND payment_reference = btrim(payment_reference)
        )
);

-- Prevent duplicate references even when letter case differs.
-- Examples: PAY001, pay001, and Pay001 are equivalent.
CREATE UNIQUE INDEX idx_repayments_reference_normalized
ON public.repayments (
    upper(btrim(payment_reference))
);

-- Improve repayment history queries.
CREATE INDEX idx_repayments_loan_id
ON public.repayments (
    loan_id
);


-- ============================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.clients
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loans
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.repayments
ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. RESTRICT DIRECT PUBLIC API ACCESS
-- ============================================================

-- Prevent anonymous and authenticated API users
-- from accessing financial tables directly.

REVOKE ALL ON TABLE public.clients
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.loans
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.repayments
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 6. DATABASE DOCUMENTATION
-- ============================================================

COMMENT ON TABLE public.clients IS
'Registered microfinance clients identified by unique client numbers.';

COMMENT ON TABLE public.loans IS
'Client loans with principal, total due, and cumulative repayments stored in integer cents.';

COMMENT ON TABLE public.repayments IS
'Individual loan repayments with globally unique payment references.';

COMMENT ON COLUMN public.loans.principal_cents IS
'Original loan principal expressed in KES cents.';

COMMENT ON COLUMN public.loans.total_due_cents IS
'Total contractual amount payable expressed in KES cents.';

COMMENT ON COLUMN public.loans.total_repaid_cents IS
'Cumulative repayments. Must be maintained through the approved repayment transaction.';

COMMENT ON COLUMN public.repayments.amount_cents IS
'Repayment amount expressed in KES cents.';


-- ============================================================
-- END OF INITIAL SCHEMA
-- ============================================================
