// Analyse détaillée : victoires par phase, cibles d'Assaut, Trésor.
// Usage : node moteur/analyse.js [N] [graineDeDépart] [options JSON] > sortie.json
import { campagne, D } from "./simuler.js";

const N = +(process.argv[2] || 100), g0 = +(process.argv[3] || 1);
const opts = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const parties = campagne(N, g0, opts);
console.log(JSON.stringify(parties.map(p => ({
  gagnant: p.gagnant, raison: p.raison, tour: p.tour, score: p.score,
  cibles: p.stats.ciblesAssaut, tresorPerdu: p.stats.tresorPerdu, tresorFinTour: p.stats.tresorFinTour,
  assauts: p.stats.assauts, decomptes: p.stats.decomptes, vp: p.stats.vp,
}))));
