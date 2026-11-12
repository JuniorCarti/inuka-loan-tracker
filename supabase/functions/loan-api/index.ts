
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const clientSchema = z.object({
  clientNumber: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

const loanSchema = z.object({
  clientId: z.string().uuid(),
  loanReference: z.string().trim().min(1),
  principalCents: z.number().int().positive().safe(),
  totalDueCents: z.number().int().positive().safe(),
}).refine(
  (value) => value.totalDueCents >= value.principalCents,
  { message: "Total due cannot be less than principal" },
);

const repaymentSchema = z.object({
  loanId: z.string().uuid(),
  paymentReference: z.string().trim().min(1),
  amountCents: z.number().int().positive().safe(),
  paymentDate: z.iso.date(),
});

const loanQuerySchema = z.object({
  loanId: z.string().uuid(),
});

function respond(
  data: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publishableKey =
      Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !publishableKey || !serviceKey) {
      return respond(
        { error: "Server configuration incomplete" },
        500,
      );
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return respond({ error: "Authentication required" }, 401);
    }

    const token = authorization.slice(7);

    const authClient = createClient(url, publishableKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return respond({ error: "Invalid authentication" }, 401);
    }

    // Restrict access to an explicitly approved staff account.
    // Set STAFF_USER_ID in Edge Function secrets.
    const staffUserId = Deno.env.get("STAFF_USER_ID");

    if (!staffUserId || user.id !== staffUserId) {
      return respond({ error: "Access denied" }, 403);
    }

    // Never expose this client or its credentials to the browser.
    const db = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const body = await request.json();

    if (!body || typeof body !== "object") {
      return respond({ error: "Invalid request body" }, 400);
    }

    switch (body.action) {
      case "create-client": {
        const input = clientSchema.parse(body.data);

        const { data, error } = await db
          .from("clients")
          .insert({
            client_number: input.clientNumber,
            name: input.name,
          })
          .select("id, client_number, name, created_at")
          .single();

        if (error) throw error;

        return respond({ data }, 201);
      }

      case "create-loan": {
        const input = loanSchema.parse(body.data);

        const { data, error } = await db
          .from("loans")
          .insert({
            client_id: input.clientId,
            loan_reference: input.loanReference,
            principal_cents: input.principalCents,
            total_due_cents: input.totalDueCents,
          })
          .select()
          .single();

        if (error) throw error;

        return respond({ data }, 201);
      }

      case "record-repayment": {
        const input = repaymentSchema.parse(body.data);

        const { data, error } = await db.rpc(
          "record_repayment",
          {
            p_loan_id: input.loanId,
            p_payment_reference: input.paymentReference,
            p_amount_cents: input.amountCents,
            p_payment_date: input.paymentDate,
          },
        );

        if (error) throw error;

        return respond({ repaymentId: data }, 201);
      }

      case "get-loan": {
        const input = loanQuerySchema.parse(body.data);

        const { data: loan, error: loanError } = await db
          .from("loans")
          .select(`
            id,
            loan_reference,
            principal_cents,
            total_due_cents,
            total_repaid_cents,
            clients (
              client_number,
              name
            )
          `)
          .eq("id", input.loanId)
          .single();

        
if (loanError) {
  if (loanError.code === "PGRST116") {
    return respond(
      { error: "Loan not found" },
      404,
    );
  }

  throw loanError;
}


        const { data: repayments, error: repaymentsError } =
          await db
            .from("repayments")
            .select(
              "id, payment_reference, amount_cents, payment_date",
            )
            .eq("loan_id", input.loanId)
            .order("payment_date", { ascending: false });

        if (repaymentsError) throw repaymentsError;

        return respond({
          data: {
            ...loan,
            outstanding_cents:
              loan.total_due_cents - loan.total_repaid_cents,
            repayments,
          },
        });
      }

      default:
        return respond({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respond({
        error: "Validation failed",
        details: error.issues,
      }, 400);
    }

    console.error("Loan API operation failed", error);

    // Avoid exposing database internals or credentials.
    return respond(
      { error: "Operation failed. Check inputs and constraints." },
      400,
    );
  }
});
