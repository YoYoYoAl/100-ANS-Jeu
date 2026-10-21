// Lance N parties IA contre IA et résume les résultats.
// Usage : node moteur/simuler.js [N] [graineDeDépart] [options JSON]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparerDonnees, nouvellePartie, jouerPartie, definirDecideurs } from "./regles.js";
import { creerIA } from "./ia.js";

const ici = path.dirname(fileURLToPath(import.meta.url));
export const D = preparerDonnees(JSON.parse(fs.readFileSync(path.join(ici, "donnees.json"), "utf8")));

export function campagne(N, graine0 = 1, options = {}, ia = {}) {
  definirDecideurs(creerIA(ia), creerIA(ia));
  const parties = [];
  for (let i = 0; i < N; i++) {
    const g = jouerPartie(D, nouvellePartie(D, graine0 + i, options));
    parties.push({ gagnant: g.fin.gagnant, raison: g.fin.raison, tour: g.fin.tour, score: g.score, treve: g.treve, crise: g.crise, legit: g.legit, tresor: g.tresor, stats: g.stats });
  }
  return parties;
}

export function resumer(parties) {
  const n = parties.length, moy = f => parties.reduce((s, p) => s + f(p), 0) / n;
  const prop = f => parties.filter(f).length / n;
  const ic = p => 1.96 * Math.sqrt(p * (1 - p) / n);
  const raisons = {};
  for (const p of parties) { const k = `${p.gagnant} · ${p.raison}`; raisons[k] = (raisons[k] || 0) + 1; }
  const evts = {};
  for (const p of parties) for (const [k, v] of Object.entries(p.stats.evenements)) evts[k] = (evts[k] || 0) + v;
  const pF = prop(p => p.gagnant === "F");
  return {
    parties: n, victoiresFrance: pF, ic95: ic(pF),
    raisons, tourMoyen: moy(p => p.tour), scoreMoyen: moy(p => p.score),
    parTour: Object.fromEntries([...Array(12)].map((_, i) => [i + 1, parties.filter(p => p.tour === i + 1).length])),
    actions: {
      assauts: { A: moy(p => p.stats.assauts.A), F: moy(p => p.stats.assauts.F) },
      sieges: { A: moy(p => p.stats.sieges.A), F: moy(p => p.stats.sieges.F) },
      diplomatie: { A: moy(p => p.stats.diplomatie.A), F: moy(p => p.stats.diplomatie.F) },
      legitimite: { A: moy(p => p.stats.legitimite.A), F: moy(p => p.stats.legitimite.F) },
      influence: { A: moy(p => p.stats.influence.A), F: moy(p => p.stats.influence.F) },
      penalitesMil: { A: moy(p => p.stats.penalitesMil.A), F: moy(p => p.stats.penalitesMil.F) },
    },
    evenementsParPartie: Object.fromEntries(Object.entries(evts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / n).toFixed(2)])),
  };
}

if (process.argv[1] && process.argv[1].endsWith("simuler.js")) {
  const N = +(process.argv[2] || 50), g0 = +(process.argv[3] || 1);
  const opts = process.argv[4] ? JSON.parse(process.argv[4]) : {};
  const t0 = Date.now();
  const r = resumer(campagne(N, g0, opts));
  r.dureeSecondes = (Date.now() - t0) / 1000;
  console.log(JSON.stringify(r, null, 1));
}
