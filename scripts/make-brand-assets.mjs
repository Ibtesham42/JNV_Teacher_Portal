// Builds the site icons from the NVS logo (public/nvs-logo.png):
//   node scripts/make-brand-assets.mjs
import fs from "node:fs";
import sharp from "sharp";

const src = "public/nvs-logo.png";
if (!fs.existsSync(src)) throw new Error("Put the logo at public/nvs-logo.png first");

// the emblem's lettering is dark blue, so icons sit on a white rounded square
async function icon(size, out, pad = 0.12) {
  const inner = Math.round(size * (1 - pad * 2));
  const logo = await sharp(src).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  const radius = Math.round(size * 0.2);
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mask }, { input: logo, gravity: "centre" }])
    .png()
    .toFile(out);
  console.log("wrote", out);
}

await icon(64, "src/app/icon.png", 0.06);
await icon(180, "src/app/apple-icon.png", 0.1);
await icon(512, "public/icon-512.png", 0.1);
// a smaller logo for the header (keeps pages light)
await sharp(src).resize({ height: 176 }).png({ compressionLevel: 9 }).toFile("public/nvs-logo-sm.png");
console.log("wrote public/nvs-logo-sm.png");
