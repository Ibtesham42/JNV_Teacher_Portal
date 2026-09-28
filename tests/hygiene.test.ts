import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards against control characters sneaking into source files (an escaped "\b" that became a real backspace
// silently breaks a regex).
describe("source hygiene", () => {
  it("has no control characters in source files", () => {
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(ts|tsx|mjs)$/.test(f.name) && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(fs.readFileSync(p, "utf8"))) bad.push(p);
      }
    };
    walk(path.resolve("src"));
    walk(path.resolve("tests"));
    expect(bad).toEqual([]);
  });
});
