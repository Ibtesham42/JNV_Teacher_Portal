// Generates SYNTHETIC test documents (fictional names) into .data/samples/
// so the OCR/extraction pipeline can be tried without a real school document.
//   npm run sample
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import JSZip from "jszip";

const out = path.resolve(".data/samples");
fs.mkdirSync(out, { recursive: true });

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const COLS = [
  { label: "1st", time: "8:15-8:55" },
  { label: "2nd", time: "8:55-9:35" },
  { label: "3rd", time: "9:35-10:15" },
  { label: "4th", time: "10:15-10:55" },
  { label: "BREAK", time: "10:55-11:10", brk: true },
  { label: "5th", time: "11:10-11:45" },
  { label: "6th", time: "11:45-12:20" },
  { label: "7th", time: "12:20-12:55" },
  { label: "8th", time: "12:55-1:30" },
];

const SUBJECTS = [
  ["Science", "Mr. R. Sharma"],
  ["Maths", "Mrs. A. Devi"],
  ["English", "Ms. P. Roy"],
  ["Hindi", "Mr. K. Singh"],
  ["S.Sc", "Mrs. L. Khonglah"],
  ["Computer", "Mr. T. Lyngdoh"],
  ["Art", "Ms. D. Passah"],
  ["Games", "Mr. B. Rynjah"],
];

function tables() {
  return [
    { className: "CLASS VI-A", shift: 0 },
    { className: "CLASS VII-B", shift: 3 },
  ];
}

const W = 2100;
const rowH = 78;
const firstW = 150;
const colW = (W - 80 - firstW) / COLS.length;

function drawImage() {
  const T = tables();
  const H = 200 + T.length * (rowH * (DAYS.length + 2) + 130);
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#000";
  g.textBaseline = "middle";
  g.font = "bold 40px Arial";
  g.textAlign = "center";
  g.fillText("JAWAHAR NAVODAYA VIDYALAYA, RYMBAI", W / 2, 50);
  g.font = "28px Arial";
  g.fillText("CLASS TIME TABLE - SESSION 2025-26", W / 2, 100);

  let y = 170;
  for (const t of T) {
    g.textAlign = "left";
    g.font = "bold 34px Arial";
    g.fillText(t.className, 40, y);
    y += 40;
    const x0 = 40;
    // header
    g.strokeStyle = "#000";
    g.lineWidth = 2;
    const rows = DAYS.length + 2;
    for (let r = 0; r <= rows; r++) {
      g.beginPath();
      g.moveTo(x0, y + r * rowH);
      g.lineTo(W - 40, y + r * rowH);
      g.stroke();
    }
    const xs = [x0, x0 + firstW, ...COLS.map((_, i) => x0 + firstW + (i + 1) * colW)];
    for (const x of xs) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + rows * rowH);
      g.stroke();
    }
    g.textAlign = "center";
    g.font = "bold 26px Arial";
    g.fillText("DAY", x0 + firstW / 2, y + rowH / 2);
    g.fillText("TIME", x0 + firstW / 2, y + rowH * 1.5);
    COLS.forEach((col, i) => {
      const cx = x0 + firstW + i * colW + colW / 2;
      g.font = "bold 26px Arial";
      g.fillText(col.label, cx, y + rowH / 2);
      g.font = "22px Arial";
      g.fillText(col.time, cx, y + rowH * 1.5);
    });
    DAYS.forEach((d, di) => {
      const ry = y + (di + 2) * rowH;
      g.font = "bold 24px Arial";
      g.fillText(d, x0 + firstW / 2, ry + rowH / 2);
      COLS.forEach((col, i) => {
        const cx = x0 + firstW + i * colW + colW / 2;
        if (col.brk) {
          g.font = "bold 24px Arial";
          g.fillText("BREAK", cx, ry + rowH / 2);
          return;
        }
        const [subj, teacher] = SUBJECTS[(di + i + t.shift) % SUBJECTS.length];
        g.font = "bold 24px Arial";
        g.fillText(subj, cx, ry + rowH / 2 - 15);
        g.font = "20px Arial";
        g.fillText(teacher, cx, ry + rowH / 2 + 15);
      });
    });
    y += rows * rowH + 90;
  }
  return c;
}

// --- minimal PDFs -------------------------------------------------------------
function pdfFromObjects(objs) {
  let body = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (body += `${String(o).padStart(10, "0")} 00000 n \n`));
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

function scanPdf(jpeg, w, h) {
  // image-only PDF (simulates a scanned document)
  const pw = 595;
  const ph = Math.round((595 * h) / w);
  const head = Buffer.from(
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    "latin1",
  );
  const streamObj = Buffer.concat([head, jpeg, Buffer.from("\nendstream", "latin1")]);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  const parts = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  // build manually because object 5 is binary
  let buf = Buffer.from("%PDF-1.4\n", "latin1");
  const offs = [];
  parts.forEach((p, i) => {
    offs.push(buf.length);
    buf = Buffer.concat([buf, Buffer.from(`${i + 1} 0 obj\n${p}\nendobj\n`, "latin1")]);
  });
  offs.push(buf.length);
  buf = Buffer.concat([buf, Buffer.from("5 0 obj\n", "latin1"), streamObj, Buffer.from("\nendobj\n", "latin1")]);
  const xref = buf.length;
  let tail = `xref\n0 6\n0000000000 65535 f \n`;
  offs.forEach((o) => (tail += `${String(o).padStart(10, "0")} 00000 n \n`));
  tail += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.concat([buf, Buffer.from(tail, "latin1")]);
}

function textPdf() {
  // real text layer (landscape A4), one page per class
  const pageW = 842;
  const pageH = 595;
  const esc = (s) => s.replace(/([()\\])/g, "\\$1");
  const pages = tables().map((t) => {
    let s = "BT /F1 14 Tf 40 555 Td (JAWAHAR NAVODAYA VIDYALAYA, RYMBAI - SESSION 2025-26) Tj ET\n";
    s += `BT /F1 12 Tf 40 530 Td (${esc(t.className)}) Tj ET\n`;
    const x0 = 40;
    const fw = 60;
    const cw = (pageW - 80 - fw) / COLS.length;
    const put = (txt, x, y, size = 8) => (s += `BT /F1 ${size} Tf ${x.toFixed(1)} ${y} Td (${esc(txt)}) Tj ET\n`);
    put("DAY", x0, 500);
    put("TIME", x0, 484);
    COLS.forEach((col, i) => {
      put(col.label, x0 + fw + i * cw + 4, 500);
      put(col.time, x0 + fw + i * cw + 4, 484, 7);
    });
    DAYS.forEach((d, di) => {
      const y = 450 - di * 55;
      put(d, x0, y - 6);
      COLS.forEach((col, i) => {
        const x = x0 + fw + i * cw + 4;
        if (col.brk) return put("BREAK", x, y - 6);
        const [subj, teacher] = SUBJECTS[(di + i + t.shift) % SUBJECTS.length];
        put(subj, x, y);
        put(teacher, x, y - 12, 7);
      });
    });
    return s;
  });
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>"];
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  pages.forEach((content, i) => {
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> >>`,
    );
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  return pdfFromObjects(objs);
}

const canvas = drawImage();
const png = canvas.toBuffer("image/png");
const jpeg = canvas.toBuffer("image/jpeg", 85);
fs.writeFileSync(path.join(out, "sample-routine.png"), png);
fs.writeFileSync(path.join(out, "sample-routine.jpg"), jpeg);
fs.writeFileSync(path.join(out, "sample-scanned.pdf"), scanPdf(jpeg, canvas.width, canvas.height));
fs.writeFileSync(path.join(out, "sample-text.pdf"), textPdf());
console.log("Samples written to", out);

// --- DOCX with a real Word table ---------------------------------------------
const x = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const para = (t, bold = false) => `<w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${x(t)}</w:t></w:r></w:p>`;
const cell = (lines) => `<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr>${lines.map((l, i) => para(l, i === 0)).join("")}</w:tc>`;
const row = (cells) => `<w:tr>${cells.map(cell).join("")}</w:tr>`;
let body = para("JAWAHAR NAVODAYA VIDYALAYA, RYMBAI - SESSION 2025-26", true);
for (const t of tables()) {
  body += para(t.className, true);
  let tbl = "<w:tbl><w:tblPr><w:tblW w:w='0' w:type='auto'/></w:tblPr>";
  tbl += row([["DAY"], ...COLS.map((c) => [c.label])]);
  tbl += row([["TIME"], ...COLS.map((c) => [c.time])]);
  DAYS.forEach((d, di) => {
    tbl += row([[d], ...COLS.map((c, i) => (c.brk ? ["BREAK"] : SUBJECTS[(di + i + t.shift) % SUBJECTS.length]))]);
  });
  body += tbl + "</w:tbl>" + para("");
}
const zip = new JSZip();
zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
fs.writeFileSync(path.join(out, "sample-routine.docx"), await zip.generateAsync({ type: "nodebuffer" }));
console.log("DOCX written");
