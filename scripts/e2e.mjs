// End-to-end smoke test against a running server (npm start / npm run dev).
//   node scripts/e2e.mjs [file] [kind]
// Logs in as the seeded admin, uploads a document, waits for OCR/extraction,
// fixes teacher matching, publishes, and checks the teacher-facing pages.
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const file = process.argv[2] || ".data/samples/sample-scanned.pdf";
const kind = process.argv[3] || "ROUTINE";
const USER = process.env.ADMIN_USERNAME || "admin";
const PASS = process.env.ADMIN_PASSWORD;
if (!PASS) throw new Error("Set ADMIN_PASSWORD (and optionally ADMIN_USERNAME) to run the e2e test.");

function client() {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const store = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (v === "" || /Max-Age=0/i.test(c)) jar.delete(k);
      else jar.set(k, v);
    }
  };
  const req = async (url, init = {}) => {
    const res = await fetch(BASE + url, { redirect: "manual", ...init, headers: { Cookie: cookieHeader(), Origin: BASE, ...(init.headers || {}) } });
    store(res);
    return res;
  };
  const json = async (url, init) => {
    const res = await req(url, init);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const login = async (username, password) => {
    const csrf = await (await req("/api/auth/csrf")).json();
    await req("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, username, password, callbackUrl: BASE + "/" }),
    });
    return (await (await req("/api/auth/session")).json())?.user ?? null;
  };
  return { req, json, login };
}
const admin = client();
const { req, json } = admin;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) process.exitCode = 1;
};

// ---- login
const me = await admin.login(USER, PASS);
ok(me?.role === "ADMIN", `admin login -> ${me?.username}`);
const wrong = await client().login(USER, "definitely-wrong");
ok(wrong === null, "wrong password is rejected");

// ---- security checks
let r = await fetch(BASE + "/api/documents", { method: "POST" });
ok(r.status === 401, "unauthenticated upload is rejected (401)");
r = await req("/api/teachers", { method: "POST", headers: { Origin: "http://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ name: "X Y" }) });
ok(r.status === 403, "cross-site POST is blocked (403)");

// ---- upload
const buf = fs.readFileSync(file);
const fd = new FormData();
fd.set("kind", kind);
fd.set("file", new Blob([buf]), path.basename(file));
let up = await json("/api/documents", { method: "POST", body: fd });
ok(up.status === 200 && up.body.document?.id, `upload accepted: ${up.body.message ?? up.body.error}`);
const id = up.body.document.id;

// bad uploads
const bad = new FormData();
bad.set("kind", "ROUTINE");
bad.set("file", new Blob([Buffer.from("MZ not a pdf")]), "evil.pdf");
up = await json("/api/documents", { method: "POST", body: bad });
ok(up.status === 422, `fake PDF rejected: ${up.body.error}`);
const bad2 = new FormData();
bad2.set("kind", "ROUTINE");
bad2.set("file", new Blob([Buffer.from("hello")]), "notes.exe");
up = await json("/api/documents", { method: "POST", body: bad2 });
ok(up.status === 422, `.exe rejected: ${up.body.error}`);

// ---- wait for extraction
let ex;
const t0 = Date.now();
for (;;) {
  ex = (await json(`/api/extraction/${id}`)).body;
  process.stdout.write(`\r  extraction: ${ex.draft.status} ${ex.draft.progress}% ${ex.draft.stage}        `);
  if (!["QUEUED", "PROCESSING"].includes(ex.draft.status)) break;
  if (Date.now() - t0 > 300000) throw new Error("timeout");
  await new Promise((r) => setTimeout(r, 1500));
}
console.log();
ok(ex.draft.status === "REVIEW", `extraction finished in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${ex.draft.status} (${ex.draft.provider})`);
console.log(`  periods=${ex.data.periods.length} errors=${ex.validation.errors} warnings=${ex.validation.warnings} unresolved teachers=${ex.validation.unresolvedTeachers.length}`);

// publishing must be blocked while teachers are unknown
const data = ex.data;
let pub;
if (ex.validation.unresolvedTeachers.length) {
  pub = await json(`/api/extraction/${id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  ok(pub.status === 422, `publish blocked while teachers are unmatched (${pub.body.error})`);
  for (const n of ex.validation.unresolvedTeachers) data.teacherMap[n] = "NEW";
}
const saved = await json(`/api/extraction/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
ok(saved.status === 200 && saved.body.validation.errors === 0, `draft saved, errors now ${saved.body.validation?.errors}`);

pub = await json(`/api/extraction/${id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
ok(pub.status === 200, `published: ${pub.body.message ?? pub.body.error} (routine v${pub.body.version}, ${pub.body.counts?.periods} periods)`);

// ---- teacher-facing
const teachers = (await json("/api/teachers")).body.teachers;
ok(teachers.length > 0, `${teachers.length} teachers created from the document`);
const t = teachers.find((x) => /Sharma/.test(x.name)) ?? teachers[0];
const s = await json(`/api/teachers?q=${encodeURIComponent(t.name.split(" ").pop())}`);
ok(s.body.teachers?.some((x) => x.id === t.id), `teacher search finds "${t.name}"`);

for (const [url, needle] of [
  ["/", "Teacher Routine Portal"],
  ["/", "Today&#x27;s Routine"],
  ["/routine/class?class=VI&section=A", "Class VI-A"],
  ["/routine/complete", "Class VII-B"],
  [`/teachers/${t.id}`, t.name],
  ["/documents", "Current Routine"],
  ["/admin", "Admin Dashboard"],
]) {
  const res = await req(url);
  const html = await res.text();
  ok(res.status === 200 && html.includes(needle), `GET ${url} -> ${res.status} contains "${needle}"`);
}

// original document is served unchanged
const orig = await req(`/api/documents/${id}/file`);
const origBuf = Buffer.from(await orig.arrayBuffer());
ok(orig.status === 200 && origBuf.equals(buf), "original file is served byte-for-byte unchanged");

// a second version keeps history and only one is ACTIVE
const routines = (await json("/api/routines")).body.routines;
console.log("  routines:", routines.map((x) => `v${x.version}:${x.status}`).join(", "));

// ---- MOD, weekly off, notices, search (entered manually - never guessed)
const H0 = { "Content-Type": "application/json" };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const todayDay = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date(today + "T00:00:00Z").getUTCDay()];
const two = teachers.slice(0, 2);
let m = await json("/api/mod", { method: "POST", headers: H0, body: JSON.stringify({ dates: [today], teacherIds: two.map((x) => x.id), dutyDescription: "Dining hall" }) });
ok(m.status === 200 && m.body.count === 2, `MOD assigned to 2 teachers for ${today}`);
let w = await json("/api/weekly-off", { method: "PUT", headers: H0, body: JSON.stringify({ teacherId: teachers[2].id, day: todayDay }) });
ok(w.status === 200, `weekly off set: ${teachers[2].name} -> ${todayDay}`);
let home = await (await req("/")).text();
ok(two.every((x) => home.includes(x.name)) && home.includes(teachers[2].name), "homepage shows today's MOD teachers and weekly-off teacher");
let tp = await (await req(`/teachers/${two[0].id}`)).text();
ok(tp.includes("Today&#x27;s MOD: YES") || tp.includes("Today's MOD: YES"), "MOD teacher's page says Today's MOD: YES");
tp = await (await req(`/teachers/${teachers[2].id}`)).text();
ok(tp.includes("weekly off"), "weekly-off teacher's page shows the weekly off notice");
const nf = new FormData();
nf.set("title", "Unit test week"); nf.set("description", "Exams from Monday.\nBring admit card."); nf.set("date", today); nf.set("priority", "HIGH");
nf.set("file", new Blob([buf]), "notice" + path.extname(file));
const nres = await json("/api/notices", { method: "POST", body: nf });
ok(nres.status === 200, "notice with attachment created");
ok((await (await req("/notices")).text()).includes("Unit test week"), "notice is visible on /notices");
const srch = await json("/api/search?q=Science");
ok(srch.body.subjects?.length > 0 && srch.body.subjects[0].teachers.length > 0, "global search finds subject -> teachers");
const srch2 = await json("/api/search?q=VII-B");
ok(srch2.body.classes?.some((c) => c.label === "VII-B"), "global search finds class VII-B");
const srch3 = await json("/api/search?q=Unit%20test");
ok(srch3.body.notices?.length > 0, "global search finds notices");

// ---- teacher role: what a normal teacher can and cannot do
const acct = await json(`/api/teachers/${t.id}/account`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "e2e.teacher", password: "Temp-Pass-123", mustChangePassword: true }) });
ok(acct.status === 200, `login created for ${t.name}: ${acct.body.message ?? acct.body.error}`);
const tc = client();
const tu = await tc.login("e2e.teacher", "Temp-Pass-123");
ok(tu?.role === "TEACHER" && tu.teacherId === t.id, "teacher can sign in and is linked to the teacher record");
let rr = await tc.req("/");
ok(rr.status === 307 && (rr.headers.get("location") || "").includes("/change-password"), "first sign-in forces a password change");
const pw = await tc.json("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: "Temp-Pass-123", newPassword: "Better-Pass-456" }) });
ok(pw.status === 200, "teacher changes password");
const tc2 = client();
ok((await tc2.login("e2e.teacher", "Temp-Pass-123")) === null, "old password no longer works");
ok((await tc2.login("e2e.teacher", "Better-Pass-456"))?.role === "TEACHER", "new password works");

for (const [url, needle] of [["/", "Search Teacher"], ["/me", "Weekly timetable"], ["/mod", "MOD Duty"], ["/weekly-off", "Weekly Off"], ["/documents", "Official Documents"]]) {
  const res = await tc2.req(url);
  ok(res.status === 200 && (await res.text()).includes(needle), `teacher can view ${url}`);
}
rr = await tc2.req("/admin");
ok(rr.status === 307, `teacher is redirected away from /admin (${rr.status})`);
rr = await tc2.req("/admin/upload");
ok(rr.status === 307, "teacher is redirected away from /admin/upload");

const H = { "Content-Type": "application/json" };
const denied = [
  ["POST", "/api/teachers", { name: "Hacker" }],
  ["PATCH", `/api/teachers/${t.id}`, { name: "Hacked" }],
  ["PUT", "/api/weekly-off", { teacherId: t.id, day: "SUNDAY" }],
  ["POST", "/api/mod", { dates: ["2026-10-01"], teacherIds: [t.id] }],
  ["POST", `/api/extraction/${id}/publish`, {}],
  ["POST", `/api/routines/${routines[0].id}`, { action: "archive" }],
  ["DELETE", `/api/routines/${routines.at(-1).id}`, undefined],
  ["POST", "/api/clubs", { name: "Club" }],
  ["POST", `/api/teachers/${t.id}/account`, { username: "x.y.z", password: "Password-1234" }],
  ["PATCH", "/api/routine-periods/nope", { subject: "x" }],
];
for (const [m, u, b] of denied) {
  const res = await tc2.json(u, { method: m, headers: H, body: b === undefined ? undefined : JSON.stringify(b) });
  ok(res.status === 403, `teacher ${m} ${u.replace(/[a-z0-9]{20,}/g, ":id")} -> ${res.status}`);
}
const fd2 = new FormData();
fd2.set("kind", "ROUTINE");
fd2.set("file", new Blob([buf]), "x" + path.extname(file));
ok((await tc2.json("/api/documents", { method: "POST", body: fd2 })).status === 403, "teacher cannot upload documents (403)");
ok((await tc2.json(`/api/extraction/${id}`)).status === 403, "teacher cannot read extraction drafts (403)");
ok((await tc2.req(`/api/documents/${id}/file`)).status === 200, "teacher can view the published original");
console.log("done");
