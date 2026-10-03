# Tuition Class Management System

**Brilliant Institute**  
Group: **NexusDev (WD_G13)**

A full-stack web application designed to digitize and centralize the day-to-day operations of a private tuition institute. The system handles student registration, class scheduling, digital attendance, online fee payments, feedback/complaints, and automated notifications.

---

## Features

- Secure registration & role-based login (Student/Parent, Tutor, Admin)
- Course & class management: browse/search/filter, enrol/drop, tutor CRUD with conflict-free scheduling (CRS-05)
- Digital attendance marking and low-attendance alerts
- Online fee payment with digital receipts
- Feedback & complaint portal with a staff triage queue
- Admin dashboard (users/classes/revenue/complaints), user management, announcements, and automated fee/attendance reminders
- Reports centre for admins: 13 reports (institute summary, students, tutors, accounts, classes & timetable, attendance, fees & payments, tutor payouts, feedback, enquiries, announcements, re-registration, audit trail), shown on screen and downloadable as branded PDFs. Tutor and student reports include everything each person did on the site (activity log, attendance registers, messages, payments), and can be downloaded as one PDF per person in a ZIP. Every report also downloads as a formatted Excel workbook (ExcelJS)
- Analytics dashboard for admins: interactive charts for fees, payouts, attendance (with a class-by-week heat map), tutors, classes, growth, feedback and site use, built with Apache ECharts - click a tutor or class to open its full report
- Password reset codes emailed from the institute's official address, brilliantinstitute.edu@gmail.com

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

1. **`client/` + `server/` at the root** - the combined site: one login
   (N Danushika's Registration & Login), one running app, with every other
   module's pages mounted behind that same login. This is what you deploy
   / demo. All five modules are wired in:
   - Registration & Login (N Danushika)
   - Attendance & Payment (M T Madushanka)
   - Course Management (C D Kumanan)
   - Feedback & Complaint (H A S Hapuarachchi)
   - Admin, Notifications & Announcements (S Vithushan)
2. **One folder per contributor** (`M T Madushanka/`, `N Danushika/`,
   `C D Kumanan/`, `H A S Hapuarachchi/`, `S Vithushan/`) - each a
   complete, independently runnable copy of that person's module, for
   individual review and submission. The combined app mounts their
   *actual* server route files directly (not copies), so there is one
   source of truth for the server-side logic either way; client-side pages
   are identical copies in both places (see the note on `index.html` etc.
   below for why client code can't be mounted the same way server code is).
3. **`shared/`** - the one place for everything genuinely common to the
   **whole NexusDev team** (env validation, the MySQL pool, JWT/RBAC
   middleware, rate limiters, the safe-DTO helper, common UI components,
   the institute logo and other brand assets), so no module copy-pastes a
   second version of the logo, the auth middleware, etc.

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
├── N Danushika/                    Registration & Login module (SRS REG-01..REG-08)
│   ├── server/src/modules/auth/
│   └── client/src/{api/authApi.js, pages/auth/, context/, components/layout/, App.jsx}
│
├── M T Madushanka/                 Attendance & Payment module (SRS ATP-01..ATP-07)
│   ├── server/
│   │   ├── scripts/seed.js         Demo tutor + student + class
│   │   └── src/modules/{session (placeholder login), attendance/, payment/}
│   └── client/src/{api/, pages/attendance/, pages/payment/, App.jsx}
│
├── C D Kumanan/                    Course Management module (SRS CRS-01..CRS-06)
│   ├── server/src/modules/course/  browse/search/filter, tutor CRUD, CRS-05 conflict detection
│   └── client/src/pages/courses/   BrowseClasses, ClassDetails, MyCourses, ManageClasses, CreateEditClass
│
├── H A S Hapuarachchi/             Feedback & Complaint module (SRS FBC-01..FBC-04)
│   ├── server/src/modules/feedback/
│   └── client/src/pages/feedback/  SubmitFeedbackPage (student/tutor), StaffFeedbackPage (tutor/admin triage)
│
└── S Vithushan/                    Admin, Notifications & Announcements module (SRS ADM-01..ADM-04)
    ├── server/src/modules/admin/   dashboard stats, user mgmt, announcements, mock Email/SMS reminders
    ├── server/src/modules/reports/ admin reports: PDF (pdfmake), Excel (ExcelJS), analytics data - one file per report in builders/
    └── client/src/pages/admin/     AdminDashboardPage, ManageUsersPage, AnnouncementsPage
```

Every module folder above follows the same internal shape: `server/` has
`src/app.js` + `src/server.js` + `src/modules/<feature>/` (routes →
controller → service → repository → validation, plus a `session/`
placeholder login for standalone testing) and `client/` has its own
`package.json`, `vite.config.js`, `App.jsx`, `AuthContext.jsx`, `Navbar.jsx`
and page components under `src/pages/`.

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

The combined `server/` requires each module's *actual* route files
directly out of their own folder (see above) - Node resolves each of
those file's own `require()` calls starting from **that file's own
folder**, not from `server/`. So every module's own `server/node_modules`
has to exist too, not just the root one:

```bash
cd shared/server && npm install && cd ../..

for dir in "N Danushika/server" "M T Madushanka/server" "C D Kumanan/server" "H A S Hapuarachchi/server" "S Vithushan/server" server; do
  (cd "$dir" && npm install)
done

cd server
cp .env.example .env         # fill in your DB password + a generated JWT_SECRET
npm run db:seed              # creates the default Admin/Tutor/Student logins (see below) + a demo class
npm run dev                  # http://localhost:5000
```

> **Email (password reset codes)** is sent from brilliantinstitute.edu@gmail.com.
> Sign in to that Gmail account, turn on 2-Step Verification, create an app
> password (Google Account -> Security -> App passwords) and paste it into
> `server/.env` as `SMTP_PASS`. Then check it with
> `npm run mail:test -- you@example.com`. Until then, development uses a free
> test inbox and the server log prints a link to each email.

> **There is no separate "admin sign-up" screen** - creating the very first
> admin account has to happen server-side, since anyone who could self-register
> as Admin from the public `/register` page would defeat the point of an
> Admin role. `npm run db:seed` is that step: it inserts one ready-to-use
> Admin account (bcrypt-hashed password, same as any other account) directly
> into the database, alongside the demo Tutor and Student. Skip this step and
> there is no way to reach `/admin/*` until someone manually promotes a user's
> `role` to `ADMIN` in the database. Once you have one admin login, that
> account creates every other admin/tutor account from then on (see
> "Tutor Enrollment Keys" in Manage Users) - `db:seed` only ever needs to run
> once per database.

```bash
cd client
cp .env.example .env
npm install
npm run dev                  # http://localhost:5173
```

Open **http://localhost:5173** - register an account (or log in with a demo
account below), and every page - profile, browse/manage classes, mark
attendance, fee balance, feedback tickets, and (for the admin account) the
operations dashboard - is reachable from that one login.

Each module's own `npm run db:seed` creates that module's own demo data (a
demo tutor/student, plus its module-specific rows - a class, a feedback
ticket, an announcement, ...) using `INSERT ... IF NOT EXISTS`-style upserts,
so it's safe to run all five without duplicating the shared demo accounts:

```bash
for dir in server "C D Kumanan/server" "H A S Hapuarachchi/server" "S Vithushan/server"; do
  (cd "$dir" && npm run db:seed)
done
```

Demo accounts (password `Demo@1234` unless you set `SEED_DEMO_PASSWORD`):

| Role    | Email                  |
|---------|------------------------|
| Admin   | admin@brilliant.test   |
| Tutor   | tutor@brilliant.test   |
| Student | student@brilliant.test |

### 3. Run one person's module standalone instead

Each contributor's folder is also a complete, independently runnable app
(useful for individually reviewing just that person's work). All five
default to the same ports (`5000` server / `5173` client) since they're
meant to be run **one at a time** - change `PORT` in that module's `.env`
and the `server.port` in its `vite.config.js` if you need two running
together (N Danushika's is already offset to `5001`/`5174` as an example):

```bash
cd "C D Kumanan/server"   # or any of: "N Danushika/server", "M T Madushanka/server",
                          #            "H A S Hapuarachchi/server", "S Vithushan/server"
cp .env.example .env
npm install
npm run dev
```

```bash
cd "C D Kumanan/client"   # the matching client/ for whichever module you picked above
cp .env.example .env
npm install
npm run dev                  # http://localhost:5173
```

Every module except N Danushika's ships a **placeholder login** (the real
Registration & Login is her module) so the rest of the module can be
reviewed without her code - `npm run db:seed` in that module's `server/`
creates a demo tutor/student/admin plus whatever that module needs to be
useful standalone (a browsable class, a feedback ticket, an announcement).
To test N Danushika's module itself, register a new account via the
Register page - it has no seed script since it has no data of its own to
seed beyond what registration already creates.

| Role    | Email                  |
|---------|------------------------|
| Admin   | admin@brilliant.test   |
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

**Before real deployment:** follow [HOSTING.md](HOSTING.md) (domain, Railway or a Node.js host, email, Google). Rotate `JWT_SECRET`, set `NODE_ENV=production`
(enables `Secure` cookies), point `PAYMENT_GATEWAY_*` at a real PCI-compliant
provider, and run `npm audit` on both `server/` and `client/`.

> **Deployment note on cookies:** the session cookie uses `SameSite=Strict`,
> which only travels between pages on the *same site* (same registrable
> domain - `localhost:5173` ↔ `localhost:5000` counts as one site, as would
> `app.brilliantinstitute.com` ↔ `api.brilliantinstitute.com`). Deploy the
> frontend and API under the same domain; putting them on two unrelated
> domains would cause the browser to silently drop the cookie.
