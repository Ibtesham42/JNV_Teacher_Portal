// Build step used by Vercel (package.json -> "vercel-build").
// 1. shows which settings are present (passwords hidden) and explains what is missing
// 2. prisma generate
// 3. checks the database connection and explains a failure in plain words
// 4. prisma migrate deploy (uses the non-pooled DIRECT_URL when it is set)
// 5. next build
import { spawnSync } from "node:child_process";

const env = process.env;
const missing = ["DATABASE_URL", "AUTH_SECRET"].filter((k) => !env[k]);
if (missing.length) {
  console.error(`
================================================================
 BUILD STOPPED - missing environment variable(s): ${missing.join(", ")}

 In Vercel open:  Project -> Settings -> Environment Variables
 add them (see DEPLOY_VERCEL.md, step 2), then Deployments -> Redeploy.
================================================================
`);
  process.exit(1);
}

const mask = (u) => {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.username}:***@${x.host}${x.pathname}`;
  } catch {
    return "(not a valid URL - check for extra spaces or quotes)";
  }
};

console.log("");
console.log("=== JNV build check ===");
console.log(`DATABASE_URL : ${mask(env.DATABASE_URL)}`);
console.log(`DIRECT_URL   : ${env.DIRECT_URL ? mask(env.DIRECT_URL) : "(not set - derived from DATABASE_URL: " + mask(toDirect(env.DATABASE_URL)) + ")"}`);
console.log(`AUTH_SECRET  : set (${env.AUTH_SECRET.length} characters)`);
console.log(`STORAGE_DRIVER=${env.STORAGE_DRIVER || "(unset)"}  MAX_UPLOAD_MB=${env.MAX_UPLOAD_MB || "(unset)"}  TESSDATA_DIR=${env.TESSDATA_DIR || "(unset)"}`);
console.log("=======================");
console.log("");

if (/^["']|["']$/.test(env.DATABASE_URL) || /\s/.test(env.DATABASE_URL)) {
  console.error("BUILD STOPPED - DATABASE_URL contains quotes or spaces. Paste the value WITHOUT quotes.");
  process.exit(1);
}
if (env.VERCEL && env.STORAGE_DRIVER !== "db") {
  console.warn("WARNING: STORAGE_DRIVER is not 'db'. Uploads cannot be saved on Vercel's read-only disk - set STORAGE_DRIVER=db.");
}
if (env.AUTH_SECRET.length < 24) console.warn("WARNING: AUTH_SECRET is short; use 32+ random characters.");

/** Neon's pooled address cannot run migrations; derive the direct one (no "-pooler", no pgbouncer flags). */
export function toDirect(u) {
  try {
    const x = new URL(u);
    x.hostname = x.hostname.replace("-pooler", "");
    for (const k of ["pgbouncer", "channel_binding", "connect_timeout"]) x.searchParams.delete(k);
    if (!x.searchParams.has("sslmode") && x.hostname.includes("neon.tech")) x.searchParams.set("sslmode", "require");
    return x.toString();
  } catch {
    return u;
  }
}
const migrateUrl = env.DIRECT_URL || toDirect(env.DATABASE_URL);

function run(cmd, args, extraEnv = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env: { ...env, ...extraEnv } });
  if (r.status !== 0) {
    console.error(`\nBUILD STOPPED - "${cmd} ${args.join(" ")}" failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

run("npx", ["prisma", "generate"]);

// can we reach the database with these credentials? say so in plain words
{
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: migrateUrl } } });
  try {
    await db.$queryRawUnsafe("select 1");
    console.log("Database connection (direct): OK");
  } catch (e) {
    const m = String(e.message);
    console.error("");
    console.error("BUILD STOPPED - cannot connect to the database.");
    if (/P1000|authentication failed|password/i.test(m)) console.error("-> Wrong username or password. In Neon copy/reset the password and update DATABASE_URL and DIRECT_URL in Vercel.");
    else if (/P1001|reach|ENOTFOUND|timed out/i.test(m)) console.error("-> The host cannot be reached. Copy the connection string again from Neon -> Connect.");
    else if (/P1011|TLS|ssl/i.test(m)) console.error("-> SSL problem: the URL must end with ?sslmode=require (remove channel_binding=require).");
    else console.error("-> " + m.split(String.fromCharCode(10)).slice(-3).join(" ").slice(0, 300));
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// migrations: run them; if that fails but every migration is already recorded as applied, carry on
console.log("");
console.log("> npx prisma migrate deploy");
const mig = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", shell: true, env: { ...env, DATABASE_URL: migrateUrl } });
if (mig.status !== 0) {
  const fs = await import("node:fs");
  const expected = fs.readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: migrateUrl } } });
  let applied = -1;
  try {
    const r = await db.$queryRawUnsafe("select count(*)::int as n from _prisma_migrations where finished_at is not null and rolled_back_at is null");
    applied = r[0].n;
  } catch {
    /* table missing */
  } finally {
    await db.$disconnect();
  }
  if (applied >= expected) {
    console.warn(`WARNING: "migrate deploy" failed, but all ${expected} migrations are already applied to this database - continuing.`);
  } else {
    console.error("");
    console.error(`BUILD STOPPED - database migrations failed (${applied} of ${expected} applied).`);
    console.error("-> Set DIRECT_URL in Vercel to the Neon connection string WITHOUT '-pooler' in the host, then redeploy.");
    process.exit(1);
  }
}

run("npx", ["next", "build"]);
