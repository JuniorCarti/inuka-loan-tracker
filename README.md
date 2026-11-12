# Inuka Africa — Loan Repayment Tracker

A web-based loan repayment tracking application developed as part of the **Inuka Africa Software Development Internship Technical Assessment**.

The application allows an authorized staff user to register clients, create loans, record repayments, and view loan balances and repayment histories.

The solution prioritizes **financial accuracy, database integrity, secure access, and reliable repayment processing**.

## 1. Features

### Client Registration
- Register clients using a unique client number and name.
- Store client information in PostgreSQL.
- Prevent duplicate client numbers.

### Loan Management
- Create loans associated with registered clients.
- Assign a unique loan reference.
- Record the principal and total amount due in Kenyan shillings (KES).
- Track total repayments and outstanding balances.

### Repayment Processing
- Record repayments against existing loans.
- Require a unique payment reference, positive amount, and payment date.
- Reject duplicate payment references.
- Prevent repayments exceeding the outstanding loan balance.
- Reject repayments against nonexistent loans.
- Maintain a repayment history for each loan.

### Loan Summary
- View the associated client and loan reference.
- View the original amount due.
- View the total amount repaid.
- View the remaining outstanding balance.
- Review recorded repayments.

## 2. Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend API | Supabase Edge Functions (Deno) |
| Database | PostgreSQL (Supabase) |
| Authentication | Supabase Auth |
| Input validation | Zod |
| Automated testing | Vitest |
| Source control | Git and GitHub |

## 3. System Architecture

The application follows a client-server architecture:

```text
React + TypeScript Frontend
            |
            | Authenticated HTTPS requests
            v
Supabase Edge Function (loan-api)
            |
            | Validate input and staff authorization
            v
PostgreSQL Database
            |
            | Atomic repayment function
            v
Clients / Loans / Repayments
```

The frontend does not directly modify financial records.

Instead, financial operations are handled by the backend, which validates requests and communicates with PostgreSQL.

## 4. Database Design

The database contains three main tables.

### clients

Stores registered borrowers.

| Column | Description |
|---|---|
| id | UUID primary key |
| client_number | Unique client identifier |
| name | Client name |

### loans

Stores loans associated with clients.

| Column | Description |
|---|---|
| id | UUID primary key |
| client_id | Foreign key referencing clients |
| loan_reference | Unique loan reference |
| principal_cents | Original principal |
| total_due_cents | Total amount payable |
| total_repaid_cents | Total repayments recorded |

### repayments

Stores individual loan repayments.

| Column | Description |
|---|---|
| id | UUID primary key |
| loan_id | Foreign key referencing loans |
| payment_reference | Unique payment reference |
| amount_cents | Repayment amount |
| payment_date | Date of repayment |

### Relationships

```text
clients (1)
    |
    | One client can have many loans
    v
loans (many)
    |
    | One loan can have many repayments
    v
repayments (many)
```

Foreign keys preserve relationships between records.

Unique constraints and indexes prevent duplicate business identifiers.

Check constraints enforce important financial rules.

### Monetary Representation

Financial amounts are stored as **integer cents**, rather than floating-point numbers.

For example:

| Amount in KES | Stored value |
|---|---:|
| KES 1,000.00 | 100000 |
| KES 3,000.00 | 300000 |
| KES 10,000.00 | 1000000 |

This avoids floating-point rounding problems when calculating repayments and outstanding balances.

## 5. Repayment Business Logic

The outstanding loan balance is calculated as:

```text
Outstanding Balance = Total Amount Due - Total Amount Repaid
```

### Example

A client has a loan with:

- Total amount due: KES 10,000
- Repayment received: KES 3,000

The outstanding balance becomes:

```text
KES 10,000 - KES 3,000 = KES 7,000
```

### Validation Rules

Before accepting a repayment, the system checks that:

1. The loan exists.
2. The payment reference is valid and unique.
3. The repayment amount is greater than zero.
4. The repayment amount does not exceed the outstanding balance.
5. The payment date is valid.

If a validation or database operation fails, the repayment transaction is rejected.

### Atomic Repayment Processing

Repayments are processed through the PostgreSQL function:

`public.record_repayment`

The function performs the following operations within a single database transaction:

1. Validates the repayment details.
2. Locks the relevant loan record using `SELECT ... FOR UPDATE`.
3. Checks the outstanding balance.
4. Inserts the repayment record.
5. Updates the loan's total repaid amount.

This design prevents concurrent repayment requests from independently spending the same outstanding balance.

If an operation fails, PostgreSQL rolls back the transaction so that the repayment record and loan balance remain consistent.

Database uniqueness constraints also protect against duplicate payment references.

## 6. Security Design

The application uses several security measures:

- Staff authentication through Supabase Auth.
- Server-side authorization for access to the loan API.
- Input validation using Zod.
- Row Level Security enabled on financial tables.
- Direct anonymous and authenticated access to financial tables restricted.
- Service-role credentials kept on the backend, not in the frontend.
- Repayment processing performed through a controlled PostgreSQL function.
- Database constraints as an additional layer of protection.

The current implementation is intended as a technical assessment prototype, not a production-ready multi-user microfinance platform.

## 7. Project Structure

```text
inuka-loan-tracker/
├── public/
├── src/
│   ├── lib/
│   │   └── supabase.ts
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   ├── functions/
│   │   └── loan-api/
│   │       └── index.ts
│   ├── migrations/
│   └── config.toml
├── tests/
│   └── loan-api.integration.test.ts
├── .gitignore
├── package.json
├── vite.config.ts
├── vitest.config.ts
└── README.md
```

## 8. Local Setup

### Prerequisites

- Node.js and npm
- A Supabase project
- Supabase CLI access
- An authorized test staff account

### Install Dependencies

Clone the repository and install dependencies:

```bash
git clone <REPOSITORY_URL>
cd inuka-loan-tracker
npm install
```

### Configure Frontend Environment Variables

Create a `.env.local` file in the project root:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Use the public/publishable key for the frontend.

Never place the Supabase service-role key in a `VITE_` environment variable.

### Database Setup

Link the Supabase CLI to your project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Apply the included database migrations:

```bash
npx supabase db push --remote
```

These migrations create the application tables, constraints, indexes, access restrictions, and repayment-processing function.

### Backend Configuration

The Edge Function requires the following server-side configuration:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STAFF_USER_ID`

`STAFF_USER_ID` identifies the authorized Supabase Auth user for this assessment.

Configure the required backend environment variables securely in Supabase. Do not commit credentials to Git.

Deploy the Edge Function:

```bash
npx supabase functions deploy loan-api
```

Ensure the deployment's authentication configuration matches the application's Supabase project and API key setup.

### Start the Frontend

```bash
npm run dev
```

Open the local address displayed by Vite, normally:

`http://localhost:5173`

Sign in using the configured authorized staff account.

## 9. Automated Testing

Automated integration tests are implemented using Vitest.

The tests exercise the deployed Edge Function and PostgreSQL database rather than mocking the repayment logic.

### Test Cases

**Test 1 — Repayment Calculation**

Given a loan with KES 10,000 due, when a repayment of KES 3,000 is recorded, the outstanding balance must be KES 7,000.

**Test 2 — Duplicate Payment Reference**

When the same payment reference is submitted twice, the second request must be rejected and the repayment must not be recorded twice.

**Test 3 — Overpayment Prevention**

Given a loan with KES 1,000 outstanding, a repayment of KES 1,500 must be rejected without changing the loan balance.

### Configure Test Environment

Create `.env.test.local`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
TEST_STAFF_EMAIL=YOUR_AUTHORIZED_TEST_EMAIL
TEST_STAFF_PASSWORD=YOUR_TEST_PASSWORD
```

Use a dedicated test Supabase project when possible.

These tests create fictional clients, loans, and repayment records in the connected database.

### Run Tests

```bash
npx vitest run tests/loan-api.integration.test.ts --mode test
```

### Verified Test Result

The following result was obtained during development:

```text
Test Files  1 passed (1)
Tests       3 passed (3)
```

All three required repayment scenarios passed against the deployed Supabase backend.

## 10. Code Quality Checks

Run the production build:

```bash
npm run build
```

Run ESLint:

```bash
npm run lint
```

Both commands completed successfully during development.

## 11. Error Handling and Data Integrity

The application protects data consistency through multiple layers:

- Frontend validation for user input.
- Backend request validation using Zod.
- PostgreSQL check constraints for valid financial amounts.
- Unique constraints and indexes for business references.
- Foreign keys for relational integrity.
- Transactional repayment processing.
- Loan-row locking to prevent concurrent balance inconsistencies.

The database is the final authority for financial correctness, rather than relying solely on frontend calculations.

## 12. Known Limitations and Future Improvements

The current system is a focused assessment implementation.

Potential improvements include:

- Support for multiple staff accounts and role-based permissions.
- Client and loan search functionality.
- Pagination and filtering for repayment histories.
- Reporting and downloadable statements.
- More comprehensive audit logging.
- Automated test data cleanup.
- Separate development, testing, and production environments.
- Improved accessibility and user interface design.
- Additional automated tests covering concurrency and authorization.

## 13. AI Assistance Disclosure

AI assistance was used during development for technical guidance, code generation, troubleshooting, database design discussions, automated test preparation, and documentation drafting.

The implementation was configured, deployed, and tested in the development environment, with manual verification of the client registration, loan creation, and repayment workflows.

The three required automated integration tests were executed successfully against the deployed backend.

AI-generated suggestions were reviewed and adjusted during development, including corrections to environment configuration and test authentication.

## 14. Assessment Summary

This project demonstrates:

- Relational database design.
- Backend API development.
- Financial business-rule validation.
- Transactional data integrity.
- Authentication and authorization.
- Automated integration testing.
- Frontend and backend integration.

The central design principle is that **financial correctness must be enforced at the database and backend layers, not only in the user interface**.

---

Developed for the Inuka Africa Software Development Internship Technical Assessment.