# Hosting the Brilliant Institute site

This guide puts the site online at **https://brilliantinstitute.edu.lk**. The website and the API run as **one Node.js app** with **one MySQL database**. The session cookie only works when both share one address, and this setup gives them one.

## 1. Pick a hosting option

| Option | Laptop must stay on? | Cost (Oct 2026) | Best for |
|---|---|---|---|
| **A. Railway** (cloud) | No | about US$5–7 a month (Hobby plan: US$5 including US$5 of usage, plus any extra usage; new accounts get a one-time US$5 trial for 30 days) | The easiest path, already rehearsed with this code |
| **B. SriLanka Hosting – Node.js hosting** (Plesk) | No | from LKR 504 a month | Paying in rupees; ask them the questions in section 4 first |
| **C. Your laptop + Cloudflare Tunnel** | **Yes** | free | A short demo while someone watches the laptop |

Shared **cPanel** plans (for example SriLanka Hosting "S-BIS") are made for PHP/WordPress sites. This site needs **Node.js 20 or newer**, so do not buy one unless the host confirms that the plan runs Node.js apps.

The app needs about **185 MB of disk** (server packages plus the built website, with no native binaries). The database is a few MB.

## 2. Get the domain

1. Search the name at **https://www.domains.lk** (the LK Domain Registry) or at a reseller.
   - `brilliantinstitute.edu.lk` is a "second level domain only" name: about **LKR 950–1,000 a year**.
   - At SriLanka Hosting, tick **Domain only** in the cart if you host elsewhere.
2. `.edu.lk` is meant for educational organisations. The registrar checks every order and may ask for proof (for example a business registration or a letter) within 3 days. Have it ready.
3. Use a **free Cloudflare account** for DNS:
   - Add the domain at https://dash.cloudflare.com.
   - Change the domain's nameservers (in the registrar or reseller panel) to the two Cloudflare names it shows.
   - This lets you add the records for Railway, the email service and Google yourself.

If you use another domain instead, replace `brilliantinstitute.edu.lk` in these files (23 places):
- `client/index.html`
- `client/vite.config.js`
- `shared/client/public/robots.txt`
- `shared/client/public/sitemap.xml`
- `shared/client/src/constants/institute.js`
- `shared/server/src/config/env.js`
- `scripts/host.js`
- `server/.env.example`

## 3. Option A – Railway (step by step)

### 3.1 Copy the database
On the computer that has the real data:

```
cd server
npm run db:export
```

This writes `database-export/<name>-<date>.sql`. It holds real accounts and payments: **never commit or share it** (the folder is in `.gitignore`).

### 3.2 Create the project
1. Sign in at https://railway.com with GitHub. Choose **New Project → Deploy from GitHub repo** and pick this repository.
2. In the same project, choose **+ New → Database → MySQL**.
3. Open the web service's **Settings**:
   - **Build command:** `npm run build`. This installs every folder's packages and builds the website.
   - **Start command:** `npm start`
   - **Healthcheck path:** `/api/health`

### 3.3 Variables (web service → Variables)

```
NODE_ENV=production
SERVE_CLIENT=true
TRUST_PROXY=1
COOKIE_SECURE=true
CLIENT_ORIGIN=https://brilliantinstitute.edu.lk
PUBLIC_BASE_URL=https://brilliantinstitute.edu.lk
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_SSL=false
INSTITUTE_EMAIL=brilliantinstitute.edu@gmail.com
RESEND_API_KEY=<see 3.6>
MAIL_FROM=Brilliant Institute <no-reply@brilliantinstitute.edu.lk>
```

Notes on these values:
- `DB_SSL=false` is correct here because Railway's database is on its private network. For a database reached over the internet (Aiven, TiDB and so on), set `DB_SSL=true`, plus `DB_SSL_CA` if the provider gives a CA file.
- Add the `PAYHERE_*` values only when you have a live PayHere merchant account.

### 3.4 Load the data
1. MySQL service → **Settings → Networking → Public access**. This turns on a temporary TCP proxy.
2. Copy the host, port and password from its `MYSQL_PUBLIC_URL` variable.
3. In **MySQL Workbench**:
   - Add a new connection with those details.
   - Go to **Server → Data Import → Import from Self-Contained File**, choose the `.sql` file and the target schema `railway`, then click **Start Import**.
4. Turn **Public access off** again.

### 3.5 Try it, then add the domain
1. Web service → **Settings → Networking → Generate Domain**. You get an address like `xxx.up.railway.app`.
2. Add that address to `CLIENT_ORIGIN`. Separate addresses with a comma:
   `https://brilliantinstitute.edu.lk,https://xxx.up.railway.app`
3. Open the address and log in.
4. **Custom Domain**: enter `brilliantinstitute.edu.lk` (and `www.brilliantinstitute.edu.lk` if you want it).
5. Railway shows the DNS records to add. In Cloudflare, add them as shown with **DNS only** (grey cloud).
6. HTTPS is issued automatically within minutes.

### 3.6 Email (password reset codes)
Railway's cheaper plans block email ports (SMTP), so Gmail cannot send from there. Use **Resend** instead (free: 3,000 emails a month, 100 a day):

1. Make an account at https://resend.com and go to **Domains → Add domain**.
2. Add the records it lists in Cloudflare, then wait until the domain shows **Verified**.
3. Create an API key and put it in `RESEND_API_KEY`. Keep `MAIL_FROM` on the verified domain.
4. Test it with **Forgot password** on the live site.

## 4. Option B – SriLanka Hosting Node.js hosting (Plesk)

Ask their support these questions **before paying**:
1. Which plan runs a **Node.js 20 or 22** app? Is it the "Node.js Hosting" plan or the S-BIS cPanel plan?
2. Can we run `npm` in sub-folders, either over SSH or through Plesk **Node.js → Run script**?
3. Is the database **MySQL 8** or **MariaDB** (which version)?
4. How much **memory** may one app use? The site needs about 300 MB, more while PDF reports are built.
5. May the app send email through **Gmail's SMTP**, or should we use the plan's own mailbox?

Setup:
1. **Plesk → Databases → Add Database**. Note the name, user and password.
   - Import the export with phpMyAdmin.
   - If the host runs MariaDB, make the export with `npm run db:export -- --mariadb`.
2. Upload the project without `node_modules`, `.env` or `database-export`. Use Plesk **Git** or the File Manager.
3. **Plesk → Node.js**:
   - Node.js version 22
   - Application root: the project folder
   - Document root: `client/dist`
   - Application startup file: `server/src/server.js`
   - Mode: production
4. **Custom environment variables**: the same list as 3.3, with `DB_HOST=localhost` and `DB_SSL=false`.
   - For email: a mailbox made in Plesk (`no-reply@brilliantinstitute.edu.lk`) with `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, or Gmail with its app password if SMTP is allowed.
   - Leave `RESEND_API_KEY` empty.
5. **Run script → `build`**. This installs every folder and builds the website. Then click **Restart App**.
6. Domain → **SSL/TLS → Let's Encrypt** for free HTTPS.

## 5. Option C – this laptop (free, laptop stays on)

1. Install MySQL and the project as for development, and add the domain to Cloudflare (section 2, step 3).
2. Run `host.cmd domain-setup` once. Log in to Cloudflare in the browser window and pick the domain.
3. From then on, run `host.cmd` and the site opens at https://brilliantinstitute.edu.lk while the laptop is on, awake and online.

## 6. Before you share the link

- [ ] **Change the passwords** of every demo or staff account (Admin and Tutors use `Demo@1234` from the seed script). The server log warns until this is done.
- [ ] `JWT_SECRET` is a new random value used nowhere else.
- [ ] **Forgot password** sends a code (Resend or SMTP works).
- [ ] Log in as each role and open one page of each module.
- [ ] Run the QA suite against the live address: `cd tests && BASE_URL=https://brilliantinstitute.edu.lk npm run test:smoke`

## 7. Show up on Google

1. Open https://search.google.com/search-console and **Add property → Domain**: `brilliantinstitute.edu.lk`.
2. Add the TXT record it gives you in Cloudflare and click **Verify**.
3. Go to **Sitemaps** and submit `https://brilliantinstitute.edu.lk/sitemap.xml`.
4. In **URL inspection**, enter the home page address and click **Request indexing**.

Google usually lists a new site within a few days to two weeks. The page title, description, preview image and structured data are already in the site (tested in WEB-08).
