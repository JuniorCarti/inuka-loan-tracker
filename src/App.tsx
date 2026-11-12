
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "./lib/supabase";

type Loan = {
  id: string;
  loan_reference: string;
  principal_cents: number;
  total_due_cents: number;
  total_repaid_cents: number;
  outstanding_cents: number;
  clients: {
    client_number: string;
    name: string;
  };
  repayments: Array<{
    id: string;
    payment_reference: string;
    amount_cents: number;
    payment_date: string;
  }>;
};

function toCents(value: string): number {
  const amount = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error("Enter a valid KES amount with up to 2 decimals.");
  }

  const [whole, fraction = ""] = amount.split(".");
  const cents = Number(whole) * 100 +
    Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error("Amount must be positive and within the supported range.");
  }

  return cents;
}

function formatKES(cents: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
  }).format(cents / 100);
}

async function callApi(action: string, data: object) {
  const result = await supabase.functions.invoke("loan-api", {
    body: { action, data },
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

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [clientNumber, setClientNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");

  const [loanReference, setLoanReference] = useState("");
  const [principal, setPrincipal] = useState("");
  const [totalDue, setTotalDue] = useState("");
  const [loanId, setLoanId] = useState("");

  const [paymentReference, setPaymentReference] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toLocaleDateString("en-CA"),
  );

  const [loan, setLoan] = useState<Loan | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setSignedIn(Boolean(session)),
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  async function execute(
    operation: () => Promise<void>,
  ) {
    setBusy(true);
    setMessage("");

    try {
      await operation();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Operation failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshLoan(id: string) {
    const response = await callApi("get-loan", { loanId: id });
    setLoan(response.data as Loan);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await execute(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      setPassword("");
      setMessage("Signed in successfully.");
    });
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await execute(async () => {
      const response = await callApi("create-client", {
        clientNumber,
        name: clientName,
      });

      setClientId(response.data.id);
      setMessage("Client registered successfully.");
    });
  }

  async function createLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await execute(async () => {
      const response = await callApi("create-loan", {
        clientId,
        loanReference,
        principalCents: toCents(principal),
        totalDueCents: toCents(totalDue),
      });

      const id = response.data.id as string;
      setLoanId(id);
      await refreshLoan(id);
      setMessage("Loan created successfully.");
    });
  }

  async function recordRepayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await execute(async () => {
      await callApi("record-repayment", {
        loanId,
        paymentReference,
        amountCents: toCents(paymentAmount),
        paymentDate,
      });

      await refreshLoan(loanId);
      setPaymentReference("");
      setPaymentAmount("");
      setMessage("Repayment recorded successfully.");
    });
  }

  async function loadLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await execute(async () => {
      await refreshLoan(loanId);
      setMessage("Loan loaded successfully.");
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setLoan(null);
    setMessage("");
  }

  if (!signedIn) {
    return (
      <main style={{ maxWidth: 420, margin: "70px auto" }}>
        <h1>Inuka Africa</h1>
        <h2>Loan Repayment Tracker</h2>
        <p>Authorized staff access</p>

        <form onSubmit={signIn}>
          <input
            type="email"
            placeholder="Staff email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button disabled={busy}>Sign in</button>
        </form>

        <p role="status">{message}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: "30px auto", padding: 20 }}>
      <header>
        <h1>Inuka Africa</h1>
        <p>Microfinance Loan Repayment Tracker</p>
        <button onClick={signOut}>Sign out</button>
      </header>

      <hr />

      <h2>1. Register Client</h2>
      <form onSubmit={createClient}>
        <input
          placeholder="Client number e.g. CL001"
          value={clientNumber}
          onChange={(event) => setClientNumber(event.target.value)}
          required
        />
        <input
          placeholder="Client name"
          value={clientName}
          onChange={(event) => setClientName(event.target.value)}
          required
        />
        <button disabled={busy}>Register Client</button>
      </form>

      {clientId && <p>Client ID: {clientId}</p>}

      <hr />

      <h2>2. Create Loan</h2>
      <form onSubmit={createLoan}>
        <input
          placeholder="Client UUID"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          required
        />
        <input
          placeholder="Loan reference e.g. LN001"
          value={loanReference}
          onChange={(event) => setLoanReference(event.target.value)}
          required
        />
        <input
          placeholder="Principal (KES)"
          value={principal}
          onChange={(event) => setPrincipal(event.target.value)}
          required
        />
        <input
          placeholder="Total due (KES)"
          value={totalDue}
          onChange={(event) => setTotalDue(event.target.value)}
          required
        />
        <button disabled={busy}>Create Loan</button>
      </form>

      <hr />

      <h2>3. Find Loan</h2>
      <form onSubmit={loadLoan}>
        <input
          placeholder="Loan UUID"
          value={loanId}
          onChange={(event) => setLoanId(event.target.value)}
          required
        />
        <button disabled={busy}>Load Loan</button>
      </form>

      {loan && (
        <>
          <hr />
          <h2>Loan Summary</h2>
          <p>Client: {loan.clients.name}</p>
          <p>Client number: {loan.clients.client_number}</p>
          <p>Loan reference: {loan.loan_reference}</p>
          <p>Principal: {formatKES(loan.principal_cents)}</p>
          <p>Total due: {formatKES(loan.total_due_cents)}</p>
          <p>Total repaid: {formatKES(loan.total_repaid_cents)}</p>
          <h3>Outstanding: {formatKES(loan.outstanding_cents)}</h3>

          <h2>4. Record Repayment</h2>
          <form onSubmit={recordRepayment}>
            <input
              placeholder="Payment reference"
              value={paymentReference}
              onChange={(event) =>
                setPaymentReference(event.target.value)
              }
              required
            />
            <input
              placeholder="Amount (KES)"
              value={paymentAmount}
              onChange={(event) =>
                setPaymentAmount(event.target.value)
              }
              required
            />
            <input
              type="date"
              value={paymentDate}
              onChange={(event) =>
                setPaymentDate(event.target.value)
              }
              required
            />
            <button disabled={busy}>Record Repayment</button>
          </form>

          <h2>Repayment History</h2>
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Date</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {loan.repayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.payment_reference}</td>
                  <td>{payment.payment_date}</td>
                  <td>{formatKES(payment.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p role="status">{message}</p>
    </main>
  );
}
