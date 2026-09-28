// Creates the first administrator only - run with `npm run db:seed`.
// No teachers, routines, MOD or weekly-off data are ever invented: everything comes
// from the documents the admin uploads or from manual entry.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("Set ADMIN_PASSWORD (at least 10 characters) before seeding.");
  }
  const name = process.env.ADMIN_NAME || "Portal Administrator";

  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { role: "ADMIN", active: true, name } });
    console.log(`Admin "${username}" already exists (password left unchanged).`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.user.create({ data: { username, name, passwordHash, role: "ADMIN", mustChangePassword: false } });
    console.log(`Admin "${username}" created.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
