import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: "ADMIN" | "TEACHER";
  teacherId: string | null;
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Current user, re-checked against the database (so deactivated accounts lose access immediately). */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await db.user.findUnique({ where: { id } });
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, username: u.username, role: u.role, teacherId: u.teacherId };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Please sign in.");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new HttpError(403, "Only administrators can do this.");
  return u;
}

/** CSRF defence for cookie-authenticated mutations: the request must come from our own origin. */
export function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "Cross-site request blocked.");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Cross-site request blocked.");
  }
  if (originHost !== host) throw new HttpError(403, "Cross-site request blocked.");
}

export async function parseJson<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new HttpError(422, "Validation failed.", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return r.data;
}

export function parseQuery<T extends z.ZodType>(req: NextRequest, schema: T): z.infer<T> {
  const obj = Object.fromEntries(req.nextUrl.searchParams.entries());
  const r = schema.safeParse(obj);
  if (!r.success) throw new HttpError(422, "Invalid query.", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response | NextResponse | unknown>;

/** Wraps a route handler: same-origin check for mutations + uniform JSON errors. */
export function route<C = { params: Promise<Record<string, string>> }>(handler: Handler<C>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      assertSameOrigin(req);
      const out = await handler(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
      }
      if (e && typeof e === "object" && "code" in e && (e as any).code === "P2002") {
        return NextResponse.json({ error: "That record already exists." }, { status: 409 });
      }
      console.error("[api]", req.method, req.nextUrl.pathname, e);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
