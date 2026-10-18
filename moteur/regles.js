// Moteur de règles de « Guerre de Cent Ans » (version 0.1).
// Il ne dépend d'aucune interface : l'état de jeu est un objet sérialisable et chaque décision
// est demandée à un « décideur » (IA ou joueur humain) via l'objet DECIDEURS.
// Référence : regles.md (version 0.1). Les écarts volontaires sont signalés par « Interprétation ».

export const A = "A", F = "F";
export const adv = c => (c === A ? F : A);

const REQ_LEGIT = [0, 2, 2, 3, 3, 3, 4, 4, 4]; // OPS requis pour viser la case n
const JET_LEGIT = n => (n <= 4 ? 4 : n <= 7 ? 3 : 2);
const FACTIONS = ["Flandre", "Bretagne", "Bourgogne", "Écosse", "Castille", "Navarre", "Papauté", "Rome"];

// ---------------------------------------------------------------- données
export function preparerDonnees(brut) {
  const lieux = {};
  for (const l of brut.lieux) lieux[l.nom] = l;
  const cartes = brut.cartes.map(c => ({ ...c, decompte: c.camp === "S" ? c.nom.replace("Décompte : ", "") : null }));
  const parNom = Object.fromEntries(cartes.map(c => [c.nom, c]));
  return { lieux, noms: Object.keys(lieux), cartes, parNom, regions: brut.regions };
}

// ---------------------------------------------------------------- hasard reproductible
export function alea(g) {
  // mulberry32
  let t = (g.graine = (g.graine + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const de = g => 1 + Math.floor(alea(g) * 6);
function melanger(g, t) {
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(alea(g) * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  return t;
}

// ---------------------------------------------------------------- état initial
export function nouvellePartie(D, graine = 1, options = {}) {
  const g = {
    graine, tour: 1, phase: 1, round: 0, actif: A,
    inf: Object.fromEntries(D.noms.map(n => [n, { ...D.lieux[n].inf }])),
    treve: 5, crise: 0, score: 0,
    tresor: { A: options.tresorA ?? 7, F: options.tresorF ?? 5 },
    legit: { A: options.legitA ?? 0, F: options.legitF ?? 0 },
    paliers: {},
    loy: { Flandre: -1, Bretagne: 0, Bourgogne: 2, "Écosse": 2, Castille: 1, Navarre: 0, "Papauté": 1, Rome: 0, ...options.loyDepart },
    mains: { A: [], F: [] }, pioche: [], defausse: [], retirees: [],
    joues: {}, sortis: {}, prerequisSouple: options.prerequisSouple ?? false, seuil: options.seuilScore ?? 25, regles: { pillage: options.pillage ?? true, revenuReduit: options.revenuReduit ?? true, coutAssaut: options.coutAssaut ?? true, levee: options.levee ?? true, decomptesPhase: options.decomptesPhase ?? null, decomptesGarantis: options.decomptesGarantis ?? true, factions2: options.factions2 ?? true, valeurs: options.valeursRegion ?? null }, statuts: {}, tourFlags: {}, opsMalus: { A: 0, F: 0 }, opsMalusTour: { A: 0, F: 0 },
    militaire: { A: 0, F: 0 }, diplo: { A: false, F: false }, legitTente: { A: false, F: false },
    fin: null, journal: options.journal ? [] : null,
    stats: { evenements: {}, assauts: { A: 0, F: 0 }, sieges: { A: 0, F: 0 }, diplomatie: { A: 0, F: 0 }, legitimite: { A: 0, F: 0 }, influence: { A: 0, F: 0 }, penalitesMil: { A: 0, F: 0 }, decomptes: [], vp: {}, ciblesAssaut: {}, tresorPerdu: { A: 0, F: 0 }, tresorFinTour: [] },
  };
  etape(g, { k: "debut" });
  // Influence libre de la mise en place (Interprétation : placée par le décideur, France d'abord)
  for (const [n, k] of Object.entries(options.infSupF ?? {})) ajouter(g, F, n, k);
  placerLibre(D, g, F, options.libreF ?? 2, D.noms.filter(n => (options.franceGuyenne || D.lieux[n].region !== "Guyenne") && D.lieux[n].region !== "Angleterre"));
  placerLibre(D, g, A, options.libreA ?? 9, D.noms.filter(n => (options.libreAGuyenne === false ? ["Flandre", "Bretagne"] : ["Guyenne", "Flandre", "Bretagne"]).includes(D.lieux[n].region) || (D.lieux[n].port && D.lieux[n].region !== "Angleterre")));
  ajouterPhase(D, g, 1);
  return g;
}

function ajouterPhase(D, g, p) {
  const ids = D.cartes.filter(c => (g.regles?.decomptesPhase?.[c.decompte] ?? c.phase) === p).map(c => c.id);
  g.pioche = melanger(g, g.pioche.concat(ids));
  // les décomptes d'une nouvelle phase sont glissés parmi les 12 cartes du dessus : ils sortent au plus tard au tour suivant
  if (p > 1 && g.regles?.decomptesGarantis) for (const id of ids.filter(id => carte(D, id).decompte)) {
    g.pioche.splice(g.pioche.indexOf(id), 1);
    g.pioche.splice(Math.max(0, g.pioche.length - Math.floor(alea(g) * 12)), 0, id);
  }
}

export const carte = (D, id) => D.cartes[id - 1];
const log = (g, m) => { if (g.journal) g.journal.push(`T${g.tour}.${g.round} ${m}`); };

// ---------------------------------------------------------------- récit (interface) : chaque étape d'une partie réelle, avec une photo
// de l'état, pour que l'interface puisse la rejouer. Inactif dans les simulations (pas de journal) et sans effet sur le hasard.
let RECIT = null;
export function activerRecit(t) { RECIT = t; }
const photo = g => ({ inf: Object.values(g.inf).map(i => [i.A, i.F]), score: g.score, tresor: { ...g.tresor }, legit: { ...g.legit }, paliers: { ...g.paliers }, treve: g.treve, crise: g.crise, loy: { ...g.loy } });
export function etape(g, o) { if (RECIT && g.journal) RECIT.push({ tour: g.tour, round: g.round, ...o, snap: photo(g) }); }

// ---------------------------------------------------------------- contrôle et zones
export function controle(D, g, n) {
  const i = g.inf[n], d = defense(D, g, n);
  if (i.A >= d + i.F && i.A > 0) return A;
  if (i.F >= d + i.A && i.F > 0) return F;
  return null;
}
export function defense(D, g, n) {
  if (n === "Paris" && g.joues["Fondation de la Bastille"]) return Math.max(D.lieux[n].defense, 4);
  return D.lieux[n].defense;
}
export function zone(D, z) {
  let l = D.noms;
  if (z.r) { const r = [].concat(z.r); l = l.filter(n => r.includes(D.lieux[n].region)); }
  if (z.p) l = l.filter(n => z.p.includes(D.lieux[n].pays));
  if (z.l) l = z.l.slice();
  if (z.sauf) l = l.filter(n => !z.sauf.includes(n));
  return l;
}
export const ajouter = (g, c, n, k = 1) => { g.inf[n][c] += k; };
export const retirer = (g, c, n, k = 1) => { g.inf[n][c] = Math.max(0, g.inf[n][c] - k); };
export function forcerControle(D, g, c, n) {
  const besoin = defense(D, g, n) + g.inf[n][adv(c)] - g.inf[n][c];
  if (besoin > 0) ajouter(g, c, n, besoin);
}
export function maitriseManche(D, g) {
  if (g.statuts.manche) return g.statuts.manche;
  if (g.loy.Castille >= 3) return F;
  if (g.loy.Castille <= -3) return A;
  return null;
}

// Placement et retrait choisis par le décideur du camp concerné
export function placerLibre(D, g, c, n, candidats) {
  for (let k = 0; k < n; k++) {
    const l = DECIDEURS[c].placement(D, g, c, candidats);
    if (!l) return;
    ajouter(g, c, l);
    etape(g, { k: "place", camp: c, lieu: l });
  }
}
export function retirerChoisi(D, g, cible, n, candidats) {
  // le camp adverse de « cible » choisit où retirer
  for (let k = 0; k < n; k++) {
    const possibles = candidats.filter(l => g.inf[l][cible] > 0);
    if (!possibles.length) return;
    const l = DECIDEURS[adv(cible)].retrait(D, g, cible, possibles);
    retirer(g, cible, l);
    etape(g, { k: "retire", camp: adv(cible), cible, lieu: l });
  }
}

// ---------------------------------------------------------------- pistes
export function treve(D, g, d) {
  g.treve = Math.min(5, g.treve + d);
  if (g.treve <= 1 && !g.fin) terminer(g, adv(g.actif), "Trêve à 1 (royaume ruiné)");
}
export const crise = (g, d) => { g.crise = Math.max(0, Math.min(6, g.crise + d)); };
export const tresor = (g, c, d) => { g.tresor[c] = Math.max(0, Math.min(12, g.tresor[c] + d)); };
export function score(g, d) { // d > 0 favorise la France
  const s = g.seuil ?? 25;
  if (g.stats) { const k = `${g.tour <= 3 ? "I" : g.tour <= 7 ? "II" : "III"}|${g._ctx || "?"}`; g.stats.vp[k] = (g.stats.vp[k] || 0) + d; }
  g.score = Math.max(-s, Math.min(s, g.score + d));
  if (g.score >= s && !g.fin) terminer(g, F, `Score de ${s}`);
  if (g.score <= -s && !g.fin) terminer(g, A, `Score de ${s}`);
}
export const vp = (g, c, n) => score(g, c === F ? n : -n);
export function legit(g, c, d) {
  const avant = g.legit[c];
  g.legit[c] = Math.max(0, Math.min(8, g.legit[c] + d));
  for (let k = avant + 1; k <= g.legit[c]; k++) palier(g, c, k);
}
function palier(g, c, k) {
  const premier = !g.paliers[k];
  if (premier) g.paliers[k] = c;
  g.paliersCamp = g.paliersCamp || { A: {}, F: {} }; // un seul bonus par camp et par case, même si la piste redescend puis remonte
  if (g.paliersCamp[c][k]) return;
  g.paliersCamp[c][k] = true;
  if (k === 2) vp(g, c, premier ? 2 : 1);
  if (k === 8) vp(g, c, premier ? 4 : 2);
}
export const HERITAGE = "Héritage flamand de Philippe le Hardi";
export const fusionFlandre = g => !!g.joues[HERITAGE];
export function loy(g, f, d) { // d > 0 : vers la France
  if (f === "Flandre" && fusionFlandre(g)) f = "Bourgogne"; // après 1384, Flandre et Bourgogne n'ont plus qu'une piste
  g.loy[f] = Math.max(-3, Math.min(3, g.loy[f] + d));
}
export const versCamp = (c, n) => (c === F ? n : -n);
const piste = (g, f) => g.loy[f === "Flandre" && fusionFlandre(g) ? "Bourgogne" : f];
const rallie = (g, f) => (piste(g, f) >= 3 ? F : piste(g, f) <= -3 ? A : null);
// faction qui penche nettement (±2, demi-effet) ou ralliée (±3)
const penche = (g, f) => (g.regles?.factions2 === false ? rallie(g, f) : piste(g, f) >= 2 ? F : piste(g, f) <= -2 ? A : null);
// lieux propres à une faction (bonus de Siège à ±2) ; la Bourgogne garde la Flandre après la fusion
export function lieuxFaction(D, g, f) {
  if (f === "Navarre") return ["Évreux", "Cherbourg"];
  if (f === "Bourgogne" && fusionFlandre(g)) return zone(D, { r: ["Bourgogne", "Flandre"] });
  if (["Flandre", "Bretagne", "Bourgogne"].includes(f)) return zone(D, { r: f });
  return [];
}
// factions qu'on peut courtiser : plus de Flandre après la fusion, Rome seulement pendant le Grand Schisme
// Papauté à ±2 de son côté ; pendant le Grand Schisme, il faut aussi Rome à ±2 du même côté
export const schismeEnCours = g => !!(g.joues["Grand Schisme d'Occident"] && !g.joues["Concile de Constance"]);
export const papeFavorable = (g, c) => penche(g, "Papauté") === c && (!schismeEnCours(g) || penche(g, "Rome") === c);
export const factionsActives = g => FACTIONS.filter(f => !(f === "Flandre" && fusionFlandre(g)) && (f !== "Rome" || (g.joues["Grand Schisme d'Occident"] && !g.joues["Concile de Constance"])));

export function terminer(g, gagnant, raison) {
  g.fin = { gagnant, raison, tour: g.tour };
  log(g, `FIN : ${gagnant} gagne (${raison})`);
  etape(g, { k: "fin", gagnant, raison });
}

// ---------------------------------------------------------------- OPS d'une carte
export function opsCarte(D, g, c, id) {
  const k = carte(D, id);
  let o = k.ops + (g.opsMalus[c] ? -1 : 0) + (g.opsMalusTour[c] ? -1 : 0);
  if (c === F && g.statuts.roiCaptif) o -= 1;
  if (g.crise >= 4 && k.ops === 1) return 0;
  return Math.max(k.ops > 0 ? 1 : 0, o);
}

// ---------------------------------------------------------------- actions
export function coutInfluence(D, g, c, n) { return controle(D, g, n) === adv(c) ? 2 : 1; }
export function lieuxAccessibles(D, g, c) {
  const acc = new Set();
  for (const n of D.noms) if (g.inf[n][c] > 0) { acc.add(n); for (const v of D.lieux[n].voisins) acc.add(v); }
  if (maitriseManche(D, g) === c && D.noms.some(n => D.lieux[n].port && controle(D, g, n) === c))
    for (const n of D.noms) if (D.lieux[n].port) acc.add(n);
  if (rallie(g, "Flandre") === c)
    for (const n of zone(D, { r: "Flandre" })) acc.add(n);
  if (c === F) for (const n of zone(D, { r: "Angleterre" })) if (g.inf[n].F === 0) acc.delete(n); // Interprétation : pas d'implantation française en Angleterre sans tête de pont
  return [...acc];
}
export function actionInfluence(D, g, c, ops, choix) {
  // choix : liste ordonnée de lieux (un point d'OPS par entrée, coût recalculé au début de l'action)
  const acc = new Set(lieuxAccessibles(D, g, c));
  const couts = Object.fromEntries([...acc].map(n => [n, coutInfluence(D, g, n === n ? c : c, n)]));
  let reste = ops;
  const refus = []; // points prévus mais non posés (l'événement adverse joué avant l'action a pu changer le lieu)
  for (const n of choix) {
    if (!acc.has(n)) { refus.push([n, "acces"]); continue; }
    const k = couts[n];
    if (k > reste) { refus.push([n, "cout", k]); continue; }
    reste -= k; ajouter(g, c, n);
    g.stats.influence[c]++;
  }
  return refus;
}
export function assautsInterdits(D, g, n, c = null) {
  const r = D.lieux[n].region;
  if (r === "Angleterre") return true;
  if (g.tourFlags.aucunAssaut) return true;
  if (g.tourFlags.aucunAssautBretagne && r === "Bretagne") return true;
  if (g.tourFlags.aucunAssautBretagneF && c === F && r === "Bretagne") return true; // Jeanne la Flamme
  if (g.treve <= 4 && r === "Île-de-France") return true;
  if (g.treve <= 3 && r === "Guyenne") return true;
  if (g.treve <= 2 && r === "Normandie") return true;
  if (n === "Calais" && g.statuts.calaisImprenable) return true;
  return false;
}
export function ciblesAssaut(D, g, c) { return D.noms.filter(n => g.inf[n][adv(c)] > 0 && !assautsInterdits(D, g, n, c)); }
// détail des bonus d'Assaut : [libellé, valeur] (affiché par l'interface)
export function bonusAssautDetail(D, g, c, n) {
  const b = [];
  const v = D.lieux[n].voisins.find(v => controle(D, g, v) === c);
  if (v) b.push([`lieu voisin contrôlé (${v})`, 1]);
  if (c === F && g.statuts.duGuesclin) b.push(["Du Guesclin connétable", 1]);
  if (c === F && g.statuts.compagnies) b.push(["Compagnies d'ordonnance", 1]);
  if (c === F && g.statuts.bureau && D.lieux[n].pf) b.push(["Les frères Bureau (place forte)", 1]);
  if (c === A && g.statuts.bastille && n === "Paris") b.push(["la Bastille", -1]);
  if (rallie(g, "Bretagne") === c && ["Bretagne", "Normandie"].includes(D.lieux[n].region)) b.push(["Bretagne ralliée", 1]);
  else if (penche(g, "Bretagne") === c && D.lieux[n].region === "Bretagne") b.push(["Bretagne favorable (±2)", 1]);
  if (penche(g, "Navarre") === c && ["Évreux", "Cherbourg"].includes(n)) b.push(["Navarre favorable", 1]);
  if (penche(g, "Castille") === c && D.lieux[n].port) b.push(["flotte castillane (port)", 1]);
  if (g.crise >= 4) b.push([`Crise à ${g.crise}`, -1]);
  return b;
}
export function bonusAssaut(D, g, c, n) { return bonusAssautDetail(D, g, c, n).reduce((s, x) => s + x[1], 0); }
export const coutAssaut = (D, g, n) => g.regles?.coutAssaut ? (D.lieux[n].pf ? 2 : 1) : 0; // règle Twilight : l'Assaut (coup d'État) ne coûte rien
export function assaut(D, g, c, ops, n, { depense = 0, gratuit = false, sansTreve = false } = {}) {
  if (!gratuit && assautsInterdits(D, g, n, c)) return false;
  if (!gratuit) { const k = coutAssaut(D, g, n); if (g.tresor[c] < k) return false; tresor(g, c, -k); }
  if (c === A && g.statuts.grandFerre) { // Le Grand Ferré annule le prochain Assaut anglais
    g.statuts.grandFerre = false; g.militaire[c] += ops; g.stats.assauts[c]++;
    etape(g, { k: "assaut", camp: c, lieu: n, annule: "Le Grand Ferré", d: 0, ops, def: defense(D, g, n), bonus: 0, bd: [], dep: 0, r: 0, avant: g.inf[n][adv(c)], retire: 0, occupe: 0, gratuit, pf: !!D.lieux[n].pf, treve: false });
    return false;
  }
  const dep = Math.min(depense, 4, g.tresor[c]); tresor(g, c, -dep);
  const d = de(g), def = defense(D, g, n), bd = bonusAssautDetail(D, g, c, n), bonus = bd.reduce((s, x) => s + x[1], 0);
  const r = d + ops - 2 * def + bonus + Math.floor(dep / 2), avant = g.inf[n][adv(c)];
  let retireN = 0, occupe = 0;
  g.militaire[c] += ops; g.stats.assauts[c]++; g.stats.ciblesAssaut[n] = (g.stats.ciblesAssaut[n] || 0) + 1;
  if (r > 0) {
    const o = adv(c), retire = Math.min(r, g.inf[n][o]);
    retirer(g, o, n, retire); retireN = retire;
    if (!(g.regles?.pillage && !D.lieux[n].pf)) { ajouter(g, c, n, r - retire); occupe = r - retire; } // pillage : une chevauchée hors place forte dévaste sans occuper
  }
  log(g, `${c} assaut ${n} (${ops} OPS) → ${r}`);
  etape(g, { k: "assaut", camp: c, lieu: n, d, ops, def, bonus, bd, dep, r, avant, retire: retireN, occupe, gratuit, pf: !!D.lieux[n].pf, treve: !!(D.lieux[n].pf && !sansTreve) });
  if (D.lieux[n].pf && !sansTreve) treve(D, g, -1);
  return r > 0;
}
export function siege(D, g, c, n, depense = 0) {
  const o = adv(c);
  const dep = Math.min(depense, 4, g.tresor[c]); tresor(g, c, -dep);
  const vois = camp => D.lieux[n].voisins.filter(v => controle(D, g, v) === camp).length, sup = camp => (g.inf[n][camp] > g.inf[n][adv(camp)] ? 1 : 0);
  const fac = camp => ["Flandre", "Bretagne", "Bourgogne", "Navarre"].filter(f => !(f === "Flandre" && fusionFlandre(g)) && penche(g, f) === camp && lieuxFaction(D, g, f).includes(n));
  const mod = camp => vois(camp) + sup(camp) + fac(camp).length;
  const da = de(g), dd = de(g), ma = mod(c), md = mod(o), det = { va: vois(c), sa: sup(c), vd: vois(o), sd: sup(o), fa: fac(c), fd: fac(o) };
  const ra = da + ma + Math.floor(dep / 2), rd = dd + md;
  g.stats.sieges[c]++;
  if (ra > rd) retirer(g, o, n, ra - rd); else if (rd > ra) retirer(g, c, n, rd - ra);
  etape(g, { k: "siege", camp: c, lieu: n, da, ma, dep, ra, dd, md, rd, ...det });
}
export function diplomatie(D, g, c, ops, f, depense = 0) {
  const dep = Math.min(depense, 4, g.tresor[c]); tresor(g, c, -dep);
  const d = de(g), bonus = (g.paliers[5] === c ? 1 : 0) + (Math.abs(g.loy[f]) === 2 && Math.sign(g.loy[f]) === (c === F ? 1 : -1) ? 1 : 0);
  let r = d + ops + Math.floor(dep / 2) + bonus;
  g.diplo[c] = true; g.stats.diplomatie[c]++;
  const seuil = 5 + Math.abs(g.loy[f]), ok = r >= seuil;
  if (ok) loy(g, f, versCamp(c, 1));
  etape(g, { k: "diplo", camp: c, f, d, ops, dep, bonus, r, seuil, ok });
}
export function tentativeLegit(D, g, c, id) {
  const cible = g.legit[c] + 1;
  if (cible > 8 || opsCarte(D, g, c, id) < REQ_LEGIT[cible]) return false;
  g.legitTente[c] = true; g.stats.legitimite[c]++;
  const seuil = JET_LEGIT(cible) + (papeFavorable(g, c) ? 1 : 0); // Papauté favorable : le jet est plus facile
  const d = de(g), ok = d <= seuil;
  if (ok) legit(g, c, 1);
  etape(g, { k: "legit", camp: c, cible, d, seuil, ok, pape: papeFavorable(g, c) });
  return true;
}
export function bataille(D, g, c, ops, siVictoire) {
  // Interprétation (à valider) : 1d6 + bonus ≥ 4 ; une Bataille compte ses OPS comme chevauchée.
  g.militaire[c] += ops;
  if (c === A && g.statuts.lundiNoir) { g.statuts.lundiNoir = false; etape(g, { k: "bataille", camp: c, lundiNoir: true, ok: false }); return false; }
  const bd = [];
  if (c === A && g.statuts.arc) bd.push(["archers (Ordonnance sur le tir à l'arc)", 1]);
  if (c === A && g.statuts.jarretiere) { bd.push(["Ordre de la Jarretière", 1]); g.statuts.jarretiere = false; }
  if (c === F && g.statuts.jeanne) bd.push(["Jeanne d'Arc", 1]);
  if (c === F && g.statuts.dunois) { bd.push(["Dunois", 1]); g.statuts.dunois = false; }
  if (c === A && g.tourFlags.aiguillon) bd.push(["Aiguillon", 1]);
  const b = bd.length;
  const d = de(g), ok = d + b >= 4;
  log(g, `${c} bataille → ${ok ? "victoire" : "échec"}`);
  etape(g, { k: "bataille", camp: c, d, bonus: b, bd, ok });
  if (ok) siVictoire();
  return ok;
}

// ---------------------------------------------------------------- décompte
export function etatRegion(D, g, r) {
  const ls = zone(D, { r });
  const res = {};
  for (const c of [A, F]) {
    const ctl = ls.filter(n => controle(D, g, n) === c);
    res[c] = { n: ctl.length, pf: ctl.filter(n => D.lieux[n].pf).length, nonPf: ctl.filter(n => !D.lieux[n].pf).length, ctl };
  }
  const totPf = ls.filter(n => D.lieux[n].pf).length;
  const capAdv = { A: "Paris", F: "Londres" };
  const pts = {};
  for (const c of [A, F]) {
    const m = res[c], o = res[adv(c)];
    let niv = 0;
    if (m.n > 0) niv = 1;
    if (m.n > o.n && m.pf > o.pf && m.nonPf > 0) niv = 2;
    if (m.n > o.n && m.pf === totPf && totPf > 0) niv = 3;
    const v = niv ? (g.regles?.valeurs?.[r] ?? D.regions[r])[niv - 1] : 0;
    pts[c] = v + m.pf + m.ctl.filter(n => D.lieux[n].voisins.includes(capAdv[c])).length;
  }
  return pts;
}
export function decompter(D, g, r) {
  const p = etatRegion(D, g, r);
  score(g, p.F - p.A);
  g.stats.decomptes.push({ r, tour: g.tour, ecart: p.F - p.A });
  log(g, `Décompte ${r} : F ${p.F} / A ${p.A}`);
  if (RECIT && g.journal) { const ls = zone(D, { r }); etape(g, { k: "decompte", r, pts: p, ctl: { A: ls.filter(n => controle(D, g, n) === A), F: ls.filter(n => controle(D, g, n) === F) }, total: ls.length, pf: ls.filter(n => D.lieux[n].pf) }); }
}

// ---------------------------------------------------------------- jouer une carte
import { EFFETS } from "./effets.js?v=ef8d3d6b";
export function prerequisOk(D, g, k) {
  if (!k.prerequis) return true;
  if (k.prerequis === "Roi captif") return !!g.statuts.roiCaptif;
  // Variante « prérequis souple » : il suffit que la carte prérequise soit sortie (jouée pour son événement ou ses OPS)
  return !!g.joues[k.prerequis] || (g.prerequisSouple && !!g.sortis[k.prerequis]);
}
export function evenementPossible(D, g, c, id) {
  const k = carte(D, id);
  if (k.decompte) return true;
  if (!prerequisOk(D, g, k)) return false;
  if (!EFFETS[k.nom]) return false;
  if (c === F && k.camp === F && k.ops === 1 && g.statuts.folieCharlesVI) return false;
  return true;
}
// ce qu'un événement peut changer : sert à repérer ceux qui restent sans effet (condition non réunie)
const HORS_SIGNATURE = new Set(["graine", "journal", "stats", "_ctx", "joues", "sortis"]);
export const signatureEtat = g => JSON.stringify(g, (k, v) => HORS_SIGNATURE.has(k) ? undefined : v);
// cartes dont l'effet tient au seul fait d'avoir été jouées (règle lue ailleurs, ou prérequis d'une autre carte)
const MARQUEURS = new Set([HERITAGE, "Grand Schisme d'Occident", "Concile de Constance", "Traité de Troyes", "Bataille de Mauron"]);
export const effetMarqueur = (D, nom) => MARQUEURS.has(nom) || D.cartes.some(x => x.prerequis === nom);
export function resoudreEvenement(D, g, joueur, id) {
  const k = carte(D, id);
  g._ctx = k.decompte ? `Décompte ${k.decompte}` : `Évt ${k.nom}`;
  if (k.decompte) { etape(g, { k: "evenement", id, camp: joueur, joueur }); decompter(D, g, k.decompte); return true; }
  if (!prerequisOk(D, g, k)) { etape(g, { k: "sansEffet", id, camp: joueur }); return false; }
  const benef = k.camp === "N" ? joueur : k.camp;
  etape(g, { k: "evenement", id, camp: benef, joueur });
  const avant = RECIT && g.journal ? signatureEtat(g) : null;
  EFFETS[k.nom](D, g, benef);
  etape(g, { k: "effets", id, camp: benef, vide: avant !== null && avant === signatureEtat(g) && !effetMarqueur(D, k.nom) }); // vide : condition non réunie, rien n'a changé
  g.joues[k.nom] = true;
  g.stats.evenements[k.nom] = (g.stats.evenements[k.nom] || 0) + 1;
  log(g, `Événement ${k.nom} (${benef})`);
  return true;
}
function defausser(D, g, id, evenementJoue) {
  const k = carte(D, id);
  g.sortis[k.nom] = true;
  if (evenementJoue && k.retiree) g.retirees.push(id); else g.defausse.push(id);
}
// action = { id, mode: "evenement" | "influence" | "assaut" | "siege" | "diplomatie" | "legitimite", cibles, cible, depense, ordre }
export function jouer(D, g, c, action) {
  const { id } = action;
  action = { ...action };
  const k = carte(D, id);
  g.mains[c] = g.mains[c].filter(x => x !== id);
  let evt = false;
  if (action.mode === "evenement") {
    etape(g, { k: "carte", camp: c, id, mode: "evenement" });
    g.opsMalus[c] = 0; // le malus (Écosse ralliée, Owain) frappe la première carte du tour, même jouée pour son événement
    evt = resoudreEvenement(D, g, c, id);
  } else {
    // « différé » : carte adverse dont l'événement se joue d'abord ; le joueur choisit ensuite l'usage de ses OPS
    // (Influence, Assaut, Siège ou Diplomatie ; la Légitimité, qui ne déclenche pas l'événement, n'est plus possible)
    let apresEvt = false;
    if (action.mode === "differe") {
      etape(g, { k: "carte", camp: c, id, mode: "differe", ops: opsCarte(D, g, c, id), declenche: true, ordre: "avant" });
      evt = resoudreEvenement(D, g, adv(c), id);
      if (g.fin) { g.opsMalus[c] = 0; defausser(D, g, id, evt); return; }
      const suite = DECIDEURS[c].apresEvenement ? DECIDEURS[c].apresEvenement(D, g, c, id) : null;
      action = { ...(suite || { mode: "influence", cibles: [] }), id, ordre: "avant" };
      if (!["influence", "assaut", "siege", "diplomatie"].includes(action.mode)) action = { id, mode: "influence", cibles: [], ordre: "avant" };
      apresEvt = true;
    }
    let ops = opsCarte(D, g, c, id);
    g.opsMalus[c] = 0; // consommé par cette carte ; un malus posé ensuite par l'événement vaut pour la carte suivante
    const levee = !!(action.levee && g.regles?.levee && g.tresor[c] >= 3 && action.mode !== "legitimite");
    if (levee) { tresor(g, c, -3); ops += 1; } // lever des compagnies
    const declenche = k.camp === adv(c) && action.mode !== "legitimite" && !apresEvt;
    etape(g, { k: "carte", camp: c, id, mode: action.mode, ops, levee, declenche, apresEvt, ordre: action.ordre || "avant", cibles: action.cibles, cible: action.cible, depense: action.depense || 0 });
    if (declenche && action.ordre !== "apres") evt = resoudreEvenement(D, g, adv(c), id);
    if (!g.fin) {
      if (action.mode === "influence") { const refus = actionInfluence(D, g, c, ops, action.cibles); etape(g, { k: "influence", camp: c, ops, cibles: action.cibles, refus }); }
      else if (action.mode === "assaut") assaut(D, g, c, ops, action.cible, { depense: action.depense || 0 });
      else if (action.mode === "siege") for (let i = 0; i < ops && !g.fin; i++) { const n = action.cibles[i] || action.cibles[0]; if (g.inf[n][adv(c)] > 0 && !assautsInterdits(D, g, n, c)) siege(D, g, c, n, i === 0 ? action.depense || 0 : 0); }
      else if (action.mode === "diplomatie") diplomatie(D, g, c, ops, action.cible, action.depense || 0);
      else if (action.mode === "legitimite") tentativeLegit(D, g, c, id);
    }
    if (declenche && action.ordre === "apres" && !g.fin) evt = resoudreEvenement(D, g, adv(c), id);
  }
  defausser(D, g, id, evt);
}

// ---------------------------------------------------------------- déroulement d'un tour
export const DECIDEURS = { A: null, F: null };
export function definirDecideurs(da, df) { DECIDEURS.A = da; DECIDEURS.F = df; }

function piocher(D, g, c, taille) {
  while (g.mains[c].length < taille) {
    if (!g.pioche.length) { if (!g.defausse.length) return; g.pioche = melanger(g, g.defausse); g.defausse = []; }
    g.mains[c].push(g.pioche.pop());
  }
}
export function jouerTour(D, g) {
  const p = g.tour <= 3 ? 1 : g.tour <= 7 ? 2 : 3;
  if (p !== g.phase) { g.phase = p; ajouterPhase(D, g, p); }
  if (g.tour === 8) { delete g.statuts.cherbourgBrest; delete g.statuts.owain; } // la révolte galloise s'éteint vers 1415
  g.tourFlags = {}; g.militaire = { A: 0, F: 0 }; g.diplo = { A: false, F: false }; g.legitTente = { A: false, F: false };
  treve(D, g, 1);
  const main = p === 1 ? 8 : 9, rounds = p === 1 ? 6 : 7;
  piocher(D, g, A, main); piocher(D, g, F, main);
  etape(g, { k: "tour", phase: p, rounds, main, nouvellePhase: g.tour === 4 || g.tour === 8 });
  // bonus des factions ralliées en début de tour
  for (const c of [A, F]) {
    const fl = fusionFlandre(g) ? ["Flandre"] : [], et = fusionFlandre(g) ? ", Flandre" : "";
    if (rallie(g, "Bourgogne") === c) { etape(g, { k: "info", camp: c, txt: `La Bourgogne ralliée donne 2 Influence en Bourgogne, Île-de-France${et}.` }); placerLibre(D, g, c, 2, zone(D, { r: ["Bourgogne", "Île-de-France", ...fl] })); }
    if (rallie(g, "Bretagne") === c) { etape(g, { k: "info", camp: c, txt: "La Bretagne ralliée donne 1 Influence en Bretagne." }); placerLibre(D, g, c, 1, zone(D, { r: "Bretagne" })); }
    if (rallie(g, "Navarre") === c) { etape(g, { k: "info", camp: c, txt: "La Navarre ralliée donne 1 Influence à Évreux ou Cherbourg." }); placerLibre(D, g, c, 1, ["Évreux", "Cherbourg"]); }
    if (rallie(g, "Écosse") === c) { g.opsMalus[adv(c)] = 1; etape(g, { k: "info", camp: c, txt: `L'Écosse ralliée retient ${adv(c) === A ? "l'Angleterre" : "la France"} : −1 OPS sur sa première carte du tour.` }); }
  }
  if (g.statuts.owain) g.opsMalus.A = 1;
  // ouverture (headline)
  const hA = DECIDEURS.A.ouverture(D, g, A), hF = DECIDEURS.F.ouverture(D, g, F);
  const ordre = [[A, hA], [F, hF]].filter(x => x[1]).sort((x, y) => carte(D, y[1]).ops - carte(D, x[1]).ops);
  etape(g, { k: "ouverture", cartes: ordre.map(([c, id]) => ({ camp: c, id })) });
  for (const [c, id] of ordre) {
    if (g.fin) return;
    g.actif = c; g.mains[c] = g.mains[c].filter(x => x !== id);
    const k = carte(D, id);
    let evt = false;
    if (evenementPossible(D, g, k.camp === "N" ? c : k.camp, id)) evt = resoudreEvenement(D, g, c, id);
    else etape(g, { k: "sansEffet", id, camp: c });
    defausser(D, g, id, evt);
  }
  // rounds d'action
  for (let r = 1; r <= rounds && !g.fin; r++) {
    g.round = r;
    for (const c of [A, F]) {
      if (g.fin) break;
      if (!g.mains[c].length) continue;
      g.actif = c;
      const action = DECIDEURS[c].action(D, g, c, rounds - r);
      if (action) jouer(D, g, c, action);
    }
  }
  if (g.fin) return;
  finDeTour(D, g);
}
function finDeTour(D, g) {
  // chevauchées obligatoires
  g._ctx = "Chevauchées manquées";
  etape(g, { k: "finTour" });
  const manques = {};
  for (const c of [A, F]) {
    const manque = Math.max(0, g.treve - g.militaire[c]);
    manques[c] = manque;
    if (manque) { vp(g, adv(c), manque); g.stats.penalitesMil[c] += manque; }
  }
  etape(g, { k: "chevauchees", treve: g.treve, mil: { ...g.militaire }, manques });
  if (g.fin) return;
  // finances
  const revs = {};
  for (const c of [A, F]) {
    const ctl = D.noms.filter(n => controle(D, g, n) === c);
    let rev = g.regles?.revenuReduit
      ? 1 + Math.floor(ctl.length / 4) + Math.min(1, ctl.filter(n => D.lieux[n].port).length) - Math.floor(g.crise / 2)
      : 2 + Math.floor(ctl.length / 3) + Math.min(2, ctl.filter(n => D.lieux[n].port).length) - Math.floor(g.crise / 2);
    if (c === F && g.statuts.gabelle) rev += 2;
    if (c === F && g.statuts.pragmatique) rev += 1;
    if (c === F && g.statuts.taille) rev += 2;
    if (c === F && g.statuts.jacquesCoeur) rev += 1;
    if (c === A && g.statuts.bedford) rev += 2;
    if (rallie(g, "Flandre") === c) rev += 2; else if (penche(g, "Flandre") === c) rev += 1; // laine flamande (Bourgogne après la fusion)
    if (penche(g, "Écosse") === adv(c)) rev -= 1; // frontière écossaise à garder
    g.stats.tresorPerdu[c] += Math.max(0, g.tresor[c] + Math.max(0, rev) - 12);
    tresor(g, c, Math.max(0, rev));
    revs[c] = Math.max(0, rev);
  }
  etape(g, { k: "revenus", revs });
  g.stats.tresorFinTour.push({ tour: g.tour, A: g.tresor.A, F: g.tresor.F, score: g.score });
  // crise
  if (g.crise >= 6) for (const n of D.noms) if (D.lieux[n].defense === 1) { retirer(g, A, n); retirer(g, F, n); }
  const peste = g.crise >= 6;
  crise(g, -1);
  etape(g, { k: "crise", peste });
  // légitimité et papauté
  g._ctx = "Légitimité/Papauté (fin de tour)";
  const tete = g.legit.F > g.legit.A ? F : g.legit.A > g.legit.F ? A : null, p8 = g.paliers[8] || null;
  if (g.legit.F !== g.legit.A) vp(g, g.legit.F > g.legit.A ? F : A, 1);
  if (g.paliers[8]) vp(g, g.paliers[8], 1);
  const schisme = g.joues["Grand Schisme d'Occident"] && !g.joues["Concile de Constance"];
  const pape = rallie(g, "Papauté");
  if (pape && (!schisme || rallie(g, "Rome") === pape)) { legit(g, pape, 1); if (g.treve <= 3) g.treve += 1; }
  etape(g, { k: "finLegit", tete, p8, pape: pape && (!schisme || rallie(g, "Rome") === pape) ? pape : null });
  if (g.fin) return;
  // cartes de décompte gardées en main
  for (const c of [A, F]) if (g.mains[c].some(id => carte(D, id).decompte)) { terminer(g, adv(c), "Carte de décompte gardée en main"); return; }
  // victoires automatiques
  if (controle(D, g, "Paris") === A && controle(D, g, "Reims") === A) { terminer(g, A, "Paris et Reims (double monarchie)"); return; }
  if (["Bordeaux", "Rouen", "Paris"].every(n => controle(D, g, n) === F)) { terminer(g, F, "Bordeaux, Rouen et Paris"); return; }
  g.opsMalusTour = g.prochainMalus || { A: 0, F: 0 }; g.prochainMalus = { A: 0, F: 0 };
  if (g.statuts.mancheJusque && g.tour >= g.statuts.mancheJusque) { g.statuts.manche = g.statuts.mancheAvant ?? null; delete g.statuts.mancheJusque; delete g.statuts.mancheAvant; } // fin de « Bataille de la Seine »
  if (g.tour === 10) {
    g._ctx = "Décompte final";
    etape(g, { k: "info", txt: "Fin du dixième tour : décompte final de toutes les régions." });
    for (const r of Object.keys(D.regions)) decompter(D, g, r);
    if (!g.fin) terminer(g, g.score > 0 ? F : g.score < 0 ? A : controle(D, g, "Paris") === A ? A : F, "Décompte final");
    return;
  }
  g.tour++;
}
export function jouerPartie(D, g) {
  while (!g.fin) jouerTour(D, g);
  return g;
}
export { FACTIONS, rallie, penche };
