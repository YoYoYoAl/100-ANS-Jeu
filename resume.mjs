import fs from "node:fs"; import path from "node:path";
const dir = process.argv[2], par = {};
for (const d of fs.readdirSync(dir)) for (const f of fs.readdirSync(path.join(dir, d))) {
  const nom = f.replace(/_\d+_\d+\.json$/, ""); (par[nom] ||= []).push(...JSON.parse(fs.readFileSync(path.join(dir, d, f), "utf8")));
}
const res = {};
for (const [nom, R] of Object.entries(par)) {
  const n = R.length, p = R.filter(r => r.w === "F").length / n;
  res[nom] = { n, france: +p.toFixed(4), ic95: +(1.96 * Math.sqrt(p * (1 - p) / n)).toFixed(4), parties: R };
}
console.log(JSON.stringify(res));
