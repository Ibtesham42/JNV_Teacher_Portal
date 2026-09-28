// Local PostgreSQL for development (no Docker / system install needed).
//   npm run db:local        -> starts Postgres on localhost:5433 and keeps running
// Production should use a managed PostgreSQL or docker-compose.yml.
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dir = path.resolve(".data/pgdata");
const port = Number(process.env.LOCAL_PG_PORT || 5433);
const fresh = !fs.existsSync(path.join(dir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "jnv",
  password: "jnv_local_password",
  port,
  persistent: true,
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("jnv_routine");

console.log(`PostgreSQL ready: postgresql://jnv:jnv_local_password@localhost:${port}/jnv_routine`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
