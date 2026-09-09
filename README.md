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

This repository holds three things:

1. **`client/` + `server/` at the root** - the combined site. One login
   (N Danushika's real Registration & Login), one running app, with
   Attendance & Payment (M T Madushanka) as protected pages behind that
   same login. This is what you deploy / demo.
2. **`M T Madushanka/` and `N Danushika/`** - each contributor's own
   complete, independently runnable copy of their module, for individual
   review and submission. The combined app mounts their *actual* server
   route files directly (not copies), so there is one source of truth for
   the server-side logic either way.
3. **`shared/`** - the one place for everything genuinely common to the
   **whole NexusDev team** (env validation, the MySQL pool, JWT/RBAC
   middleware, rate limiters, the safe-DTO helper, common UI components,
   the institute logo and other brand assets) - not just Attendance/Payment
   and Registration/Login. When C D Kumanan, H A S Hapuarachchi or
   S Vithushan add Course Management, Feedback & Complaint, or
   Admin & Notifications, their code should import from here too, instead
   of copy-pasting a second version of the logo, the auth middleware, etc.

```
Brilliant-Institute-Web-app/
├── sql/schema.sql                  Shared MySQL schema (kept once for the whole team)
├── client/ + server/                THE COMBINED SITE - run this one (see Getting Started)
├── shared/                         Code identical across every module - see note below
│   ├── server/src/
│   │   ├── config/                 env.js, db.js, roles.js
│   │   ├── middleware/             auth, RBAC, rate limiting, CSRF, error handling
│   │   └── utils/                  ApiError, safe DTO mappers, audit log, password policy
│   └── client/
│       ├── public/favicon.jpeg     The one favicon file - every app's vite.config.js
│       │                          points its publicDir here instead of keeping a copy
│       └── src/
│           ├── api/httpClient.js
│           ├── assets/             logo.jpeg (institute crest) - and any future shared images
│           ├── components/common/  Alert, FormField, Icon, Logo, PasswordStrength, StatCard, LoadingSpinner
│           ├── components/layout/  AuthLayout, Footer, PortalShell, navItems.js
│           └── pages/NotFoundPage.jsx
│
├── M T Madushanka/                 Attendance & Payment module (SRS ATP-01..ATP-07)
│   ├── server/
│   │   ├── scripts/seed.js         Demo tutor + student + class
│   │   └── src/
│   │       ├── modules/session/    Placeholder login only (real login is N Danushika's)
│   │       ├── modules/attendance/
│   │       ├── modules/payment/
│   │       ├── app.js
│   │       └── server.js
│   └── client/src/
│       ├── api/                    sessionApi (placeholder), attendanceApi, paymentApi
│       ├── pages/attendance/, pages/payment/, pages/PlaceholderLoginPage.jsx
│       ├── context/AuthContext.jsx, components/layout/{Navbar,ProtectedRoute}.jsx
│       └── App.jsx
│
└── N Danushika/                    Registration & Login module (SRS REG-01..REG-08)
    ├── server/src/modules/auth/
    └── client/src/
        ├── api/authApi.js
        ├── pages/auth/
        ├── context/AuthContext.jsx, components/layout/{Navbar,ProtectedRoute}.jsx
        └── App.jsx
```

> **Why `shared/` exists:** `config/`, `middleware/`, `utils/`, `httpClient.js`,
> the common UI components, the institute logo, and the 404 page were
> byte-for-byte identical in both folders - env validation, the MySQL pool,
> JWT/RBAC middleware, rate limiters, the safe-DTO helper, the brand crest.
> No single module "owns" them, so they live once here and every app
> (present and future) imports them via a relative path into `shared/`,
> instead of each contributor keeping their own copy of the logo or
> re-implementing the same middleware.
>
> **What's deliberately NOT in `shared/`**, even though a couple of these
> files look similar at a glance: `AuthContext.jsx`, `Navbar.jsx`, `App.jsx`,
> `HomePage.jsx` and each module's `package.json` are genuinely different per
> module (different routes, different login mechanism) - and `ProtectedRoute.jsx`
> was textually identical but depends on each module's own `AuthContext`, so
> it stays duplicated rather than creating a hidden cross-module dependency.
>
> **Why `index.html`, `main.jsx`, `vite.config.js`, `package.json`, `.env`
> and `tsconfig.json` still exist once per app, even though their content
> currently matches:** these aren't application code Vite bundles together -
> they're each app's own *project root*. Vite (and npm) require `index.html`
> and `package.json` to physically exist at the folder you run `npm run dev`
> from; there's no supported way to point three separate Vite projects at
> one shared `index.html` without hand-rolling a build step, which would
> trade a handful of tiny boilerplate files for real fragility. Everything
> that actually *can* be pointed at one shared copy safely already is -
> `vite.config.js`'s `publicDir` option makes the favicon one real file
> (`shared/client/public/favicon.jpeg`), not three.
>
> **Node.js can't see a sibling folder's `node_modules`** - it only looks in
> the requiring file's own folder and upward from there. So `shared/server`
> has a small `package.json` of its own for the few packages its code needs
> (see step 2 below), and `shared/client`'s packages are resolved through an
> alias in each app's `vite.config.js` pointing at that app's own
> `node_modules` instead.

## Getting Started

### 1. Database

```bash
mysql -u root -p < sql/schema.sql
```

### 2. Run the combined site

`shared/server` has a few packages of its own (`dotenv`, `mysql2`, etc.) that
its code needs - install those once, then run the site as usual:

```bash
cd shared/server && npm install && cd ../..

cd server
cp .env.example .env         # fill in your DB password + a generated JWT_SECRET
npm install
npm run db:seed              # optional: creates a demo tutor + student + class
npm run dev                  # http://localhost:5000
```

```bash
cd client
cp .env.example .env
npm install
npm run dev                  # http://localhost:5173
```

Open **http://localhost:5173** - register an account (or log in with a demo
account below), and every page - profile, mark attendance, fee balance,
payment history - is reachable from that one login.

Demo accounts created by `npm run db:seed` (password `Demo@1234` unless you
set `SEED_DEMO_PASSWORD`):

| Role    | Email                  |
|---------|------------------------|
| Tutor   | tutor@brilliant.test   |
| Student | student@brilliant.test |

### 3. Run one person's module standalone instead

Each contributor's folder is also a complete, independently runnable app on
its own ports (useful for individually reviewing just that person's work):

```bash
cd "M T Madushanka/server"   # or: cd "N Danushika/server"
cp .env.example .env
npm install
npm run dev                  # M T Madushanka: http://localhost:5000, N Danushika: http://localhost:5001
```

```bash
cd "M T Madushanka/client"   # or: cd "N Danushika/client"
cp .env.example .env
npm install
npm run dev                  # M T Madushanka: http://localhost:5173, N Danushika: http://localhost:5174
```

M T Madushanka's standalone copy ships a placeholder login (the real one is
N Danushika's module) so it can be tested without her code. Only her server
has `npm run db:seed`.
To test N Danushika's module, register a new account via the Register page.

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
