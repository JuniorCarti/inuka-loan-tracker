
import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const staffEmail = process.env.TEST_STAFF_EMAIL;
const staffPassword = process.env.TEST_STAFF_PASSWORD;

const configured = Boolean(
  url && anonKey && staffEmail && staffPassword,
);

const suite = configured ? describe : describe.skip;

suite("Loan repayment integration tests", () => {
  const supabase = createClient(url!, anonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let staffAccessToken: string;

  async function authenticateStaff() {
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: staffEmail!,
        password: staffPassword!,
      });

    if (error) {
      throw new Error(
        `Test staff sign-in failed: ${error.message}`,
      );
    }

    if (!data.session?.access_token) {
      throw new Error("No staff access token returned");
    }

    return data.session.access_token;
  }

  beforeAll(async () => {
    staffAccessToken = await authenticateStaff();
  });

  async function api(action: string, data: object) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Staff session is missing");
    }

    staffAccessToken = session.access_token;

    const result = await supabase.functions.invoke("loan-api", {
      body: { action, data },
      headers: {
        Authorization: `Bearer ${staffAccessToken}`,
      },
    });

    if (result.error) {
      let message = result.error.message;

      if (result.error.context instanceof Response) {
        try {
          const body = await result.error.context.json();
          message = body.error ?? message;
        } catch {
          // Preserve the original error.
        }
      }

      throw new Error(message);
    }

    return result.data;
  }

  async function setupLoan(totalDueCents: number) {
    const unique = randomUUID().slice(0, 8);

    const client = await api("create-client", {
      clientNumber: `TEST-${unique}`,
      name: "Automated Test Client",
    });

    const loan = await api("create-loan", {
      clientId: client.data.id,
      loanReference: `LOAN-${unique}`,
      principalCents: totalDueCents,
      totalDueCents,
    });

    return loan.data.id as string;
  }

  it("calculates KES 7,000 outstanding after KES 3,000 repayment", async () => {
    const loanId = await setupLoan(1_000_000);

    await api("record-repayment", {
      loanId,
      paymentReference: `PAY-${randomUUID()}`,
      amountCents: 300_000,
      paymentDate: "2026-11-13",
    });

    const response = await api("get-loan", { loanId });

    expect(response.data.total_repaid_cents).toBe(300_000);
    expect(response.data.outstanding_cents).toBe(700_000);
    expect(response.data.repayments).toHaveLength(1);
  });

  it("rejects duplicate payment references without double recording", async () => {
    const loanId = await setupLoan(1_000_000);
    const paymentReference = `PAY-${randomUUID()}`;

    await api("record-repayment", {
      loanId,
      paymentReference,
      amountCents: 200_000,
      paymentDate: "2026-11-13",
    });

    await expect(
      api("record-repayment", {
        loanId,
        paymentReference,
        amountCents: 200_000,
        paymentDate: "2026-11-13",
      }),
    ).rejects.toThrow();

    const response = await api("get-loan", { loanId });

    expect(response.data.total_repaid_cents).toBe(200_000);
    expect(response.data.repayments).toHaveLength(1);
  });

  it("rejects overpayment without changing outstanding balance", async () => {
    const loanId = await setupLoan(100_000);

    await expect(
      api("record-repayment", {
        loanId,
        paymentReference: `PAY-${randomUUID()}`,
        amountCents: 150_000,
        paymentDate: "2026-11-13",
      }),
    ).rejects.toThrow();

    const response = await api("get-loan", { loanId });

    expect(response.data.total_repaid_cents).toBe(0);
    expect(response.data.outstanding_cents).toBe(100_000);
    expect(response.data.repayments).toHaveLength(0);
  });
});
