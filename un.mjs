import fs from "node:fs";
import { D } from "./moteur/simuler.js";
import { nouvellePartie, jouerPartie, definirDecideurs } from "./moteur/regles.js";
import { creerIA } from "./moteur/ia.js";
import { appliquerPatch } from "./patch.mjs";
const a = JSON.parse(process.argv[2]), out = process.argv[3];
appliquerPatch(D, JSON.parse(process.env.PATCH || "{}"));
definirDecideurs(creerIA({ niveau: a.niveau || "chevalier" }), creerIA({ niveau: a.niveau || "chevalier" }));
const R = [];
for (let i = 0; i < a.N; i++) {
  if (i % a.K !== a.k || Math.floor(i / a.K) % a.nc !== a.c) continue;
  const g = jouerPartie(D, nouvellePartie(D, a.g0 + i, a.options || {}));
  R.push({ i, w: g.fin.gagnant, r: g.fin.raison, t: g.fin.tour, s: g.score, vp: g.stats.vp, d: g.stats.decomptes, e: Object.keys(g.stats.evenements), cause: g.fin.cause, brut: g.fin.scoreBrut });
}
fs.writeFileSync(out, JSON.stringify(R));
