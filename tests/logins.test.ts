import { describe, expect, it } from "vitest";
import { generatePassword, usernameFor } from "../src/lib/teacherLogins";

describe("teacher login generation", () => {
  it("makes readable, unique usernames from names", () => {
    const taken = new Set<string>();
    expect(usernameFor("Mr. R.K. Tomar", taken)).toBe("rk.tomar");
    expect(usernameFor("Mrs. Philisica Siangshai", taken)).toBe("philisica.siangshai");
    expect(usernameFor("Mr. T.I. Singh", taken)).toBe("ti.singh");
    expect(usernameFor("Mrs. Kh. Shantibala Devi", taken)).toBe("kh.shantibala.devi");
    expect(usernameFor("Miss. Kriti Bala", taken)).toBe("kriti.bala");
  });
  it("adds a number when a username is taken", () => {
    const taken = new Set(["rk.tomar"]);
    expect(usernameFor("Mr. R.K. Tomar", taken)).toBe("rk.tomar2");
    expect(usernameFor("Mr. R.K. Tomar", taken)).toBe("rk.tomar3");
  });
  it("generates 8-character passwords without look-alike characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
      seen.add(p);
    }
    expect(seen.size).toBeGreaterThan(190);
  });
});
