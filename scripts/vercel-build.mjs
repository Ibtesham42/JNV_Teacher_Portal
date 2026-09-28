// Build step used by Vercel (package.json -> "vercel-build").
// 1. checks the required settings and explains what is missing
// 2. prisma generate
// 3. prisma migrate deploy (uses the non-pooled DIRECT_URL when it is set)
// 4. next build
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
if (env.VERCEL && env.STORAGE_DRIVER !== "db") {
  console.warn("WARNING: STORAGE_DRIVER is not 'db'. Uploads cannot be saved on Vercel's read-only disk - set STORAGE_DRIVER=db.");
}
if (env.AUTH_SECRET.length < 24) console.warn("WARNING: AUTH_SECRET is short; use 32+ random characters.");

function run(cmd, args, extraEnv = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env: { ...env, ...extraEnv } });
  if (r.status !== 0) {
    console.error(`\nBUILD STOPPED - "${cmd} ${args.join(" ")}" failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

run("npx", ["prisma", "generate"]);
run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: env.DIRECT_URL || env.DATABASE_URL });
run("npx", ["next", "build"]);
