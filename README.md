# JNV Teacher Routine Portal

Jawahar Navodaya Vidyalaya, Rymbai — a real, working web app in which an administrator uploads the official routine (scanned PDF, JPG, PNG, DOC, DOCX); the system reads it (OCR when needed), shows the extracted timetable for **review and correction**, and only after **Publish** do teachers see it — with search, daily/weekly timetables, MOD duty, weekly off, notices, documents, remedial/enrichment schedules and clubs.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · PostgreSQL + Prisma · Auth.js (credentials, JWT) · Zod · Tesseract.js (OCR) · pdf.js · sharp · mammoth · optional Claude vision extraction.

## Quick start (development)

```bash
npm install
cp .env.example .env          # then edit AUTH_SECRET and ADMIN_PASSWORD
npm run db:local              # terminal 1: local PostgreSQL on :5433 (no Docker needed)
npx prisma db push            # terminal 2: create the tables
npm run db:seed               # create the first admin (from ADMIN_* in .env)
npm run dev                   # http://localhost:3000
```

Sign in with the admin credentials from `.env`. **No teachers, routines, MOD or weekly-off data are ever created by the app itself** — they come only from uploaded documents or manual entry.

Try it without a real document: `npm run sample` writes synthetic (fictional-name) sample routines to `.data/samples/` (a scanned PDF, a text PDF, JPG, PNG). Upload one in **Admin → Upload**.

### Production

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, AUTH_SECRET, ADMIN_PASSWORD, AUTH_URL ...
docker compose up -d --build
```

The container runs `prisma migrate deploy`, seeds the admin, and starts the server. Uploaded originals and the OCR language data live on the `appdata` volume (`/data`) — **back it up together with the database**. Put the app behind HTTPS (Caddy/nginx); `AUTH_URL` must be the public URL. Without Docker: `npm run build && npm run db:deploy && npm run db:seed && npm start`.

Extraction runs inside the server process (one document at a time), so host it as a long-running Node service (VPS/Docker), not a serverless platform. The default file store is a local directory; `src/lib/storage.ts` is a small interface if you need S3.

## The workflow

```
Admin login → Upload PDF/image/DOC(X)
   → file validation (type, size, magic bytes, active content)
   → text layer (PDF) or render + OCR (scans; rotation auto-corrected)
   → [optional] Claude vision → structured JSON
   → rule-based table reader (fallback + cross-check)
   → deterministic validation (class, section, day, period, time, duplicates, teacher exists, clashes)
   → Extraction Review (edit anything, confidence per cell, side-by-side original)
   → SAVE DRAFT / PUBLISH / CANCEL
   → normalised tables + new ACTIVE routine version (older versions kept)
   → teachers see it immediately
```

* **Extraction Review** shows every extracted cell with a confidence score; low-confidence cells are amber, blocking errors are red. Edits autosave as a draft. Publishing is disabled while there are errors.
* **Teachers found in the document must exist in the teacher list.** The *Teachers* tab lets you match each printed name to a teacher or create it. Names are never guessed; only exact/alias/code matches (or a single one-letter OCR typo, flagged as "approximate") are matched automatically.
* **MOD and weekly off** are imported only if the document prints them (MOD needs a calendar date). Otherwise the site says *"Information not available in uploaded document."* and the admin enters them under **Admin → MOD / Weekly off**.
* **Versioning:** every publish creates *Routine version N*; exactly one is ACTIVE. Admin → Routine versions can re-activate an older version, archive or delete one. The original file is never modified and stays available under Official Documents.
* Remedial/enrichment schedules and club documents go through the same review → publish flow.

## AI extraction (recommended for scanned documents)

Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`). Each page image is sent to Claude with a strict "transcribe, never invent" prompt and a forced JSON tool schema; the result is then validated by the same deterministic checks, and confidence is lowered for anything that cannot be found in the OCR text. Without a key the built-in rule-based reader works on the OCR/text-layer output. **Page images are sent to Anthropic when this is enabled** — leave the key empty if documents must not leave the school.

### Rosters, teacher identity and the tidy-up tool

* **MOD roster / Sunday-holiday duty tables** in Word (or scanned) documents are read column by column (`Date | Name | Designation | House | Classes | Weekly off`); row-spans are expanded, serial numbers are dropped, and `Name, CODE` is split into the person and the code. A date with no person named is reported and **never** filled in. MOD and Sunday/Holiday duty are separate types (`DutyType`), shown separately on the home page, the MOD page and each teacher's page.
* Text from a document is classified as a **person**, a **teacher code** or **noise** (headings, sentences) - only the first two can become teachers. Teacher codes that are abbreviations of the same post (`TGT-Maths` / `TGT-MATH`, `TGT-English` / `TGT-ENG`) are matched via suggestions and aliases; `PGT-ENG` and `TGT-ENG` stay separate.
* **Admin → Teachers → "Tidy up the teacher list"** previews and applies a merge of duplicates (records are re-pointed, spellings kept as aliases) and removes heading text that was mistaken for teachers. `node scripts/backup-data.mjs` writes a JSON backup of every table first.

### Free AI help with Groq (text model)

Set `GROQ_API_KEY` (and optionally `GROQ_MODEL`, default `openai/gpt-oss-120b`; if a model is retired the app falls back to another available one). Groq models available on the free tier are **text-only**, so they never see the scan; they work on the OCR text:

1. a deterministic step (no AI) merges spellings that differ only by look-alike characters (`S.Sc` / `S$.Sc`, `TGT-S.SC` / `TGT-5.5C`); different letters (`PGT-ENG` vs `TGT-ENG`) are never merged;
2. the model may map a remaining misreading onto a spelling that already occurs in the same document (at most one character away) - it can only choose among existing strings;
3. if the rule reader recognises nothing, the model tries to structure the OCR text (simple layouts only - merged-cell tables lose their borders in plain text).

Corrected cells are capped at 80-85% confidence so they stay highlighted in the review. Only OCR *text* is sent to Groq, not the image. Documents that print only teacher **codes** cannot be turned into people by any AI: add your staff once under Admin -> Teachers as `Name, Code` and the codes match automatically.

## Layouts the rule-based reader understands

* days as rows and periods as columns (period labels `1st 2nd … BREAK …`, times such as `8:15-8:55`), or the transposed layout;
* class headings like `CLASS VI-A`, `Class VII`, `VIII - B`; several classes per page; multi-page PDFs;
* cells containing subject and teacher on two lines or as `Subject - Teacher`, `Subject (Teacher)`, codes like `TGT-SCI`;
* DOCX tables (structure is exact), best-effort for legacy `.doc`.

Documents laid out differently (for example one table with classes as rows for a single day) may need the AI extractor or manual correction in the review screen — every field is editable and classes/periods/days can be added by hand.

## Security

* Auth.js credentials + bcrypt (cost 12), JWT session (12 h), login throttling, forced password change for admin-issued passwords, deactivated users lose access immediately (role/active re-checked in the database on every API call).
* Every page and API is behind the middleware; `/admin` and all mutating APIs require the ADMIN role (checked again in each handler). Teachers cannot upload or change routines, MOD, weekly off or teachers.
* CSRF: SameSite cookies + strict Origin check on every mutating API call; Auth.js CSRF tokens for sign-in/out.
* Uploads: extension allow-list, size limit (`MAX_UPLOAD_MB`), magic-byte check, PDFs with launch actions/embedded files and macro-enabled Word files rejected, random storage keys (no user-controlled paths), files served with `nosniff`. For malware scanning add ClamAV at the storage step.
* Prisma parameterised queries (no raw SQL), React output escaping (no `dangerouslySetInnerHTML`), CSP and other security headers (`next.config.mjs`).
* The in-memory rate limiter is per instance — use a shared store if you scale out.

## Project layout

```
prisma/                 schema, migrations, seed
src/app/                pages (portal) + login + api/ route handlers
src/components/         Timetable, TeacherSearch, ...
src/lib/extraction/     read (pdf/ocr/docx), heuristic parser, AI, validate, publish, pipeline
src/lib/security/       api guards, CSRF, upload validation, rate limit
src/lib/storage.ts      file storage abstraction
tests/                  vitest unit tests (parsers, validation, matching)
scripts/                dev-db, sample generator, try-extract, e2e smoke test
```

Commands: `npm test` · `npm run typecheck` · `npm run e2e` (needs a running server) · `npx tsx scripts/try-extract.mts <file>`.

## Data model

`User, Teacher, Subject, SchoolDay, UploadedDocument, ExtractionDraft, ExtractionLog, Routine (versions), RoutineClass, RoutinePeriod, ModDuty (table MODDuty), WeeklyOff, Notice, RemedialSchedule, ClubActivity` — see `prisma/schema.prisma`.
