// IA heuristique, version 2 : évalue chaque coup légal en le simulant sur une copie de l'état
// (plusieurs tirages de dés, les mêmes pour tous les coups), puis garde le meilleur.
// Quatre niveaux : creerIA({ niveau: "ecuyer" | "chevalier" | "connetable" | "roi" }).
// Les choix de détail (où placer, où retirer) suivent des règles gloutonnes rapides.
import {
  A, F, adv, carte, controle, defense, lieuxAccessibles, coutInfluence, ciblesAssaut, bonusAssaut, coutAssaut,
  evenementPossible, opsCarte, jouer, resoudreEvenement, etatRegion, FACTIONS, factionsActives, alea, de,
  penche, lieuxFaction, fusionFlandre, signatureEtat, effetMarqueur,
} from "./regles.js?v=ef8d3d6b";

const CAPITALES = { Paris: 4, Reims: 2.5, Rouen: 2, Bordeaux: 3, Londres: 3, Calais: 1.5, "Orléans": 1.5, Bourges: 1 };
const REQ_LEGIT = [0, 2, 2, 3, 3, 3, 4, 4, 4]; // miroir de regles.js : OPS requis pour viser la case n
const CARTE_GENERIQUE = 15; // carte neutre à 3 OPS : sert de « carte inconnue » pour la réplique adverse (niveau roi)

// Réglages des niveaux. tirages : simulations par coup (multiple de 6 : premier dé stratifié) ;
// alea : bruit ajouté au choix ; candidats : 0 réduits, 1 normaux, 2 enrichis ; main : valeur des cartes gardées ;
// finale : tirages de plus pour départager les 8 meilleurs coups ; reponse : coups dont on simule la réplique adverse.
export const NIVEAUX = {
  ecuyer: { tirages: 1, alea: 2.5, candidats: 0, main: false, finale: 0, reponse: 0 },
  chevalier: { tirages: 6, alea: 0.15, candidats: 1, main: true, finale: 0, reponse: 0 },
  connetable: { tirages: 6, alea: 0.05, candidats: 2, main: true, finale: 24, reponse: 0 },
  roi: { tirages: 6, alea: 0.05, candidats: 2, main: true, finale: 24, reponse: 4 },
};

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

// actions encore à jouer ce tour par le camp cc (la taille des mains est publique)
function actionsRestantes(g, cc) {
  const rounds = g.phase === 1 ? 6 : 7;
  const r = g.round === 0 ? rounds : rounds - g.round + (cc === F && g.actif === A ? 1 : 0);
  return Math.max(0, Math.min(r, g.mains[cc].length));
}
// valeur d'une carte gardée en main (pour son détenteur) : une carte adverse finira par servir l'adversaire
function valeurCarte(D, c, id) {
  const k = carte(D, id);
  if (k.decompte) return 0;
  return k.camp === adv(c) ? -0.3 - 0.15 * k.ops : 0.15 * k.ops + (k.camp === c ? 0.3 : 0);
}

// point de vue de la France ; vue : camp qui évalue (il connaît sa main), P : réglages du niveau
export function evaluer(D, g, vue = null, P = null) {
  if (g.fin) return g.fin.gagnant === F ? 1000 : -1000;
  let v = g.score;
  const mainVue = vue ? g.mains[vue] : [];
  for (const r of Object.keys(D.regions)) {
    const p = etatRegion(D, g, r);
    // un décompte en main sera joué ce tour : la région vaut presque ses points
    const w = mainVue.some(id => carte(D, id).decompte === r) ? (P?.wDecompte ?? 0.9) : 0.35;
    v += w * (p.F - p.A);
  }
  v += 0.25 * (g.tresor.F - g.tresor.A) + 0.6 * (g.legit.F - g.legit.A);
  for (const f of FACTIONS) if (f !== "Rome") { const l = g.loy[f]; v += 0.5 * l + (Math.abs(l) === 3 ? 2 * Math.sign(l) : Math.abs(l) === 2 ? 0.5 * Math.sign(l) : 0); }
  const ctl = n => controle(D, g, n);
  if (ctl("Paris") === A) v -= 3; if (ctl("Reims") === A) v -= 2; if (ctl("Paris") === A && ctl("Reims") === A) v -= 8;
  if (ctl("Bordeaux") === F) v += 3; if (ctl("Rouen") === F) v += 2;
  if (vue) { // chevauchées de fin de tour : le manque qu'on ne pourra plus combler compte plein, le reste moins
    for (const cc of [A, F]) {
      const manque = Math.max(0, g.treve - g.militaire[cc]), couvrable = Math.min(manque, 3 * actionsRestantes(g, cc));
      const pen = manque - couvrable + (P?.couvrable ?? 0.45) * couvrable;
      v += cc === A ? pen : -pen;
    }
  } else v += 0.8 * Math.max(0, g.treve - g.militaire.A) - 0.8 * Math.max(0, g.treve - g.militaire.F);
  if (vue && P?.main) { let m = 0; for (const id of mainVue) m += valeurCarte(D, vue, id); v += vue === F ? m : -m; }
  let tot = 0; for (const n of D.noms) tot += g.inf[n].F - g.inf[n].A;
  return v + 0.05 * tot + valeurStatuts(g);
}
// effets durables des cartes : valeur par tour restant (point de vue français), sinon l'IA ne joue jamais ces événements
const STATUT_TOUR = { gabelle: 0.5, taille: 0.5, pragmatique: 0.25, jacquesCoeur: 0.25, bedford: -0.25, duGuesclin: 0.4, compagnies: 0.4, bureau: 0.3, arc: -0.2, jeanne: 0.2, roiCaptif: -1, folieCharlesVI: -0.2, owain: 0.5, calaisImprenable: -0.1 };
const STATUT_UNE_FOIS = { jarretiere: -0.4, dunois: 0.4, lundiNoir: 0.5, grandFerre: 0.5 };
function valeurStatuts(g) {
  const restants = Math.max(0, 10 - g.tour) + 0.5;
  let v = 0;
  for (const [k, x] of Object.entries(STATUT_TOUR)) if (g.statuts[k]) v += x * restants;
  for (const [k, x] of Object.entries(STATUT_UNE_FOIS)) if (g.statuts[k]) v += x;
  if (g.statuts.manche) v += (g.statuts.manche === F ? 0.3 : -0.3) * restants;
  return v;
}
const pourCamp = (c, v) => (c === F ? v : -v);

// plan d'Influence glouton ; lieux : restreint à une liste (plan régional)
function planInfluence(D, g, c, ops, lieux = null) {
  let acc = lieuxAccessibles(D, g, c);
  if (lieux) acc = acc.filter(n => lieux.includes(n));
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
// modificateur de Siège d'un camp sur un lieu (miroir de regles.js)
function modSiege(D, g, camp, n) {
  const vois = D.lieux[n].voisins.filter(v => controle(D, g, v) === camp).length;
  const sup = g.inf[n][camp] > g.inf[n][adv(camp)] ? 1 : 0;
  const fac = ["Flandre", "Bretagne", "Bourgogne", "Navarre"].filter(f => !(f === "Flandre" && fusionFlandre(g)) && penche(g, f) === camp && lieuxFaction(D, g, f).includes(n)).length;
  return vois + sup + fac;
}
// chance de réussite d'une Diplomatie (miroir de regles.js)
function chanceDiplo(g, c, ops, f, dep) {
  const l = g.loy[f], bonus = (g.paliers[5] === c ? 1 : 0) + (Math.abs(l) === 2 && Math.sign(l) === (c === F ? 1 : -1) ? 1 : 0);
  const besoin = 5 + Math.abs(l) - ops - Math.floor(Math.min(dep, g.tresor[c]) / 2) - bonus; // le dé doit faire au moins « besoin »
  return Math.max(0, Math.min(6, 7 - besoin)) / 6;
}
// intérêt d'un cran de loyauté vers le camp c (pour trier les factions avant simulation)
function interetDiplo(g, c, f) {
  const l = g.loy[f] * (c === F ? 1 : -1); // l > 0 : déjà de notre côté
  return 1 + (l === 1 || l === 2 ? 1.5 : 0) + (l === -3 || l === -2 ? 1.5 : 0) + (f === "Bourgogne" || f === "Flandre" ? 0.5 : 0);
}
// événement sans effet ici (condition non réunie) : on ne gâche pas une carte pour rien
function evenementVide(D, g, c, id) {
  const k = carte(D, id);
  if (k.decompte || effetMarqueur(D, k.nom)) return false;
  const h = structuredClone(g); h.journal = null;
  h.mains[c] = h.mains[c].filter(x => x !== id);
  const avant = signatureEtat(h);
  resoudreEvenement(D, h, c, id);
  return signatureEtat(h) === avant;
}
function legitPossible(D, g, c, id) {
  const cible = g.legit[c] + 1;
  return !g.legitTente[c] && cible <= 8 && opsCarte(D, g, c, id) >= REQ_LEGIT[cible];
}

// graines communes à tous les coups d'une décision (même hasard pour les comparer) ;
// par paquets de 6, le premier dé tiré prend chaque face une fois (Assaut, Diplomatie, Légitimité exacts)
function graines(base, T) {
  const s = [];
  for (let t = 0; t < T; t++) {
    let x = (base ^ Math.imul(0x9e3779b9, t + 1)) | 0;
    if (T % 6 === 0) { const face = (t % 6) + 1; for (let i = 0; i < 64; i++) { if (de({ graine: x }) === face) break; x = (x + 0x632be5ab) | 0; } }
    s.push(x);
  }
  return s;
}
function simuler(D, g, c, action, seeds, P) {
  let s = 0;
  for (let t = 0; t < seeds.length; t++) {
    const h = structuredClone(g);
    h.journal = null; h.graine = seeds[t];
    jouer(D, h, c, action);
    const v = pourCamp(c, evaluer(D, h, c, P));
    if (t === 0 && h.graine === seeds[0]) return v; // aucun dé tiré : le résultat est sûr
    s += v;
  }
  return s / seeds.length;
}
// meilleure réplique gloutonne de l'adversaire, sans connaître sa main (carte neutre à 3 OPS) ; valeur pour c
function apresReponse(D, g, c, action, seeds, P) {
  const o = adv(c);
  let s = 0;
  for (const seed of seeds) {
    const h = structuredClone(g);
    h.journal = null; h.graine = seed;
    jouer(D, h, c, action);
    if (h.fin || actionsRestantes(h, o) === 0) { s += pourCamp(c, evaluer(D, h, c, P)); continue; }
    const id = CARTE_GENERIQUE, ops = opsCarte(D, h, o, id);
    const reps = [{ id, mode: "influence", cibles: planInfluence(D, h, o, ops) }];
    for (const [n] of ciblesAssaut(D, h, o).filter(n => h.tresor[o] >= coutAssaut(D, h, n)).map(n => [n, valeurAssaut(D, h, o, ops, n)]).sort((x, y) => y[1] - x[1]).slice(0, 2))
      reps.push({ id, mode: "assaut", cible: n });
    if (!h.diplo[o]) {
      const note = f => chanceDiplo(h, o, ops, f, 0) * interetDiplo(h, o, f);
      const f = factionsActives(h).filter(f => chanceDiplo(h, o, ops, f, 0) > 0).sort((x, y) => note(y) - note(x))[0];
      if (f) reps.push({ id, mode: "diplomatie", cible: f });
    }
    const sous = graines(h.graine, 6);
    let pire = Infinity;
    for (const r of reps) pire = Math.min(pire, -simuler(D, h, o, r, sous, P));
    s += pire;
  }
  return s / seeds.length;
}

// coups candidats ; nc : 0 réduits (écuyer), 1 normaux, 2 enrichis
function candidatsAction(D, g, c, roundsRestants, nc) {
  const main = g.mains[c];
  const decomptes = main.filter(id => carte(D, id).decompte);
  const L = [];
  if (decomptes.length && decomptes.length > roundsRestants) {
    for (const id of decomptes) L.push({ id, mode: "evenement" });
    return L;
  }
  const t = g.tresor[c];
  const regionsDecompte = decomptes.map(id => carte(D, id).decompte);
  for (const id of main) {
    const k = carte(D, id);
    if (k.decompte) { L.push({ id, mode: "evenement" }); continue; }
    const ops = opsCarte(D, g, c, id);
    if (k.camp !== adv(c) && evenementPossible(D, g, k.camp === "N" ? c : k.camp, id) && (nc === 0 || !evenementVide(D, g, c, id))) L.push({ id, mode: "evenement" });
    if (ops <= 0) continue;
    const ordres = k.camp === adv(c) && nc >= 2 ? [{}, { ordre: "apres" }] : [{}];
    const lev = nc >= 1 && g.regles?.levee && t >= 3;
    // Influence : plan global, plus (enrichi) un plan par région
    for (const o of ordres) {
      L.push({ id, mode: "influence", cibles: planInfluence(D, g, c, ops), ...o });
      if (lev) L.push({ id, mode: "influence", cibles: planInfluence(D, g, c, ops + 1), levee: true, ...o });
    }
    if (nc >= 2) for (const r of Object.keys(D.regions)) {
      const ls = D.noms.filter(n => D.lieux[n].region === r);
      const p = planInfluence(D, g, c, ops, ls);
      if (p.length) L.push({ id, mode: "influence", cibles: p });
      if (lev && regionsDecompte.includes(r)) { const p2 = planInfluence(D, g, c, ops + 1, ls); if (p2.length) L.push({ id, mode: "influence", cibles: p2, levee: true }); }
    }
    // Assaut
    const cibles = ciblesAssaut(D, g, c).filter(n => t >= coutAssaut(D, g, n)).map(n => [n, valeurAssaut(D, g, c, ops, n)]).sort((x, y) => y[1] - x[1]).slice(0, nc === 0 ? 1 : nc === 1 ? 3 : 4);
    for (const [n] of cibles) {
      const reste = t - coutAssaut(D, g, n);
      const deps = nc === 0 ? [0] : nc === 1 ? [t >= 6 ? 2 : 0] : [0, ...(reste >= 2 ? [2] : []), ...(reste >= 4 ? [4] : [])];
      for (const depense of deps) for (const o of ordres) L.push({ id, mode: "assaut", cible: n, depense, ...o });
    }
    if (lev && cibles.length && t >= 3 + coutAssaut(D, g, cibles[0][0])) L.push({ id, mode: "assaut", cible: cibles[0][0], depense: 0, levee: true });
    // Siège : les lieux où notre modificateur l'emporte (écuyer : le lieu le plus précieux, comme avant)
    const cs = ciblesAssaut(D, g, c);
    if (nc === 0) {
      const s = cs.sort((x, y) => valeurLieu(D, y) * (controle(D, g, y) === adv(c) ? 2 : 1) - valeurLieu(D, x) * (controle(D, g, x) === adv(c) ? 2 : 1))[0];
      if (s) L.push({ id, mode: "siege", cibles: [s] });
    } else {
      const notes = cs.map(n => [n, modSiege(D, g, c, n) - modSiege(D, g, adv(c), n), valeurLieu(D, n) * (controle(D, g, n) === adv(c) ? 2 : 1)])
        .filter(x => x[1] >= 0).sort((x, y) => y[1] - x[1] || y[2] - x[2]).slice(0, nc === 1 ? 2 : 3);
      for (const [n] of notes) L.push({ id, mode: "siege", cibles: [n] });
      if (nc >= 2 && notes.length >= 2) L.push({ id, mode: "siege", cibles: [notes[0][0], notes[1][0]] });
      if (nc >= 2 && notes.length && t >= 2) L.push({ id, mode: "siege", cibles: [notes[0][0]], depense: 2 });
    }
    // Diplomatie : toutes les factions qu'on peut faire bouger (et non plus la seule plus hostile, souvent hors d'atteinte)
    if (!g.diplo[c]) {
      const deps = nc >= 2 ? [0, 2, 4].filter(d => d <= t) : [t >= 4 ? 2 : 0];
      const fs = [];
      for (const f of factionsActives(g)) {
        if (g.loy[f] === (c === F ? 3 : -3)) continue; // déjà ralliée
        for (const depense of deps) { const p = chanceDiplo(g, c, ops, f, depense); if (p > 0) fs.push([f, depense, p * interetDiplo(g, c, f) - 0.1 * depense]); }
      }
      if (nc === 0) { // écuyer : la faction la plus hostile, comme avant, si elle reste à portée
        const f = fs.sort((x, y) => (c === F ? g.loy[x[0]] - g.loy[y[0]] : g.loy[y[0]] - g.loy[x[0]]))[0];
        if (f) L.push({ id, mode: "diplomatie", cible: f[0], depense: f[1] });
      } else for (const [f, depense] of fs.sort((x, y) => y[2] - x[2]).slice(0, nc === 1 ? 2 : 6)) L.push({ id, mode: "diplomatie", cible: f, depense });
    }
    // Légitimité : seulement si la carte a assez d'OPS (sinon l'action est vide)
    if (legitPossible(D, g, c, id)) L.push({ id, mode: "legitimite" });
  }
  const vu = new Set(); // doublons (plans identiques)
  return L.filter(a => { const k = JSON.stringify(a); if (vu.has(k)) return false; vu.add(k); return true; });
}

export function creerIA(opts = {}) {
  const N = { ...(NIVEAUX[opts.niveau] || NIVEAUX.chevalier) };
  if (opts.tirages != null) N.tirages = opts.tirages;
  if (opts.alea != null) N.alea = opts.alea;
  for (const k of ["candidats", "main", "finale", "reponse", "couvrable", "wDecompte"]) if (opts[k] != null) N[k] = opts[k]; // réglages d'essai
  return {
    niveau: NIVEAUX[opts.niveau] ? opts.niveau : "chevalier",
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
      let ids = g.mains[c].filter(id => !carte(D, id).decompte);
      if (!ids.length) return null;
      const utiles = ids.filter(id => { const k = carte(D, id); return k.camp === adv(c) || !evenementPossible(D, g, k.camp === "N" ? c : k.camp, id) || !evenementVide(D, g, c, id); });
      if (N.candidats > 0 && utiles.length) ids = utiles; // ouverture : pas d'événement propre qui ne change rien
      const seeds = graines(g.graine ^ 0x85ebca6b, N.finale ? 12 : N.tirages);
      let best = ids[0], bv = -Infinity;
      for (const id of ids) {
        const k = carte(D, id);
        let v = 0;
        for (const seed of seeds) {
          const h = structuredClone(g); h.journal = null; h.graine = seed;
          h.mains[c] = h.mains[c].filter(x => x !== id);
          if (evenementPossible(D, h, k.camp === "N" ? c : k.camp, id)) resoudreEvenement(D, h, c, id);
          v += pourCamp(c, evaluer(D, h, c, N)) - (N.main ? 0 : k.ops * 0.3); // garder les fortes cartes pour les actions
        }
        v = v / seeds.length + (alea(g) - 0.5) * N.alea;
        if (v > bv) { bv = v; best = id; }
      }
      return best;
    },
    action(D, g, c, roundsRestants) {
      const candidats = candidatsAction(D, g, c, roundsRestants, N.candidats);
      if (candidats.length <= 1) return candidats[0] || null;
      const base = g.graine, seeds = graines(base, N.tirages);
      let notes = candidats.map(a => ({ a, v: simuler(D, g, c, a, seeds, N) }));
      if (N.finale) { // départage des 8 meilleurs avec plus de tirages
        notes.sort((x, y) => y.v - x.v);
        notes = notes.slice(0, 8);
        const fin = graines(base ^ 0x27d4eb2f, N.finale);
        for (const x of notes) x.v = (x.v * seeds.length + simuler(D, g, c, x.a, fin, N) * fin.length) / (seeds.length + fin.length);
        notes.sort((x, y) => y.v - x.v);
      }
      if (N.reponse && actionsRestantes(g, adv(c)) > 0) { // roi : réplique adverse sur les meilleurs coups
        const rep = graines(base ^ 0x165667b1, 6);
        notes = notes.slice(0, N.reponse);
        for (const x of notes) x.v = 0.5 * x.v + 0.5 * apresReponse(D, g, c, x.a, rep, N);
      }
      let best = notes[0].a, bv = -Infinity;
      for (const x of notes) {
        const v = x.v + (alea(g) - 0.5) * N.alea;
        if (v > bv) { bv = v; best = x.a; }
      }
      return best;
    },
  };
}
