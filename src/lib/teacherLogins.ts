import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { parseTeacherText } from "./teacherIdentity";

// no look-alike characters (0/o, 1/l/i) so passwords can be read out or copied from a printed sheet
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

const HONORIFIC = /^(mr|mrs|ms|miss|dr|sri|shri|smt|prof)\.?\s+/i;

/** "Mr. R.K. Tomar" -> "rk.tomar", "Mrs. Philisica Siangshai" -> "philisica.siangshai" (made unique with a number). */
export function usernameFor(name: string, taken: Set<string>): string {
  const tokens = name
    .replace(HONORIFIC, "")
    .split(/\s+/)
    .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  let base = tokens.join(".") || "teacher";
  if (base.length > 30 && tokens.length > 2) base = `${tokens[0]}.${tokens[tokens.length - 1]}`;
  base = base.slice(0, 30);
  let u = base;
  for (let n = 2; taken.has(u); n++) u = `${base}${n}`;
  taken.add(u);
  return u;
}

export type CreatedLogin = { teacherId: string; name: string; username: string; password: string };

/**
 * Creates a login for every active teacher that is a real person and has none yet.
 * Teacher codes and headings never get accounts. No forced password change.
 * The plain passwords are returned once; only their hashes are stored.
 */
export async function createLoginsForAllTeachers(): Promise<{ created: CreatedLogin[]; skipped: { name: string; reason: string }[] }> {
  const teachers = await db.teacher.findMany({ where: { active: true }, include: { user: { select: { id: true } } }, orderBy: { name: "asc" } });
  const taken = new Set((await db.user.findMany({ select: { username: true } })).map((u) => u.username.toLowerCase()));
  const created: CreatedLogin[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const t of teachers) {
    if (t.user) {
      skipped.push({ name: t.name, reason: "already has a login" });
      continue;
    }
    if (parseTeacherText(t.name).kind !== "person") {
      skipped.push({ name: t.name, reason: "not a person (code or heading text)" });
      continue;
    }
    const username = usernameFor(t.name, taken);
    const password = generatePassword();
    await db.user.create({
      data: {
        username,
        name: t.name,
        passwordHash: await bcrypt.hash(password, 10),
        role: "TEACHER",
        teacherId: t.id,
        mustChangePassword: false,
      },
    });
    created.push({ teacherId: t.id, name: t.name, username, password });
  }
  return { created, skipped };
}
