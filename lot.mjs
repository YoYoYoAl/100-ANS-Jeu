// lot k sur K : pour chaque variante de variantes.json, joue les graines g0+i où i % K == k, sur tous les cœurs
import fs from "node:fs"; import os from "node:os"; import { spawnSync, spawn } from "node:child_process";
const [k, K, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const V = JSON.parse(fs.readFileSync("variantes.json", "utf8"));
const nc = os.cpus().length, jobs = [];
for (const v of V.variantes) for (let c = 0; c < nc; c++) jobs.push({ v, c });
await Promise.all(jobs.map(({ v, c }) => new Promise(res => {
  const p = spawn("node", ["un.mjs", JSON.stringify({ ...v, g0: V.g0, N: V.N, k, K, c, nc }), `${out}/${v.nom}_${k}_${c}.json`], { stdio: "inherit", env: { ...process.env, PATCH: JSON.stringify(v.patch || {}) } });
  p.on("exit", res);
})));
