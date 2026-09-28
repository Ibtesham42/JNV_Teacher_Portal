# Deploy on Vercel (free) + Neon PostgreSQL (free)

Everything below is free-tier. Free tiers change - check the current limits on vercel.com/pricing and neon.tech/pricing before relying on them.

**What runs where**

| Part | Service | Why |
|---|---|---|
| Website + API + OCR | Vercel (Hobby) | serverless functions, HTTPS, auto-deploy from GitHub |
| PostgreSQL | Neon (Free) | permanent free database |
| Uploaded originals | the same Neon database (`StoredFile` table) | Vercel has no persistent disk |

**Limits you must know**

* **Upload size: 4 MB** per file (Vercel rejects request bodies above ~4.5 MB). Scan at "medium/standard" quality, or split a big PDF.
* **OCR time:** extraction runs after the response inside the function; it must finish within the function limit (300 s with Fluid Compute). A 3-page routine takes ~20-60 s. Very long PDFs (10+ pages) may time out.
* **Neon free storage ~0.5 GB** (data + originals). A few hundred routine PDFs is fine.
* **Vercel Hobby is meant for personal / non-commercial use.** A school's internal portal is normally fine, but read their terms.
* The login rate-limit is in memory per function instance (weaker than on a single server).

---

## 1. Create the database (Neon)

1. Sign up at https://neon.tech with GitHub. Create a project, region **Asia Pacific (Singapore)**.
2. Open **Connect** and copy two connection strings:
   * **Pooled** (host contains `-pooler`) -> this is `DATABASE_URL`. Append `&pgbouncer=true&connect_timeout=15` (keep `?sslmode=require`).
   * **Direct** (no `-pooler`) -> this is `DIRECT_URL` (used for migrations).

## 2. Import the project into Vercel

1. Sign up at https://vercel.com with GitHub -> **Add New -> Project** -> pick `JNV_Teacher_Portal` -> **Import**.
2. Leave Framework = Next.js, and do **not** change the build command (the repo's `vercel-build` script runs the database migrations and the build).
3. Before pressing Deploy, open **Environment Variables** and add (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | the pooled Neon string |
| `DIRECT_URL` | the direct Neon string |
| `AUTH_SECRET` | a long random string (`openssl rand -base64 32`, or any 40+ random characters) |
| `AUTH_TRUST_HOST` | `true` |
| `STORAGE_DRIVER` | `db` |
| `MAX_UPLOAD_MB` | `4` |
| `TESSDATA_DIR` | `/tmp/tessdata` |
| `SCHOOL_TZ` | `Asia/Kolkata` |
| `GROQ_API_KEY` | optional - your (new) Groq key |
| `GROQ_MODEL` | optional - `openai/gpt-oss-120b` |

4. Press **Deploy**. The first build applies the migrations to Neon.

## 3. Project settings (once)

**Settings -> Functions**
* Turn **Fluid Compute** on (needed for the 300 s limit used by uploads / OCR).
* Set **Function Region** to the one closest to Neon (Singapore `sin1` or Mumbai `bom1`).
Then **Deployments -> Redeploy**.

## 4. Create the admin account

On your PC, in the project folder (PowerShell):

```powershell
$env:DATABASE_URL = "<the DIRECT Neon string>"
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "<a strong password, 12+ characters>"
npm run db:seed
```

Now open your Vercel URL (`https://<project>.vercel.app`) and sign in.

## 5. Move the data you already entered (optional)

Your teachers, routine, MOD/duty and uploaded originals live in your local database. Copy them up:

```powershell
node scripts/backup-data.mjs                       # writes .data/backups/backup-<time>.json
$env:DATABASE_URL = "<the DIRECT Neon string>"
node scripts/restore-data.mjs .data/backups/backup-<time>.json .data/uploads
```

It is safe to run twice (existing rows are skipped). Your local admin account is copied too, so use that password, or run the seed step first and skip it.

## 6. Check it works

1. Home page loads, sign in works.
2. **Admin -> Upload** a small routine PDF -> the review screen appears after OCR.
3. Publish it and open **Routine**.
4. Open an uploaded original from **Documents**.

If step 2 fails: **Vercel -> Deployments -> (latest) -> Functions / Logs**, open the `/api/documents` log. Typical causes: `Fluid Compute` off, file over 4 MB, missing `DATABASE_URL`.

## 7. Keep it healthy

* **Backups:** Neon keeps a short history on the free plan. Once a month run `node scripts/backup-data.mjs` (with the direct `DATABASE_URL`) and keep the file somewhere safe - the JSON contains data; the uploaded originals are in the `StoredFile` table (download from **Admin -> Documents**).
* **Change the seed password** after first sign-in (**Change password** page appears for admin-issued passwords).
* Never commit `.env`. Rotate the Groq key if it was ever shared.

## If Vercel's OCR turns out too slow or too limited

The same repository also runs on a school PC / Oracle Free VM with `docker compose up` (see README). You can run OCR there and keep everything else the same.
