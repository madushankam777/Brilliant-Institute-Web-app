# Tuition Class Management System

**Brilliant Institute**  
Group: **NexusDev (WD_G13)**

A full-stack web application designed to digitize and centralize the day-to-day operations of a private tuition institute. The system handles student registration, class scheduling, digital attendance, online fee payments, feedback/complaints, and automated notifications.

---

## Features

- Secure registration & role-based login (Student/Parent, Tutor, Admin)
- Course & class management with conflict-free scheduling
- Digital attendance marking and low-attendance alerts
- Online fee payment with digital receipts
- Feedback & complaint portal
- Automated email/SMS notifications
- Admin dashboard for users, classes, and payments

---

## Tech Stack

| Layer            | Technology              |
|------------------|-------------------------|
| Frontend         | React.js                |
| Backend          | Node.js + Express       |
| Database         | MySQL                   |
| UI/UX Design     | Figma                   |
| Version Control  | Git & GitHub            |
| Authentication   | JWT + bcrypt            |
| Payments         | PCI-compliant Gateway   |

---

## Project Structure

This branch holds the **Attendance & Payment** module (SRS ATP-01..ATP-07,
owner: M T Madushanka). The **Registration & Login** module (REG-01..REG-08,
owner: N Danushika) is authored separately.

```
Brilliant-Institute-Web-app/
├── sql/schema.sql                 Shared MySQL schema (not part of this module, kept once for the team)
└── M T Madushanka/
    ├── server/                    Node.js + Express REST API
    │   ├── scripts/seed.js        Demo tutor + student + class
    │   ├── .env.example
    │   └── src/
    │       ├── config/            env.js, db.js, roles.js
    │       ├── middleware/        auth, RBAC, rate limiting, CSRF, error handling
    │       ├── utils/             ApiError, safe DTO mappers, audit log
    │       ├── modules/
    │       │   ├── session/       Placeholder login only (real login is a separate module)
    │       │   ├── attendance/    Attendance marking
    │       │   └── payment/       Fee payments
    │       ├── app.js
    │       └── server.js
    └── client/                    React (Vite) frontend
        └── src/
            ├── api/               httpClient, sessionApi (placeholder), attendanceApi, paymentApi
            ├── pages/attendance/  Class sessions, Mark Attendance, Attendance History
            ├── pages/payment/     Fee Balance (pay), Payment History
            └── pages/PlaceholderLoginPage.jsx
```

> This module does not include the real login - it ships a clearly-labelled
> placeholder (`modules/session`, `PlaceholderLoginPage.jsx`) so the
> Attendance & Payment pages can be reached and tested on their own.
>
> The SQL schema (`users`, `classes`, `class_sessions`, `enrollments`,
> `attendance_records`, `payments`, `receipts`, `audit_log`) is not part of
> this repository - set it up separately in your own MySQL database.

## Getting Started

### 1. Database

Create the schema above in MySQL (see your project's shared schema file).

### 2. Backend API

```bash
cd "M T Madushanka/server"
cp .env.example .env      # fill in your DB password + a generated JWT_SECRET
npm install
npm run db:seed           # optional: creates a demo tutor + student + class
npm run dev                # http://localhost:5000
```

### 3. Frontend

```bash
cd "M T Madushanka/client"
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

Demo accounts created by `npm run db:seed` (password `Demo@1234` unless you
set `SEED_DEMO_PASSWORD`):

| Role    | Email                  |
|---------|------------------------|
| Tutor   | tutor@brilliant.test   |
| Student | student@brilliant.test |

To mark attendance as the demo tutor, check the class id created by the seed
script (`SELECT id FROM classes;`) and enter it on the "Mark Attendance" page.

## Security & Compliance Notes

This codebase was built and audited against the SRS's security/compliance
requirements (§4.3, §6.2) and the OWASP Top 10:

| Concern | How it's addressed |
|---|---|
| SQL Injection | Every query uses parameterised `?` placeholders (see any `*.repository.js`); no string concatenation. |
| Broken Authentication | Passwords hashed with bcrypt (cost 12); account lockout after repeated failed logins; strong password policy enforced server-side. |
| Session handling / XSS | JWT is stored in an **httpOnly, SameSite=Strict** cookie - never in `localStorage`, so it cannot be stolen via XSS. |
| CSRF | SameSite=Strict cookie + a custom `X-Requested-With` header required on every state-changing request (`middleware/csrfGuard.js`). |
| Broken Access Control | Role-based middleware (`authorize.js`) plus ownership checks in every service (a tutor can only touch their own classes; a student can only pay/view their own records). |
| Sensitive Data Exposure | Every API response is built from a "safe DTO" mapper (`utils/sanitize.js`) - fields like `password_hash` can never leak to the frontend. |
| Missing rate limiting | `express-rate-limit` on all routes, with a stricter limit on `/auth/*` to slow down brute-force/credential-stuffing. |
| Hardcoded secrets | All secrets/config come from environment variables (`config/env.js`), which **fails fast at startup** if any required variable is missing. `.env` is git-ignored; only `.env.example` (placeholders) is committed. |
| Security Misconfiguration | `helmet()` security headers, strict CORS allow-list (never `*` with credentials), centralised error handler that never leaks stack traces/SQL errors to the client. |
| Payment / PCI-DSS | No card data ever reaches this server - see `modules/payment/paymentGateway.js`. Only a gateway-issued reference id is stored. |
| Audit Logging | `audit_log` table records logins, profile/password changes, attendance corrections, and payment outcomes (SRS §6.2). |
| Business rule integrity | Payments run inside DB transactions so a balance can never be decremented without a corresponding successful, committed payment/receipt (SRS §4.5). |

**Before real deployment:** rotate `JWT_SECRET`, set `NODE_ENV=production`
(enables `Secure` cookies), point `PAYMENT_GATEWAY_*` at a real PCI-compliant
provider, and run `npm audit` on both `server/` and `client/`.

> **Deployment note on cookies:** the session cookie uses `SameSite=Strict`,
> which only travels between pages on the *same site* (same registrable
> domain - `localhost:5173` ↔ `localhost:5000` counts as one site, as would
> `app.brilliantinstitute.com` ↔ `api.brilliantinstitute.com`). Deploy the
> frontend and API under the same domain; putting them on two unrelated
> domains would cause the browser to silently drop the cookie.
