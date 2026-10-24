// Moteur de règles de « Guerre de Cent Ans » (version 0.1).
// Il ne dépend d'aucune interface : l'état de jeu est un objet sérialisable et chaque décision
// est demandée à un « décideur » (IA ou joueur humain) via l'objet DECIDEURS.
// Référence : regles.md (version 0.1). Les écarts volontaires sont signalés par « Interprétation ».

export const A = "A", F = "F";
export const adv = c => (c === A ? F : A);

const REQ_LEGIT = [0, 2, 2, 3, 3, 3, 4, 4, 4]; // OPS requis pour viser la case n
const JET_LEGIT = n => (n <= 4 ? 4 : n <= 7 ? 3 : 2);
const FACTIONS = ["Flandre", "Bretagne", "Bourgogne", "Écosse", "Castille", "Navarre"];
// structure de la partie : 4 phases de 3 tours
export const NB_TOURS = 12;
export const phaseDe = t => Math.min(4, Math.ceil(t / 3));
export const PREMIER_TOUR = { 1: 1, 2: 4, 3: 7, 4: 10 };
export const premierJoueur = g => (g.tour % 2 === 1 ? A : F); // premier joueur en alternance : l'Angleterre aux tours impairs, la France aux tours pairs (AlwwAl, 23/10)
// cartes du pape (hors paquet)
export const PAPE = "Faveur du pape", PAPE_AVIGNON = "Pape d'Avignon", PAPE_ROME = "Pape de Rome";

// ---------------------------------------------------------------- données
// grandes batailles soumises à la « Fortune des armes » (règle d'AlwwAl du 21/10 : quelques événements seulement)
export const FORTUNE = new Set(["Bataille de Crécy", "Bataille de Poitiers", "Bataille d'Azincourt", "Bataille de Cocherel", "Bataille de Pontvallain",
  "Bataille de La Rochelle", "Bataille de Roosebeke", "Bataille de Baugé", "Bataille de Patay", "Bataille de Formigny", "Bataille de Castillon"]);
export function preparerDonnees(brut) {
  const lieux = {};
  for (const l of brut.lieux) lieux[l.nom] = l;
  const cartes = brut.cartes.map(c => ({ ...c, decompte: c.camp === "S" ? c.nom.replace("Décompte : ", "") : null, interdit: c.interdit || [], fin: c.fin ?? 4, statut: c.statut || "obligatoire",
    militaire: FORTUNE.has(c.nom) }));
  const parNom = Object.fromEntries(cartes.map(c => [c.nom, c]));
  const idPape = parNom[PAPE]?.id ?? null;
  const papesSchisme = { F: parNom[PAPE_AVIGNON]?.id ?? null, A: parNom[PAPE_ROME]?.id ?? null }; // cartes du Grand Schisme, une par camp
  const idsPape = new Set([idPape, papesSchisme.F, papesSchisme.A].filter(x => x != null));
  return { lieux, noms: Object.keys(lieux), cartes, parNom, regions: brut.regions, idPape, papesSchisme, idsPape };
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
    loy: { Flandre: -1, Bretagne: 0, Bourgogne: 2, "Écosse": 2, Castille: 1, Navarre: 0, ...options.loyDepart },
    mains: { A: [], F: [] }, pioche: [], defausse: [], retirees: [], ecartees: [],
    pape: { attente: null, bonus: { A: 0, F: 0 } }, // Faveur du pape : camp qui la recevra au tour suivant ; bonus d'OPS en attente
    paquet: { tirage: options.tirageFacultatives ?? { 1: 33, 2: 34, 3: 30, 4: 18 }, dessus: options.nouvellesDessus ?? 0.4, equilibre: options.tirageEquilibre ?? false, main: options.mains ?? [9, 10], rounds: options.rounds ?? [7, 8] },
    joues: {}, sortis: {}, prerequisSouple: options.prerequisSouple ?? true, seuil: options.seuilScore ?? 25, regles: { pillage: options.pillage ?? true, revenuReduit: options.revenuReduit ?? true, coutAssaut: options.coutAssaut ?? true, levee: options.levee ?? true, decomptesPhase: options.decomptesPhase ?? null, decomptesGarantis: options.decomptesGarantis ?? true, purge: options.purge ?? false, opsAjust: options.opsAjust ?? null, fortune: options.fortune ?? 1, fortuneCartes: options.fortuneCartes ?? null, factions2: options.factions2 ?? true, valeurs: options.valeursRegion ?? null }, statuts: {}, tourFlags: {}, opsMalus: { A: 0, F: 0 }, opsMalusTour: { A: 0, F: 0 },
    militaire: { A: 0, F: 0 }, diplo: { A: false, F: false }, legitTente: { A: false, F: false },
    fin: null, journal: options.journal ? [] : null,
    stats: { evenements: {}, assauts: { A: 0, F: 0 }, sieges: { A: 0, F: 0 }, diplomatie: { A: 0, F: 0 }, legitimite: { A: 0, F: 0 }, influence: { A: 0, F: 0 }, penalitesMil: { A: 0, F: 0 }, decomptes: [], vp: {}, ciblesAssaut: {}, tresorPerdu: { A: 0, F: 0 }, tresorFinTour: [] },
  };
  g.miseEnPlace = { F: options.libreF ?? 2, A: options.libreA ?? 8 }; // Influence libre de départ, affichée à l'écran
  etape(g, { k: "debut" });
  // Influence libre de la mise en place (Interprétation : placée par le décideur, France d'abord)
  for (const [n, k] of Object.entries(options.infSupF ?? {})) ajouter(g, F, n, k);
  placerLibre(D, g, F, g.miseEnPlace.F, D.noms.filter(n => (options.franceGuyenne || D.lieux[n].region !== "Guyenne") && D.lieux[n].region !== "Angleterre"));
  placerLibre(D, g, A, g.miseEnPlace.A, D.noms.filter(n => (options.libreAGuyenne === false ? ["Flandre", "Bretagne"] : ["Guyenne", "Flandre", "Bretagne"]).includes(D.lieux[n].region) || (D.lieux[n].port && D.lieux[n].region !== "Angleterre")));
  ajouterPhase(D, g, 1);
  if (D.idPape) g.mains[options.papeDepart ?? F].push(D.idPape); // la Faveur du pape commence en main française
  return g;
}

// Mise en place d'une phase : toutes ses cartes obligatoires et une partie de ses facultatives, tirées camp par camp
// au prorata (pour ne pas déséquilibrer les OPS) ; les autres sont écartées pour la partie.
function cartesDePhase(D, g, p) {
  const dela = D.cartes.filter(c => (g.regles?.decomptesPhase?.[c.decompte] ?? c.phase) === p);
  const ids = dela.filter(c => c.statut === "obligatoire").map(c => c.id);
  const fac = dela.filter(c => c.statut === "facultative");
  const n = Math.min(fac.length, g.paquet?.tirage?.[p] ?? fac.length);
  const camps = ["A", "F", "N"].map(k => fac.filter(c => c.camp === k));
  let quotas = camps.map(l => Math.floor(n * l.length / (fac.length || 1)));
  // option : tirage équilibré, autant de cartes anglaises que françaises (dans la limite des cartes disponibles)
  if (g.paquet?.equilibre) {
    const nN = quotas[2], m = n - nN, qA = Math.min(camps[0].length, Math.max(Math.ceil(m / 2), m - camps[1].length));
    quotas = [qA, Math.min(camps[1].length, m - qA), nN];
  }
  let reste = n - quotas.reduce((a, b) => a + b, 0);
  const frac = camps.map((l, i) => [n * l.length / (fac.length || 1) - quotas[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of frac) if (reste > 0 && quotas[i] < camps[i].length) { quotas[i]++; reste--; }
  camps.forEach((l, i) => { const m = melanger(g, l.map(c => c.id)); ids.push(...m.slice(0, quotas[i])); g.ecartees.push(...m.slice(quotas[i])); });
  return ids;
}
export function ajouterPhase(D, g, p) {
  const ids = cartesDePhase(D, g, p);
  // cartes périmées : un événement unique dont la période est passée quitte la pioche et la défausse (pas les mains)
  if (p > 1 && g.regles?.purge) {
    const perime = x => { const k = carte(D, x); return !k.decompte && k.retiree && k.fin < p; };
    g.perimees = (g.perimees || []).concat(g.pioche.filter(perime), g.defausse.filter(perime));
    g.pioche = g.pioche.filter(x => !perime(x)); g.defausse = g.defausse.filter(x => !perime(x));
  }
  // une part des nouvelles cartes (40 % par défaut) va sur le dessus de la pioche ; le reste est mélangé avec les cartes restantes
  const part = g.paquet?.dessus === true ? 1 : +(g.paquet?.dessus || 0);
  const nouv = melanger(g, ids.slice()), nDessus = Math.round(part * nouv.length);
  const dessus = nouv.slice(0, nDessus), dessous = nouv.slice(nDessus);
  g.pioche = melanger(g, g.pioche.concat(dessous)).concat(dessus); // la fin du tableau est piochée en premier
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
export const retirer = (g, c, n, k = 1) => { g.inf[n][c] = Math.max(c === F && n === "Bourges" && g.statuts?.roiBourges ? Math.min(2, g.inf[n][c]) : 0, g.inf[n][c] - k); }; // « Le roi de Bourges » : jamais sous 2
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
    g.placement = { camp: c, fait: k, total: n }; // lu par l'écran : « Influence k + 1 sur n »
    const l = DECIDEURS[c].placement(D, g, c, candidats);
    delete g.placement;
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
  if (g.stats) { const k = `${["", "I", "II", "III", "IV"][phaseDe(g.tour)]}|${g._ctx || "?"}`; g.stats.vp[k] = (g.stats.vp[k] || 0) + d; }
  if (!g.fin) g.scoreBrut = g.score + d; // total réel, au-delà de ±25 : affiché seulement au tableau d'honneur
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
// factions qu'on peut courtiser : plus de Flandre après la fusion
export const estPape = (D, id) => !!D.idsPape?.has(id); // Faveur du pape, Pape d'Avignon, Pape de Rome
export const schismeEnCours = g => !!(g.joues["Grand Schisme d'Occident"] && !g.joues["Concile de Constance"]);
export const factionsActives = g => FACTIONS.filter(f => !(f === "Flandre" && fusionFlandre(g)));
// ---------------------------------------------------------------- Faveur du pape (façon carte Chine)
export const detenteurPape = (D, g) => D.idPape == null ? null : g.mains.A.includes(D.idPape) ? A : g.mains.F.includes(D.idPape) ? F : g.pape?.attente ?? null;
// « le joueur courant reçoit la Faveur du pape » : elle quitte la main adverse et arrive au tour suivant ; rien pendant le Schisme
export function faveurPape(D, g, c) {
  if (D.idPape == null || schismeEnCours(g)) return false;
  if (g.mains[c].includes(D.idPape) || g.pape.attente === c) return false;
  g.mains[adv(c)] = g.mains[adv(c)].filter(x => x !== D.idPape);
  g.pape.attente = c;
  etape(g, { k: "info", camp: c, txt: `La « Faveur du pape » passe ${c === A ? "à l'Angleterre" : "à la France"} (jouable au tour suivant).` });
  return true;
}

export function terminer(g, gagnant, raison) {
  g.fin = { gagnant, raison, tour: g.tour, cause: g._ctx || null, scoreBrut: g.scoreBrut ?? g.score }; // cause : carte ou phase qui donne la victoire
  log(g, `FIN : ${gagnant} gagne (${raison})`);
  etape(g, { k: "fin", gagnant, raison });
}

// ---------------------------------------------------------------- OPS d'une carte
export function opsCarte(D, g, c, id) {
  const k = carte(D, id);
  const base = id === D.idPape && g.joues["Concile de Constance"] ? 1 : Math.max(k.ops ? 1 : 0, Math.min(4, k.ops + (g.regles?.opsAjust?.[k.camp]?.[k.phase] ?? 0))); // opsAjust : essai d'équilibrage // après le Schisme, la Faveur ne vaut plus que 1 OPS (+1 à la carte suivante)
  let o = base + (g.opsMalus[c] ? -1 : 0) + (g.opsMalusTour[c] ? -1 : 0) + (!estPape(D, id) && g.pape?.bonus?.[c] ? 1 : 0);
  if (c === F && g.statuts.roiCaptif) o -= 1;
  if (g.crise >= 4 && base === 1) return 0; // la Faveur à 1 OPS (après Constance) suit la règle des cartes de 1 OPS
  return Math.max(base > 0 ? 1 : 0, o);
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
  if (n === "Mont-Saint-Michel" && c === A && g.statuts.montImprenable) return true; // Défense du Mont-Saint-Michel
  if ((n === "Cherbourg" || n === "Brest") && g.statuts.cherbourgBrest) return true; // cession jusqu'à la fin de la phase II
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
  if (c === A && g.statuts.grandFerre && ["Picardie", "Valois"].includes(D.lieux[n].pays)) { // Le Grand Ferré annule le prochain Assaut anglais en Picardie ou en Valois (rééquilibrage 21/10)
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
    retirer(g, o, n, retire); retireN = avant - g.inf[n][o]; // retrait effectif (Le roi de Bourges peut le limiter)
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
  const ia = g.inf[n][c], id = g.inf[n][o]; // Influence sur place avant le jet (effectifs de la scène)
  if (ra > rd) retirer(g, o, n, ra - rd); else if (rd > ra) retirer(g, c, n, rd - ra);
  etape(g, { k: "siege", camp: c, lieu: n, da, ma, dep, ra, dd, md, rd, ia, id, pa: ia - g.inf[n][c], pd: id - g.inf[n][o], ...det });
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
  const seuil = JET_LEGIT(cible);
  const d = de(g), ok = d <= seuil;
  if (ok) legit(g, c, 1);
  etape(g, { k: "legit", camp: c, cible, d, seuil, ok });
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
  if (c === A && g.tourFlags.aiguillon && g._ctx === "Évt Bataille de Crécy") bd.push(["Siège d'Aiguillon", 1]);
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
import { EFFETS } from "./effets.js?v=240fe67e";
// prérequis stricts : la carte requise doit avoir été jouée pour son événement (règnes, Jeanne d'Arc, Schisme) ; pour les autres, il suffit qu'elle soit sortie
export const PREREQ_STRICTS = new Set(["Mort de Charles V", "Folie de Charles VI", "Mort de Charles VI", "Mort d'Henri V", "Mort de Bedford", "Bedford régent",
  "Bataille de Patay", "Sacre de Charles VII à Reims", "Capture à Compiègne", "Campagne de la Loire", "Échec devant Paris", "Procès de Rouen",
  "Concile de Constance", "Concile de Pise", "Reprise de Paris", "Traité de Troyes", "Congrès d'Arras"]);
export function prerequisOk(D, g, k) {
  if (!k.prerequis) return true;
  if (k.prerequis === "Roi captif") return !!g.statuts.roiCaptif;
  if (k.nom === "Jeanne d'Arc" && g.inf["Orléans"]?.A > 0) return true; // Orléans menacée : Influence anglaise sur place
  // Variante « prérequis souple » : il suffit que la carte prérequise soit sortie (jouée pour son événement ou ses OPS)
  const souple = g.prerequisSouple && !PREREQ_STRICTS.has(k.nom);
  return k.prerequis.split(" ou ").some(p => !!g.joues[p] || (souple && !!g.sortis[p])); // « A ou B » : l'un des deux suffit
}
// l'événement est-il encore historiquement possible ? (carte de sa période, aucune carte qui l'exclut déjà jouée)
export const raisonInterdit = (D, g, k) => {
  if (k.decompte) return null;
  if (phaseDe(g.tour) > k.fin) return `plus jouable après la phase ${["", "I", "II", "III", "IV"][k.fin]}`;
  const x = k.interdit.find(n => g.joues[n]);
  return x ? `plus jouable après « ${x} »` : null;
};
export const evenementAutorise = (D, g, k) => !!k.decompte || (prerequisOk(D, g, k) && !raisonInterdit(D, g, k));
export function evenementPossible(D, g, c, id) {
  const k = carte(D, id);
  if (k.decompte) return true;
  if (!evenementAutorise(D, g, k)) return false;
  if (!EFFETS[k.nom]) return false;
  if (c === F && k.camp === F && k.ops === 1 && g.statuts.folieCharlesVI) return false;
  return true;
}
// ce qu'un événement peut changer : sert à repérer ceux qui restent sans effet (condition non réunie)
const HORS_SIGNATURE = new Set(["graine", "journal", "stats", "_ctx", "joues", "sortis"]);
export const signatureEtat = g => JSON.stringify(g, (k, v) => HORS_SIGNATURE.has(k) ? undefined : v);
// cartes dont l'effet tient au seul fait d'avoir été jouées (règle lue ailleurs, ou prérequis d'une autre carte)
const MARQUEURS = new Set([HERITAGE, "Grand Schisme d'Occident", "Concile de Constance", "Traité de Troyes", "Bataille de Mauron"]);
export const effetMarqueur = (D, nom) => MARQUEURS.has(nom) || D.cartes.some(x => x.prerequis && x.prerequis.split(" ou ").includes(nom));
export function resoudreEvenement(D, g, joueur, id) {
  const k = carte(D, id);
  g._ctx = k.decompte ? `Décompte ${k.decompte}` : `Évt ${k.nom}`;
  if (k.decompte) { etape(g, { k: "evenement", id, camp: joueur, joueur }); decompter(D, g, k.decompte); return true; }
  if (!evenementAutorise(D, g, k)) { etape(g, { k: "sansEffet", id, camp: joueur, raison: raisonInterdit(D, g, k) }); return false; }
  const benef = k.camp === "N" ? joueur : k.camp;
  etape(g, { k: "evenement", id, camp: benef, joueur });
  // Fortune des armes : une grande bataille échoue sur un dé ≤ seuil ; il n'a pas lieu et l'adversaire marque 1 point
  if (g.regles.fortune && !(benef === A && g.statuts.lundiNoir) && (g.regles.fortuneCartes ? g.regles.fortuneCartes.includes(k.nom) : k.militaire)) {
    const d = de(g);
    if (d <= g.regles.fortune) {
      g._ctx = "Fortune des armes"; vp(g, adv(benef), 1);
      etape(g, { k: "info", titre: "Fortune des armes", camp: adv(benef), txt: `Fortune des armes : dé ${d}, « ${k.nom} » échoue ; ${adv(benef) === F ? "la France" : "l'Angleterre"} marque 1 point.` });
      g.stats.fortune = (g.stats.fortune || 0) + 1;
      log(g, `Fortune des armes : ${k.nom} échoue (${benef})`);
      return true;
    }
  }
  const avant = (RECIT && g.journal) || k.renfort ? signatureEtat(g) : null;
  EFFETS[k.nom](D, g, benef);
  // gain écrit sur la carte (23/10) : seulement si l'événement a vraiment agi (AlwwAl : pas de gain quand la carte reste sans effet)
  if (k.renfort && (avant !== signatureEtat(g) || effetMarqueur(D, k.nom))) {
    if (k.renfort.tresor) tresor(g, benef, k.renfort.tresor);
    if (k.renfort.inf) { const ou = D.noms.filter(n => g.inf[n][benef] > 0); if (ou.length) placerLibre(D, g, benef, k.renfort.inf, ou); }
  }
  etape(g, { k: "effets", id, camp: benef, vide: avant !== null && avant === signatureEtat(g) && !effetMarqueur(D, k.nom) }); // vide : condition non réunie, rien n'a changé
  g.joues[k.nom] = true;
  g.stats.evenements[k.nom] = (g.stats.evenements[k.nom] || 0) + 1;
  log(g, `Événement ${k.nom} (${benef})`);
  return true;
}
function defausser(D, g, id, evenementJoue) {
  const k = carte(D, id);
  if (estPape(D, id) && id !== D.idPape) { (g.pape.retour ||= {})[k.camp] = id; return; } // Pape d'Avignon / de Rome : revient à son camp au tour suivant
  if (id === D.idPape) { g.pape.attente = adv(g.actif); etape(g, { k: "info", camp: adv(g.actif), txt: "La « Faveur du pape » passe à l'adversaire, jouable au tour suivant." }); return; }
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
    let malusEvt = 0; // malus d'OPS posé par l'événement déclenché : il vaut pour la carte suivante, pas pour celle-ci
    if (action.mode === "differe") {
      etape(g, { k: "carte", camp: c, id, mode: "differe", ops: opsCarte(D, g, c, id), declenche: true, ordre: "avant" });
      const malusAvant = g.opsMalus[c];
      evt = resoudreEvenement(D, g, adv(c), id);
      if (g.opsMalus[c] && !malusAvant) { malusEvt = g.opsMalus[c]; g.opsMalus[c] = 0; }
      if (g.fin) { g.opsMalus[c] = 0; defausser(D, g, id, evt); return; }
      const suite = DECIDEURS[c].apresEvenement ? DECIDEURS[c].apresEvenement(D, g, c, id) : null;
      action = { ...(suite || { mode: "influence", cibles: [] }), id, ordre: "avant" };
      if (!["influence", "assaut", "siege", "diplomatie"].includes(action.mode)) action = { id, mode: "influence", cibles: [], ordre: "avant" };
      apresEvt = true;
    }
    let ops = opsCarte(D, g, c, id);
    g.opsMalus[c] = malusEvt; // consommé par cette carte ; un malus posé par l'événement vaut pour la carte suivante
    if (!estPape(D, id) && g.pape?.bonus?.[c]) g.pape.bonus[c] = 0; // bonus du pape consommé par cette carte
    else if (estPape(D, id)) g.pape.bonus[c] = 1; // la Faveur du pape (ou le pape de son camp pendant le Schisme) donne +1 OPS à la carte suivante
    const levee = !!(action.levee && g.regles?.levee && g.tresor[c] >= 3 && action.mode !== "legitimite");
    if (levee) { tresor(g, c, -3); ops += 1; } // lever des compagnies
    const declenche = k.camp === adv(c) && action.mode !== "legitimite" && !apresEvt;
    etape(g, { k: "carte", camp: c, id, mode: action.mode, ops, levee, declenche, apresEvt, ordre: action.ordre || "avant", cibles: action.cibles, cible: action.cible, depense: action.depense || 0 });
    if (declenche && action.ordre !== "apres") evt = resoudreEvenement(D, g, adv(c), id);
    if (!g.fin) {
      g._ctx = `OPS ${k.nom}`;
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
  while (g.mains[c].filter(x => !estPape(D, x)).length < taille) {
    if (!g.pioche.length) { if (!g.defausse.length) return; g.pioche = melanger(g, g.defausse); g.defausse = []; }
    g.mains[c].push(g.pioche.pop());
  }
}
export function jouerTour(D, g) {
  const p = phaseDe(g.tour);
  if (p !== g.phase) { g.phase = p; ajouterPhase(D, g, p); }
  if (g.tour === PREMIER_TOUR[3]) delete g.statuts.cherbourgBrest; // Cherbourg et Brest rendus (1393-1397)
  if (g.tour === PREMIER_TOUR[4] && g.statuts.owain) { delete g.statuts.owain; etape(g, { k: "info", camp: A, txt: "La révolte galloise s'est éteinte : fin d'« Owain Glyndŵr »." }); }
  // Faveur du pape : arrive au tour suivant chez son nouveau détenteur ; pendant le Schisme, chaque camp reprend en main son pape (Avignon / Rome)
  if (g.pape) {
    if (schismeEnCours(g)) { // deux papes : chaque camp tient le sien (1 OPS, +1 OPS à la carte suivante), rendu à chaque tour
      g.mains.A = g.mains.A.filter(x => x !== D.idPape); g.mains.F = g.mains.F.filter(x => x !== D.idPape); g.pape.attente = null; g.pape.retour = null;
      for (const c of [A, F]) { const p = D.papesSchisme?.[c]; if (p != null && !g.mains[c].includes(p)) g.mains[c].push(p); }
    } else {
      if (D.papesSchisme) { g.mains.A = g.mains.A.filter(x => x === D.idPape || !estPape(D, x)); g.mains.F = g.mains.F.filter(x => x === D.idPape || !estPape(D, x)); g.pape.retour = null; }
      if (g.pape.attente && D.idPape != null) { g.mains[g.pape.attente].push(D.idPape); g.pape.attente = null; }
    }
  }
  g.round = 0; g.tourFlags = {}; g.militaire = { A: 0, F: 0 }; g.diplo = { A: false, F: false }; g.legitTente = { A: false, F: false };  // round 0 = mise en place et ouverture (affichage et IA)
  treve(D, g, 1);
  const main = g.paquet.main[p === 1 ? 0 : 1], rounds = g.paquet.rounds[p === 1 ? 0 : 1];
  piocher(D, g, A, main); piocher(D, g, F, main);
  etape(g, { k: "tour", phase: p, rounds, main, premier: premierJoueur(g), nouvellePhase: g.tour > 1 && g.tour === PREMIER_TOUR[p] });
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
  const sansPape = id => (estPape(D, id) ? null : id); // la Faveur du pape ne se joue jamais en ouverture
  const hA = sansPape(DECIDEURS.A.ouverture(D, g, A)), hF = sansPape(DECIDEURS.F.ouverture(D, g, F));
  const prem = premierJoueur(g);
  const ordre = (prem === A ? [[A, hA], [F, hF]] : [[F, hF], [A, hA]]).filter(x => x[1]).sort((x, y) => carte(D, y[1]).ops - carte(D, x[1]).ops);
  etape(g, { k: "ouverture", cartes: ordre.map(([c, id]) => ({ camp: c, id })) });
  for (const [c, id] of ordre) {
    if (g.fin) return;
    g.actif = c; g.mains[c] = g.mains[c].filter(x => x !== id);
    const k = carte(D, id);
    let evt = false;
    if (evenementPossible(D, g, k.camp === "N" ? c : k.camp, id)) evt = resoudreEvenement(D, g, c, id);
    else etape(g, { k: "sansEffet", id, camp: c, raison: raisonInterdit(D, g, k) });
    defausser(D, g, id, evt);
  }
  // rounds d'action
  for (let r = 1; r <= rounds && !g.fin; r++) {
    g.round = r;
    for (const c of [prem, adv(prem)]) {
      if (g.fin) break;
      if (!g.mains[c].length) continue;
      g.actif = c;
      const action = DECIDEURS[c].action(D, g, c, rounds - r);
      if (action) jouer(D, g, c, action);
      else {
        // règle stricte (AlwwAl, 24/10) : une carte par round. Sans usage possible (OPS nuls, événement impossible),
        // la carte la plus faible est défaussée ; seul un joueur qui ne tient que des cartes pape passe.
        const restes = g.mains[c].filter(x => !estPape(D, x)).sort((x, y) => carte(D, x).ops - carte(D, y).ops);
        if (restes.length) { const id = restes[0]; g.mains[c] = g.mains[c].filter(x => x !== id); etape(g, { k: "defausse", camp: c, id }); log(g, `${c} défausse « ${carte(D, id).nom} » (aucun usage possible)`); defausser(D, g, id, false); }
      }
    }
  }
  if (g.fin) return;
  finDeTour(D, g);
}
// revenu de fin de tour d'un camp, poste par poste (affiché dans l'infobulle du Trésor)
export function detailRevenu(D, g, c) {
  const ctl = D.noms.filter(n => controle(D, g, n) === c), ports = ctl.filter(n => D.lieux[n].port).length, L = [];
  const reduit = g.regles?.revenuReduit;
  L.push(["base", reduit ? 1 : 2]);
  L.push([`${ctl.length} lieux contrôlés`, reduit ? Math.floor(ctl.length / 4) : Math.floor(ctl.length / 3)]);
  L.push([ports ? `port${ports > 1 ? "s" : ""} contrôlé${ports > 1 ? "s" : ""} (${ports})` : "aucun port", reduit ? Math.min(1, ports) : Math.min(2, ports)]);
  if (g.crise >= 2) L.push([`Crise ${g.crise}`, -Math.floor(g.crise / 2)]);
  const st = g.statuts || {};
  if (c === F && st.gabelle) L.push(["gabelle", 2]);
  if (c === F && st.pragmatique) L.push(["Pragmatique Sanction", 1]);
  if (c === F && st.taille) L.push(["taille royale", 2]);
  if (c === F && st.jacquesCoeur) L.push(["Jacques Cœur", 1]);
  if (c === A && st.bedford) L.push(["régence de Bedford", 2]);
  if (c === A && st.artevelde) L.push(["laine flamande (Artevelde)", 1]);
  if (rallie(g, "Flandre") === c) L.push(["Flandre ralliée", 2]); else if (penche(g, "Flandre") === c) L.push(["Flandre favorable", 1]);
  if (penche(g, "Écosse") === adv(c)) L.push(["frontière écossaise", -1]);
  return { lignes: L.filter(([, v]) => v), total: L.reduce((t, [, v]) => t + v, 0) };
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
  g.revenus = g.revenus || {};
  for (const c of [A, F]) {
    const { total: rev, lignes } = detailRevenu(D, g, c);
    const perdu = Math.max(0, g.tresor[c] + Math.max(0, rev) - 12);
    g.stats.tresorPerdu[c] += perdu;
    g.revenus[c] = { tour: g.tour, lignes, total: Math.max(0, rev), avant: g.tresor[c], perdu };
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
  g._ctx = "Légitimité (fin de tour)";
  const tete = g.legit.F > g.legit.A ? F : g.legit.A > g.legit.F ? A : null, p8 = g.paliers[8] || null;
  if (g.legit.F !== g.legit.A) vp(g, g.legit.F > g.legit.A ? F : A, 1);
  if (g.paliers[8]) vp(g, g.paliers[8], 1);
  etape(g, { k: "finLegit", tete, p8 });
  if (g.fin) return;
  // cartes de décompte gardées en main
  for (const c of [A, F]) if (g.mains[c].some(id => carte(D, id).decompte)) { terminer(g, adv(c), "Carte de décompte gardée en main"); return; }
  // victoires automatiques
  if (controle(D, g, "Paris") === A && controle(D, g, "Reims") === A) { terminer(g, A, "Paris et Reims (double monarchie)"); return; }
  if (["Bordeaux", "Rouen", "Paris"].every(n => controle(D, g, n) === F)) { terminer(g, F, "Bordeaux, Rouen et Paris"); return; }
  g.opsMalusTour = g.prochainMalus || { A: 0, F: 0 }; g.prochainMalus = { A: 0, F: 0 };
  if (g.statuts.mancheJusque && g.tour >= g.statuts.mancheJusque) { g.statuts.manche = g.statuts.mancheAvant ?? null; delete g.statuts.mancheJusque; delete g.statuts.mancheAvant; } // fin de « Bataille de la Seine »
  if (g.tour === NB_TOURS) {
    g._ctx = "Décompte final";
    etape(g, { k: "info", txt: "Fin du dernier tour : décompte final de toutes les régions." });
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
