# Registration & Login Module — N Danushika

**Brilliant Institute Tuition Class Management System** · Group: NexusDev (WD_G13)
**SRS requirements:** REG-01 to REG-08

A complete, independently runnable app for the Registration & Login module.

> **Not included in this folder, on purpose:**
> - The Attendance & Payment module (ATP-01..ATP-07) — that's M T
>   Madushanka's module, in `../M T Madushanka/`.
> - The SQL schema — shared by both modules, kept once at the project root:
>   `../sql/schema.sql`.

## What's here

```
server/src/modules/auth/
├── auth.controller.js       HTTP layer (register, login, profile, password reset)
├── auth.service.js          Business logic (lockout, JWT issuing, token hashing)
├── auth.repository.js       All SQL for users / password_reset_tokens
├── auth.routes.js           Express route table, mounted at /api/auth
└── auth.validation.js       express-validator rules

client/src/
├── pages/auth/
│   ├── LoginPage.jsx             Log in
│   ├── RegisterPage.jsx          Create an account
│   ├── ForgotPasswordPage.jsx    Request a password reset email
│   ├── ResetPasswordPage.jsx     Set a new password from the emailed token
│   └── ProfilePage.jsx           View/update profile, change password
└── api/
    └── authApi.js                Frontend API client for the auth endpoints
```

`server/src/config`, `middleware`, `utils` and `client/src/components`,
`context`, `api/httpClient.js` are the small shared/neutral files both
modules need to run (env validation, the MySQL pool, JWT/RBAC middleware,
rate limiters, the safe-DTO helper, the base HTTP client) — see the root
README for why they're duplicated rather than shared from one folder.

## CRUD summary

| Operation | Endpoint                          | Description                          |
|-----------|------------------------------------|---------------------------------------|
| Create    | `POST /api/auth/register`          | Create a new account                  |
| Read      | `GET /api/auth/me`                 | Fetch the logged-in user's profile    |
| Update    | `PUT /api/auth/me`                 | Update profile / change password      |
| (Login)   | `POST /api/auth/login`             | Authenticate, issue a session cookie  |
| (Reset)   | `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` | Password recovery |

## Getting Started

### 1. Database

Set up the shared schema (`../sql/schema.sql`) in MySQL.

### 2. Run the API

```bash
cd server
cp .env.example .env      # fill in your DB password + a generated JWT_SECRET
npm install
npm run dev                # http://localhost:5000
```

### 3. Run the frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

Go to `/register` to create an account, then `/login` to sign in and
`/profile` to view/update it.

## Security notes

- Passwords hashed with **bcrypt** (cost factor 12) — never stored or
  returned in plaintext; `password_hash` is stripped from every API
  response by `utils/sanitize.js`.
- Account lockout after repeated failed logins (configurable via
  `MAX_FAILED_LOGIN_ATTEMPTS` / `ACCOUNT_LOCKOUT_MINUTES`), to slow down
  brute-force attacks.
- Strong password policy enforced **server-side** (`utils/passwordPolicy.js`)
  — never trusted from the frontend alone.
- Password reset tokens are single-use, time-limited, and stored as a
  **SHA-256 hash** (never the raw token) in `password_reset_tokens`.
- JWT session token is stored in an **httpOnly, SameSite=Strict** cookie,
  never in `localStorage` — cannot be stolen via XSS.
- Rate limiting (`express-rate-limit`), with a stricter limit on
  `/api/auth/*` to slow down credential-stuffing.
- Every SQL query uses parameterised `?` placeholders — no string
  concatenation, anywhere.
