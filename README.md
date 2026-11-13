# Inuka Africa — Loan Repayment Tracker

A web-based loan repayment tracker developed for the **Inuka Africa Software Development Internship Technical Assessment**. An authorized staff user can register clients, create loans, record repayments, and inspect loan balances and repayment history.

**Live demo:** https://inuka-loan-tracker.pages.dev/  
**Source code:** https://github.com/JuniorCarti/inuka-loan-tracker

> **Assessment demo:** The website is publicly reachable, but loan-management operations require authorized staff authentication. Use fictional client and loan data. Demo credentials are not published.

## 1. Features

- **Client registration:** Register a borrower with a unique client number and name.
- **Loan creation:** Associate a loan with a client, assign a unique loan reference, and specify principal and total due in KES.
- **Repayment recording:** Submit a positive amount, unique payment reference, and payment date against an existing loan.
- **Financial safeguards:** Reject duplicate payment references, overpayments, invalid amounts, and nonexistent loans.
- **Loan summary:** Display total due, total repaid, outstanding balance, and repayment history.
- **Staff access:** Sign in through Supabase Auth; the Edge Function checks the configured authorized staff user.

## 2. Technology Stack

| Layer | Technology | Hosting |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | Cloudflare Pages |
| Backend API | Supabase Edge Functions (Deno) | Supabase |
| Database | PostgreSQL | Supabase |
| Authentication | Supabase Auth | Supabase |
| Validation | Zod and PostgreSQL constraints | Backend and database |
| Automated testing | Vitest integration tests | Run from development environment |
| Source control | Git | GitHub |

## 3. Live Deployment and Architecture

The React application is deployed on **Cloudflare Pages** and communicates over HTTPS with the already deployed Supabase Edge Function, `loan-api`. The Edge Function validates requests, authenticates and authorizes the staff user, and performs database operations. Repayments use a PostgreSQL function to enforce financial integrity within a transaction.

```text
Browser
  |
  v
Cloudflare Pages (React + Vite)
https://inuka-loan-tracker.pages.dev/
  |
  | HTTPS requests with Supabase Auth session
  v
Supabase Edge Function: loan-api
  |  Input validation + authorized-staff check
  v
Supabase PostgreSQL
  |-- public.clients
  |-- public.loans
  |-- public.repayments
  `-- public.record_repayment(...) [atomic transaction]
```

The frontend uses only a **public Supabase publishable key**. The service-role credential remains server-side and must never be included in frontend environment variables or committed to Git.

### Cloudflare Pages configuration

The frontend was deployed using GitHub integration with these settings:

| Setting | Value |
| --- | --- |
| GitHub repository | `JuniorCarti/inuka-loan-tracker` |
| Production branch | `main` |
| Framework preset | React (Vite) |
| Root directory | Repository root |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Production URL | https://inuka-loan-tracker.pages.dev/ |

**Cloudflare Pages build environment variables:**

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

The real values are configured in the Cloudflare Pages project settings and are **not** stored in the repository. Vite embeds variables prefixed `VITE_` into the browser bundle at build time; do not put secrets in them.

### Deployment workflow

1. Push changes to the `main` branch on GitHub.
2. Cloudflare Pages builds the frontend with `npm run build` and publishes `dist`.
3. The published frontend connects to the existing Supabase Auth service and `loan-api` Edge Function.
4. Database migrations and Edge Function changes are deployed separately through the Supabase CLI; a frontend redeploy does **not** automatically deploy backend changes.
5. After deployment, verify staff sign-in and the loan repayment workflow using fictional data.

The live application was manually checked after deployment, including authenticated access and the loan repayment workflow. This is a functional demo, not a production-certified financial service.

## 4. Database Design

Three tables model the core domain:

### `public.clients`

| Column | Purpose |
| --- | --- |
| `id` | UUID primary key |
| `client_number` | Unique client identifier |
| `name` | Borrower name |

### `public.loans`

| Column | Purpose |
| --- | --- |
| `id` | UUID primary key |
| `client_id` | Foreign key to `clients` |
| `loan_reference` | Unique loan reference |
| `principal_cents` | Original principal |
| `total_due_cents` | Total payable amount |
| `total_repaid_cents` | Sum of accepted repayments |

### `public.repayments`

| Column | Purpose |
| --- | --- |
| `id` | UUID primary key |
| `loan_id` | Foreign key to `loans` |
| `payment_reference` | Unique payment identifier |
| `amount_cents` | Accepted repayment amount |
| `payment_date` | Date of repayment |

A client may have many loans; a loan may have many repayments. Foreign keys enforce relationships, unique indexes prevent duplicate business references, and check constraints enforce valid financial values. The schema and function definitions are versioned in `supabase/migrations/`.

### Money representation

Amounts are stored as **integer cents**, avoiding floating-point arithmetic for persisted monetary values.

| Displayed amount | Stored integer |
| --- | ---: |
| KES 1,000.00 | 100000 |
| KES 3,000.00 | 300000 |
| KES 10,000.00 | 1000000 |

## 5. Repayment Business Logic

```text
Outstanding balance = Total amount due - Total amount repaid
KES 10,000 - KES 3,000 = KES 7,000
```

The backend validates the loan identifier, payment reference, positive repayment amount, and payment date. The database also checks that the loan exists and that the payment will not exceed the remaining balance.

Repayments are recorded through `public.record_repayment(...)`, which:

1. Validates the submitted repayment details.
2. Locks the loan row using `SELECT ... FOR UPDATE`.
3. Checks the outstanding amount.
4. Inserts the repayment record.
5. Updates `total_repaid_cents` on the loan.

These steps execute in one PostgreSQL transaction. A failed insert or validation rolls back the transaction, preventing a repayment history entry and the loan total from diverging. Row locking serializes concurrent updates to the same loan; uniqueness constraints protect payment references.

## 6. Authentication and Security

- Staff sign-in uses Supabase Auth.
- The `loan-api` Edge Function validates the user session and checks it against the configured `STAFF_USER_ID`.
- Zod validates API inputs; PostgreSQL constraints provide additional enforcement.
- Row Level Security is enabled on the financial tables, and direct anonymous/authenticated table access is restricted.
- Service-role access is limited to the backend, not the browser.
- Local credentials and Supabase CLI temporary files are excluded by `.gitignore`.
- The public deployment does not expose a shared staff password.

**Scope limitation:** The current implementation authorizes a single configured staff account. It is intended for assessment demonstration and would need a more complete permissions model, audit trail, operational controls, and security review before use with real borrowers.

## 7. Repository Structure

```text
inuka-loan-tracker/
├── public/
├── src/
│   ├── lib/supabase.ts
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   ├── config.toml
│   ├── functions/loan-api/index.ts
│   └── migrations/
├── tests/loan-api.integration.test.ts
├── .gitignore
├── package.json
├── vite.config.ts
├── vitest.config.ts
└── README.md
```

## 8. Run Locally

### Prerequisites

- Node.js and npm
- A Supabase project
- Supabase CLI access for database/function deployment
- A Supabase Auth user authorized as the test staff account

### Clone and install

```bash
git clone https://github.com/JuniorCarti/inuka-loan-tracker.git
cd inuka-loan-tracker
npm install
```

### Frontend configuration

Create `.env.local` in the repository root:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Use the publishable key from the **same Supabase project** as the URL. Never put the service-role key in a `VITE_` variable.

### Database and backend setup

For a **new Supabase project**, link the CLI and apply the included migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --remote
```

Configure the Edge Function's server-side environment, including `STAFF_USER_ID` (the authorized Supabase Auth user's UUID). The function also uses Supabase-provided backend URL and service-role credentials. Configure these securely through Supabase; do not add them to Git.

Deploy the function to the linked project:

```bash
npx supabase functions deploy loan-api
```

Ensure the function's JWT verification settings are consistent with the project's authentication configuration. If the function or schema has already been deployed, do not reapply changes unnecessarily.

### Start the application

```bash
npm run dev
```

Open the local Vite URL (typically `http://localhost:5173`) and sign in with the authorized staff account.

## 9. Automated Integration Tests

The Vitest suite calls the deployed Supabase Edge Function and checks persisted PostgreSQL results. It does **not** mock repayment processing.

| Test | Expected result |
| --- | --- |
| Repay KES 3,000 against KES 10,000 due | KES 7,000 outstanding |
| Submit the same payment reference twice | Second request rejected; one repayment recorded |
| Repay KES 1,500 against KES 1,000 outstanding | Rejected; balance remains unchanged |

Create `.env.test.local`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_SUPABASE_PUBLISHABLE_KEY
TEST_STAFF_EMAIL=YOUR_AUTHORIZED_TEST_EMAIL
TEST_STAFF_PASSWORD=YOUR_TEST_STAFF_PASSWORD
```

The test file signs in as the authorized staff user. Use a dedicated test project where possible: **tests create fictional clients, loans, and repayments and do not automatically remove them**.

Run:

```bash
npx vitest run tests/loan-api.integration.test.ts --mode test
```

Verified result during development:

```text
Test Files  1 passed (1)
Tests       3 passed (3)
```

## 10. Build and Quality Checks

```bash
npm run build
npm run lint
```

Both commands completed successfully before deployment. The deployed frontend was subsequently checked manually through the live website.

## 11. Error Handling and Data Integrity

Financial correctness is enforced at multiple layers: frontend input handling, backend Zod validation, PostgreSQL foreign keys and check constraints, unique references, and atomic repayment transactions. The database remains the final authority for balances and accepted repayments.

## 12. Known Limitations and Future Improvements

- Single authorized staff account rather than multi-user role-based access control.
- No comprehensive audit log or approval workflow.
- No automated cleanup for integration test records.
- No separate automated CI test pipeline or isolated production/staging/test environments.
- Limited reporting, filtering, and pagination.
- Additional concurrency, authorization, and negative-input tests would strengthen coverage.
- Further accessibility, monitoring, backup, and security work would be required for real financial operations.

## 13. AI Assistance Disclosure

AI assistance was used for architecture discussions, code generation, troubleshooting, database design, automated test preparation, and documentation drafting. Suggested changes were reviewed and adjusted during implementation. The application was manually exercised, deployed to Supabase and Cloudflare Pages, and verified through three passing automated integration tests against the deployed backend.

## 14. Assessment Summary

This project demonstrates relational database design, authenticated backend APIs, monetary data handling, transactional repayment integrity, automated integration testing, and deployment of a React frontend on Cloudflare Pages connected to Supabase.

**Core principle:** Financial correctness must be enforced by the backend and database, not only by the user interface.

---

Developed for the **Inuka Africa Software Development Internship Technical Assessment**.
