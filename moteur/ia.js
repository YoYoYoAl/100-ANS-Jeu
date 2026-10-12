// IA heuristique, version 1 : évalue chaque coup légal en le simulant sur une copie de l'état
// (plusieurs tirages de dés), puis garde le meilleur. Les choix de détail (où placer, où retirer)
// suivent des règles gloutonnes rapides.
import {
  A, F, adv, carte, controle, defense, zone, lieuxAccessibles, coutInfluence, ciblesAssaut, bonusAssaut, coutAssaut,
  evenementPossible, opsCarte, jouer, resoudreEvenement, etatRegion, FACTIONS, factionsActives, alea,
} from "./regles.js";

const CAPITALES = { Paris: 4, Reims: 2.5, Rouen: 2, Bordeaux: 3, Londres: 3, Calais: 1.5, "Orléans": 1.5, Bourges: 1 };

export function valeurLieu(D, n) {
  const l = D.lieux[n];
  const rv = D.regions[l.region] ? D.regions[l.region][1] / 4 : 0.3;
  return 1 + (l.pf ? 1.5 : 0) + rv + (CAPITALES[n] || 0);
}
function besoinControle(D, g, c, n) { return defense(D, g, n) + g.inf[n][adv(c)] - g.inf[n][c]; }
function gainUnPoint(D, g, c, n) {
  const v = valeurLieu(D, n), avant = controle(D, g, n);
  const besoin = besoinControle(D, g, c, n);
  if (besoin === 1) return v * 3;
  if (avant === adv(c) && g.inf[n][adv(c)] === defense(D, g, n) + g.inf[n][c]) return v * 2.5;
  if (besoin <= 0) return v * 0.15; // déjà contrôlé : marge de sécurité
  return v / (1 + besoin);
}

export function evaluer(D, g) { // point de vue de la France
  if (g.fin) return g.fin.gagnant === F ? 1000 : -1000;
  let v = g.score;
  for (const r of Object.keys(D.regions)) { const p = etatRegion(D, g, r); v += 0.35 * (p.F - p.A); }
  v += 0.25 * (g.tresor.F - g.tresor.A) + 0.6 * (g.legit.F - g.legit.A);
  for (const f of FACTIONS) if (f !== "Rome") { const l = g.loy[f]; v += 0.5 * l + (Math.abs(l) === 3 ? 2 * Math.sign(l) : Math.abs(l) === 2 ? 0.5 * Math.sign(l) : 0); }
  const ctl = n => controle(D, g, n);
  if (ctl("Paris") === A) v -= 3; if (ctl("Reims") === A) v -= 2; if (ctl("Paris") === A && ctl("Reims") === A) v -= 8;
  if (ctl("Bordeaux") === F) v += 3; if (ctl("Rouen") === F) v += 2;
  v += 0.8 * Math.max(0, g.treve - g.militaire.A) - 0.8 * Math.max(0, g.treve - g.militaire.F);
  let tot = 0; for (const n of D.noms) tot += g.inf[n].F - g.inf[n].A;
  return v + 0.05 * tot;
}
const pourCamp = (c, v) => (c === F ? v : -v);

function planInfluence(D, g, c, ops) {
  const acc = lieuxAccessibles(D, g, c);
  const couts = Object.fromEntries(acc.map(n => [n, coutInfluence(D, g, c, n)]));
  const sauve = {}; const plan = [];
  let reste = ops;
  while (reste > 0) {
    let best = null, bv = -1;
    for (const n of acc) { if (couts[n] > reste) continue; const v = gainUnPoint(D, g, c, n) / couts[n]; if (v > bv) { bv = v; best = n; } }
    if (!best) break;
    if (!(best in sauve)) sauve[best] = g.inf[best][c];
    g.inf[best][c]++; plan.push(best); reste -= couts[best];
  }
  for (const n in sauve) g.inf[n][c] = sauve[n];
  return plan;
}
function valeurAssaut(D, g, c, ops, n) {
  let e = 0;
  for (let d = 1; d <= 6; d++) { const r = d + ops - 2 * defense(D, g, n) + bonusAssaut(D, g, c, n); if (r > 0) e += Math.min(r, g.inf[n][adv(c)]) * 1.5 + (g.regles?.pillage && !D.lieux[n].pf ? 0 : Math.max(0, r - g.inf[n][adv(c)])); }
  return (e / 6) * valeurLieu(D, n);
}

function simuler(D, g, c, action, tirages) {
  let s = 0;
  for (let t = 0; t < tirages; t++) {
    const h = structuredClone(g);
    h.journal = null; h.graine = (g.graine ^ (0x9e3779b9 * (t + 1))) | 0;
    jouer(D, h, c, action);
    s += pourCamp(c, evaluer(D, h));
  }
  return s / tirages;
}

export function creerIA(opts = {}) {
  const tirages = opts.tirages ?? 3, aleaChoix = opts.alea ?? 0.15;
  return {
    placement(D, g, c, candidats) {
      let best = null, bv = -1;
      for (const n of candidats) { const v = gainUnPoint(D, g, c, n); if (v > bv) { bv = v; best = n; } }
      return best;
    },
    retrait(D, g, cible, possibles) {
      let best = possibles[0], bv = -1;
      for (const n of possibles) {
        const marge = g.inf[n][cible] - defense(D, g, n) - g.inf[n][adv(cible)];
        const v = valeurLieu(D, n) * (controle(D, g, n) === cible && marge === 0 ? 3 : 1 / (1 + Math.max(0, marge)));
        if (v > bv) { bv = v; best = n; }
      }
      return best;
    },
    cibleAssaut(D, g, c, ops, cibles) {
      let best = cibles[0], bv = -1;
      for (const n of cibles) { const v = valeurAssaut(D, g, c, ops, n); if (v > bv) { bv = v; best = n; } }
      return best;
    },
    ouverture(D, g, c) {
      const ids = g.mains[c].filter(id => !carte(D, id).decompte);
      if (!ids.length) return null;
      let best = ids[0], bv = -Infinity;
      for (const id of ids) {
        const k = carte(D, id);
        let v = 0;
        for (let t = 0; t < tirages; t++) {
          const h = structuredClone(g); h.journal = null; h.graine = (g.graine ^ (0x85ebca6b * (t + 1))) | 0;
          h.mains[c] = h.mains[c].filter(x => x !== id);
          if (evenementPossible(D, h, k.camp === "N" ? c : k.camp, id)) resoudreEvenement(D, h, c, id);
          v += pourCamp(c, evaluer(D, h)) - k.ops * 0.3; // garder les fortes cartes pour les actions
        }
        if (v > bv) { bv = v; best = id; }
      }
      return best;
    },
    action(D, g, c, roundsRestants) {
      const main = g.mains[c];
      const decomptes = main.filter(id => carte(D, id).decompte);
      const candidats = [];
      if (decomptes.length && decomptes.length > roundsRestants) {
        for (const id of decomptes) candidats.push({ id, mode: "evenement" });
      } else {
        for (const id of main) {
          const k = carte(D, id);
          if (k.decompte) { candidats.push({ id, mode: "evenement" }); continue; }
          const ops = opsCarte(D, g, c, id);
          if (k.camp !== adv(c) && evenementPossible(D, g, k.camp === "N" ? c : k.camp, id)) candidats.push({ id, mode: "evenement" });
          if (ops > 0) {
            candidats.push({ id, mode: "influence", cibles: planInfluence(D, g, c, ops) });
            const lev = g.regles?.levee && g.tresor[c] >= 3;
            if (lev) candidats.push({ id, mode: "influence", cibles: planInfluence(D, g, c, ops + 1), levee: true });
            const cibles = ciblesAssaut(D, g, c).filter(n => g.tresor[c] >= coutAssaut(D, g, n)).map(n => [n, valeurAssaut(D, g, c, ops, n)]).sort((x, y) => y[1] - x[1]).slice(0, 3);
            for (const [n] of cibles) candidats.push({ id, mode: "assaut", cible: n, depense: g.tresor[c] >= 6 ? 2 : 0 });
            if (lev && cibles.length && g.tresor[c] >= 3 + coutAssaut(D, g, cibles[0][0])) candidats.push({ id, mode: "assaut", cible: cibles[0][0], depense: 0, levee: true });
            const sieges = ciblesAssaut(D, g, c).sort((x, y) => valeurLieu(D, y) * (controle(D, g, y) === adv(c) ? 2 : 1) - valeurLieu(D, x) * (controle(D, g, x) === adv(c) ? 2 : 1)).slice(0, 1);
            if (sieges.length) candidats.push({ id, mode: "siege", cibles: sieges });
            if (!g.diplo[c]) {
              const f = factionsActives(g)
                .filter(f => Math.abs(g.loy[f]) < 3 || Math.sign(g.loy[f]) !== (c === F ? 1 : -1))
                .sort((x, y) => (c === F ? g.loy[x] - g.loy[y] : g.loy[y] - g.loy[x]))[0];
              if (f) candidats.push({ id, mode: "diplomatie", cible: f, depense: g.tresor[c] >= 4 ? 2 : 0 });
            }
            if (!g.legitTente[c]) candidats.push({ id, mode: "legitimite" });
          }
        }
      }
      let best = candidats[0], bv = -Infinity;
      for (const a of candidats) {
        const v = simuler(D, g, c, a, tirages) + (alea(g) - 0.5) * aleaChoix;
        if (v > bv) { bv = v; best = a; }
      }
      return best;
    },
  };
}
