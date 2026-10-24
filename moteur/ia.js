// IA heuristique, version 2 : évalue chaque coup légal en le simulant sur une copie de l'état
// (plusieurs tirages de dés, les mêmes pour tous les coups), puis garde le meilleur.
// Six niveaux : creerIA({ niveau: "ecuyer" | "chevalier" | "connetable" | "roi" | "empereur" | "legende" }).
// Empereur : évaluation corrigée par apprentissage (CORRECTIONS) ; Légende : en plus, la suite du tour jouée contre des mains adverses possibles.
// Les choix de détail (où placer, où retirer) suivent des règles gloutonnes rapides.
import {
  A, F, adv, carte, controle, defense, lieuxAccessibles, coutInfluence, ciblesAssaut, bonusAssaut, coutAssaut,
  evenementPossible, opsCarte, jouer, resoudreEvenement, etatRegion, FACTIONS, factionsActives, alea, de,
  penche, lieuxFaction, fusionFlandre, signatureEtat, effetMarqueur, NB_TOURS, detenteurPape,
} from "./regles.js?v=5f2a93df";

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
  empereur: { tirages: 6, alea: 0.05, candidats: 2, main: true, finale: 24, reponse: 4, appris: "v27" },
  legende: { tirages: 6, alea: 0, candidats: 2, main: true, finale: 24, reponse: 4, appris: "v27", suite: 4, courses: 4, horizon: 6 },
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
  const rounds = g.paquet ? g.paquet.rounds[g.tour <= 3 ? 0 : 1] : (g.phase === 1 ? 6 : 7);
  const p = g.tour % 2 === 1 ? A : F; // premier joueur du tour (alternance)
  const r = g.round === 0 ? rounds : rounds - g.round + (cc !== p && g.actif === p ? 1 : 0);
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
  const pr = P?.pr ? poidsRegions(D, g, vue, P) : null;
  for (const r of Object.keys(D.regions)) {
    const p = etatRegion(D, g, r);
    // un décompte en main sera joué ce tour : la région vaut presque ses points
    const w = pr ? pr[r] : mainVue.some(id => carte(D, id).decompte === r) ? (P?.wDecompte ?? 0.9) : 0.35;
    v += w * (p.F - p.A);
  }
  v += P?.tp ? 0.25 * (tresorUtile(D, g, F, P) - tresorUtile(D, g, A, P)) : 0.25 * (g.tresor.F - g.tresor.A);
  if (P?.la) { // la tête de la Légitimité rapporte 1 point à chaque fin de tour, la case 8 aussi : une avance vaut par tour restant
    const fins = Math.max(0, NB_TOURS - g.tour) + (actionsRestantes(g, A) + actionsRestantes(g, F) > 0 ? 1 : 0), d = g.legit.F - g.legit.A;
    v += P.la * (g.legit.F - g.legit.A) + (P.laTete ?? 0.45) * Math.sign(d) * Math.min(2, Math.abs(d)) / 2 * fins + (g.paliers[8] ? (g.paliers[8] === F ? 0.6 : -0.6) * fins : 0);
  } else v += 0.6 * (g.legit.F - g.legit.A);
  for (const f of FACTIONS) if (g.loy[f] != null) { const l = g.loy[f]; v += 0.5 * l + (Math.abs(l) === 3 ? 2 * Math.sign(l) : Math.abs(l) === 2 ? 0.5 * Math.sign(l) : 0); }
  const ctl = n => controle(D, g, n);
  if (ctl("Paris") === A) v -= 3; if (ctl("Reims") === A) v -= 2; if (ctl("Paris") === A && ctl("Reims") === A) v -= 8;
  if (ctl("Bordeaux") === F) v += 3; if (ctl("Rouen") === F) v += 2;
  if (vue) { // chevauchées de fin de tour : le manque qu'on ne pourra plus combler compte plein, le reste moins
    for (const cc of [A, F]) {
      const manque = Math.max(0, g.treve - g.militaire[cc]), couvrable = Math.min(manque, (P?.ch ? couvertureMil(D, g, cc, vue) : 3 * actionsRestantes(g, cc)));
      const pen = manque - couvrable + (P?.couvrable ?? 0.45) * couvrable;
      v += cc === A ? pen : -pen;
    }
  } else v += 0.8 * Math.max(0, g.treve - g.militaire.A) - 0.8 * Math.max(0, g.treve - g.militaire.F);
  if (vue && P?.main) { let m = 0; for (const id of mainVue) m += valeurCarte(D, vue, id); v += vue === F ? m : -m; }
  let tot = 0; for (const n of D.noms) tot += g.inf[n].F - g.inf[n].A;
  return v + 0.05 * tot + valeurStatuts(g) + (P?.appris ? appris(D, g, vue, P.appris) : 0);
}
// --- évaluation des niveaux Empereur et Légende ---
// Trésor : au-delà de 12 le revenu de fin de tour est perdu ; la part qui déborderait vaut moins
function revenuEstime(D, g, c) {
  let n = 0, port = 0;
  for (const x of D.noms) if (controle(D, g, x) === c) { n++; if (D.lieux[x].port) port = 1; }
  let r = 1 + Math.floor(n / 4) + port - Math.floor(g.crise / 2);
  const s = g.statuts;
  if (c === F) r += (s.gabelle ? 2 : 0) + (s.pragmatique ? 1 : 0) + (s.taille ? 2 : 0) + (s.jacquesCoeur ? 1 : 0);
  else r += (s.bedford ? 2 : 0) + (s.artevelde ? 1 : 0);
  const fl = penche(g, "Flandre"); if (fl === c) r += Math.abs(g.loy[fusionFlandre(g) ? "Bourgogne" : "Flandre"]) >= 3 ? 2 : 1;
  if (penche(g, "Écosse") === adv(c)) r -= 1;
  return Math.max(0, r);
}
function tresorUtile(D, g, c, P) {
  const t = g.tresor[c], plafond = 12 - revenuEstime(D, g, c);
  return t <= plafond ? t : plafond + (P.tpExces ?? 0.3) * (t - plafond);
}
// poids d'une région : chance qu'elle soit décomptée bientôt (carte en main, chez l'adversaire, décompte final proche)
function poidsRegions(D, g, vue, P) {
  const w = {}, base = g.tour >= NB_TOURS ? 0.85 : g.tour === NB_TOURS - 1 ? 0.55 : g.tour === NB_TOURS - 2 ? 0.45 : 0.35;
  const mainVue = vue ? g.mains[vue] : [];
  const o = vue ? adv(vue) : null, nOpp = o ? g.mains[o].length : 0;
  // cartes que la vue ne voit pas : pioche + main adverse
  const inconnues = o ? g.pioche.length + nOpp : 0;
  const enJeu = new Set(D.cartes.filter(k => k.decompte && k.phase <= g.phase).map(k => k.id));
  for (const r of Object.keys(D.regions)) {
    const k = D.cartes.find(x => x.decompte === r);
    let x = base;
    if (mainVue.includes(k.id)) x = P.wDecompte ?? 0.9;
    else if (o && enJeu.has(k.id) && !g.defausse.includes(k.id) && inconnues > 0 && actionsRestantes(g, o) > 0) {
      const p = Math.min(1, nOpp / inconnues); // l'adversaire la tient (il devra la jouer ce tour)
      x = base + (P.pOpp ?? 0.8) * p * (0.9 - base);
    }
    w[r] = x;
  }
  return w;
}
// OPS militaires encore jouables ce tour : actions restantes, OPS moyens de la main, Trésor pour payer les Assauts
function couvertureMil(D, g, c, vue) {
  const n = actionsRestantes(g, c);
  if (!n) return 0;
  let ops = 2.5;
  if (c === vue) { const xs = g.mains[c].filter(id => !carte(D, id).decompte).map(id => opsCarte(D, g, c, id)).sort((a, b) => b - a).slice(0, n); ops = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
  const payables = Math.max(1, Math.floor(g.tresor[c] / 1.5) + 1);
  return ops * Math.min(n, payables);
}
// traits d'un état (point de vue français), pour l'évaluation apprise des niveaux Empereur et Légende
const CLES = ["Paris", "Reims", "Rouen", "Bordeaux", "Calais", "Orléans", "Londres"];
const FAC7 = FACTIONS;
export function traits(D, g) {
  const x = [g.score];
  for (const r of Object.keys(D.regions)) { const p = etatRegion(D, g, r); x.push(p.F - p.A); }
  const tu = c => Math.min(g.tresor[c], 12 - revenuEstime(D, g, c));
  const dl = g.legit.F - g.legit.A;
  x.push(g.tresor.F - g.tresor.A, tu(F) - tu(A), dl, Math.sign(dl), g.paliers[8] === F ? 1 : g.paliers[8] === A ? -1 : 0);
  for (const f of FAC7) x.push(g.loy[f]);
  for (const f of FAC7) x.push(Math.abs(g.loy[f]) === 3 ? Math.sign(g.loy[f]) : 0);
  const ctl = n => { const c = controle(D, g, n); return c === F ? 1 : c === A ? -1 : 0; };
  for (const n of CLES) x.push(ctl(n));
  x.push(ctl("Paris") === -1 && ctl("Reims") === -1 ? -1 : 0, ctl("Paris") === 1 && ctl("Rouen") === 1 && ctl("Bordeaux") === 1 ? 1 : 0);
  let inf = 0, nc = 0; for (const n of D.noms) { inf += g.inf[n].F - g.inf[n].A; nc += ctl(n); }
  x.push(inf, nc, Math.max(0, g.treve - g.militaire.F), Math.max(0, g.treve - g.militaire.A), valeurStatuts(g), g.treve);
  const pp = D.idPape != null ? detenteurPape(D, g) : null;
  x.push(pp === F ? 1 : pp === A ? -1 : 0, (g.pape?.bonus?.F || 0) - (g.pape?.bonus?.A || 0));
  return x;
}
// Correction apprise (régression logistique sur 1 200 parties Chevalier contre Chevalier, 134 000 positions) :
// écart entre l'évaluation de Roi et la chance réelle de victoire, en points de score, par groupe de tours.
// Ordre des traits : ceux de traits(), puis la région de chaque décompte tenu en main par le camp qui évalue.
const CORRECTIONS = {"v27":{"A":{"I":[-0.302,0.302,0.572,0.51,0.258,-0.083,0.141,0.261,0.215,-0.163,-0.117,1.184,2.079,0.0,-0.754,0.465,2.678,-0.337,1.706,-0.561,-1.321,2.374,2.301,0.478,0.0,0.217,-1.365,-1.031,2.08,-1.815,1.73,0.453,-1.348,0.0,19.058,0.467,0.314,0.088,0.409,0.173,-0.072,0.678,0.05,-0.473,-0.694,0.0,0.0,0.0,0.0,0.0,0.038],"II":[0.131,0.235,-0.06,0.039,-0.242,0.049,-0.012,0.391,-0.12,-0.164,0.03,1.625,0.86,0.0,-0.688,0.65,3.686,-0.241,-0.11,-1.072,-0.493,0.561,-1.333,-1.048,-1.619,-2.888,-1.568,-2.166,1.967,3.79,1.849,1.518,-5.525,0.0,14.612,0.314,0.16,-0.394,1.061,-0.414,-0.071,0.398,0.889,4.296,0.871,0.431,-0.133,0.0,0.0,0.0,1.101],"III":[-0.049,0.3,0.419,0.166,-0.073,-0.599,0.283,0.367,0.077,-0.143,0.341,0.61,1.761,6.809,-0.096,0.265,-0.395,-0.032,0.309,-0.507,-1.506,1.757,-0.591,-1.533,-1.98,-2.032,-1.421,-3.438,1.177,3.747,-0.897,0.164,-0.0,0.0,10.575,0.191,0.367,-0.918,0.072,-0.254,2.914,0.538,0.293,-0.302,-0.009,-0.185,-0.102,0.23,0.0,0.109,0.532],"IV":[-0.065,0.41,0.615,0.441,0.115,-0.224,0.093,0.247,0.316,-0.054,0.169,0.409,1.687,8.772,-0.557,-0.351,-0.141,0.259,-0.207,-0.531,-0.95,0.247,-1.141,-2.422,-0.786,-1.958,0.553,-2.123,0.761,2.214,-0.728,-1.149,-4.485,0.0,5.196,0.072,0.258,-0.047,0.996,0.393,2.182,0.022,0.264,-0.05,0.014,0.736,-0.685,0.0,0.294,1.403,-0.224],"X":[-0.015,0.439,0.506,0.352,0.232,-0.13,0.029,0.31,0.182,-0.204,-0.024,-0.165,0.93,-2.037,-0.488,-0.885,-0.282,0.093,-0.343,-0.467,-1.082,-0.018,-2.073,-2.665,-0.637,-1.611,-1.023,-1.443,-0.505,0.986,-0.485,0.409,0.493,0.0,0.915,0.031,0.161,-0.095,0.652,0.36,1.306,0.503,0.443,-0.402,-0.293,0.697,-0.048,0.0,0.0,0.126,0.534]},"F":{"I":[-0.267,0.178,0.418,0.438,0.259,-0.114,0.194,0.22,0.209,-0.17,-0.106,1.076,1.854,0.0,-0.78,0.334,2.626,-0.386,1.576,-0.456,-1.321,2.09,2.288,0.395,0.0,0.13,-0.565,-1.595,1.769,-1.324,1.816,0.67,-1.312,0.0,19.097,0.439,0.3,-0.148,0.147,0.129,-0.182,0.543,-0.031,0.092,0.038,0.0,0.0,0.0,0.0,0.0,-0.331],"II":[0.047,0.164,-0.004,0.182,-0.181,0.095,0.045,0.345,0.028,-0.145,-0.034,1.136,1.161,0.0,-0.53,0.523,2.084,-0.261,-0.265,-0.945,-0.854,0.746,-0.077,-0.957,-1.099,-2.834,-0.214,-1.798,1.64,0.555,1.659,1.324,-4.625,0.0,12.495,0.19,0.174,-0.566,0.376,-0.406,-0.153,0.492,0.616,-0.001,0.11,-0.323,0.339,0.0,0.0,0.0,0.116],"III":[-0.078,0.207,0.341,0.108,-0.151,-0.444,0.26,0.537,0.085,-0.126,0.335,0.558,1.78,7.809,-0.128,0.324,-0.407,-0.087,0.271,-0.514,-1.218,1.601,-0.741,-1.224,-1.998,-1.921,-1.447,-1.88,1.043,0.968,-0.796,-0.045,-0.0,0.0,15.594,0.199,0.355,-1.278,-0.226,-0.274,1.986,0.441,0.144,-0.017,0.368,0.193,0.876,0.237,0.0,-0.236,-0.28],"IV":[-0.079,0.391,0.596,0.42,0.102,-0.219,0.339,0.291,0.391,-0.073,0.244,0.449,1.691,8.432,-0.544,-0.4,-0.275,0.285,-0.196,-0.623,-0.996,0.419,-1.061,-2.215,-1.013,-1.854,1.912,-0.714,0.699,0.953,-0.852,-1.391,-3.768,0.0,4.812,0.076,0.281,-0.374,0.954,0.32,1.237,0.055,0.099,0.288,0.393,0.622,1.002,1.469,-0.502,0.0,-0.189],"X":[-0.012,0.266,0.401,0.312,0.119,-0.012,-0.052,0.307,0.155,-0.186,-0.036,-0.173,0.886,0.377,-0.472,-0.568,-0.285,0.023,-0.2,-0.424,-1.463,-0.92,-1.647,-2.066,-0.893,-1.818,0.644,-0.085,-0.368,0.097,-0.4,0.262,-1.947,0.0,1.85,0.011,0.08,-0.258,0.496,0.265,0.182,0.338,-0.073,0.896,1.012,0.708,0.092,3.783,0.0,0.0,0.343]}}};
const groupeTour = t => (t <= 3 ? "I" : t <= 6 ? "II" : t <= 9 ? "III" : t < NB_TOURS ? "IV" : "X");
function correction(D, g, vue, x, nom) {
  const tb = CORRECTIONS[nom];
  if (!tb) return 0;
  const c = (tb.A ? tb[vue || F] : tb)[groupeTour(g.tour)]; // tables par camp qui évalue, ou commune
  let v = 0;
  for (let i = 0; i < x.length; i++) v += c[i] * x[i];
  const mainVue = vue ? g.mains[vue] : [], regs = Object.keys(D.regions);
  for (let i = 0; i < regs.length; i++) if (mainVue.some(id => carte(D, id).decompte === regs[i])) v += c[x.length + i] * x[1 + i];
  return v;
}
function appris(D, g, vue, noms) {
  const x = traits(D, g);
  let v = 0;
  for (const nom of [].concat(noms === true ? "v1" : noms)) v += correction(D, g, vue, x, nom);
  return v;
}
// effets durables des cartes : valeur par tour restant (point de vue français), sinon l'IA ne joue jamais ces événements
const STATUT_TOUR = { gabelle: 0.5, taille: 0.5, pragmatique: 0.25, jacquesCoeur: 0.25, bedford: -0.25, duGuesclin: 0.4, compagnies: 0.4, bureau: 0.3, arc: -0.2, jeanne: 0.2, roiCaptif: -1, folieCharlesVI: -0.2, owain: 0.5, calaisImprenable: -0.1 };
const STATUT_UNE_FOIS = { jarretiere: -0.4, dunois: 0.4, lundiNoir: 0.5, grandFerre: 0.5 };
function valeurStatuts(g) {
  const restants = Math.max(0, NB_TOURS - g.tour) + 0.5;
  let v = 0;
  for (const [k, x] of Object.entries(STATUT_TOUR)) if (g.statuts[k]) v += x * restants;
  for (const [k, x] of Object.entries(STATUT_UNE_FOIS)) if (g.statuts[k]) v += x;
  if (g.statuts.manche) v += (g.statuts.manche === F ? 0.3 : -0.3) * restants;
  return v;
}
const pourCamp = (c, v) => (c === F ? v : -v);
// copie d'un état pour les simulations : bien plus rapide que structuredClone ; les statistiques, jamais lues, repartent à vide
const copie = x => { if (x === null || typeof x !== "object") return x; if (Array.isArray(x)) return x.map(copie); const o = {}; for (const k in x) o[k] = copie(x[k]); return o; };
const STATS_VIDES = () => ({ evenements: {}, assauts: { A: 0, F: 0 }, sieges: { A: 0, F: 0 }, diplomatie: { A: 0, F: 0 }, legitimite: { A: 0, F: 0 }, influence: { A: 0, F: 0 }, penalitesMil: { A: 0, F: 0 }, decomptes: [], vp: {}, ciblesAssaut: {}, tresorPerdu: { A: 0, F: 0 }, tresorFinTour: [] });
export function cloner(g) { const h = {}; for (const k in g) h[k] = k === "stats" ? STATS_VIDES() : k === "journal" ? null : copie(g[k]); return h; }

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
  const h = cloner(g); h.journal = null;
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
    const h = cloner(g);
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
    const h = cloner(g);
    h.journal = null; h.graine = seed;
    jouer(D, h, c, action);
    if (h.fin || actionsRestantes(h, o) === 0) { s += pourCamp(c, evaluer(D, h, c, P)); continue; }
    let id = CARTE_GENERIQUE;
    if (P.repEchant) { // Légende : une carte tirée parmi celles que c ne voit pas (pioche et main adverse), avec son événement
      const pool = h.pioche.concat(h.mains[o]);
      if (pool.length) id = pool[Math.floor(alea(h) * pool.length)];
    }
    const ops = opsCarte(D, h, o, id), k = carte(D, id);
    const reps = [];
    if (k.decompte || (id !== CARTE_GENERIQUE && k.camp !== c && evenementPossible(D, h, k.camp === "N" ? o : k.camp, id))) reps.push({ id, mode: "evenement" });
    if (ops > 0) reps.push({ id, mode: "influence", cibles: planInfluence(D, h, o, ops) });
    if (ops > 0)
    for (const [n] of ciblesAssaut(D, h, o).filter(n => h.tresor[o] >= coutAssaut(D, h, n)).map(n => [n, valeurAssaut(D, h, o, ops, n)]).sort((x, y) => y[1] - x[1]).slice(0, 2))
      reps.push({ id, mode: "assaut", cible: n });
    if (!h.diplo[o] && ops > 0) {
      const note = f => chanceDiplo(h, o, ops, f, 0) * interetDiplo(h, o, f);
      const f = factionsActives(h).filter(f => chanceDiplo(h, o, ops, f, 0) > 0).sort((x, y) => note(y) - note(x))[0];
      if (f) reps.push({ id, mode: "diplomatie", cible: f });
    }
    if (!reps.length) { s += pourCamp(c, evaluer(D, h, c, P)); continue; }
    const sous = graines(h.graine, 6);
    let pire = Infinity;
    for (const r of reps) pire = Math.min(pire, -simuler(D, h, o, r, sous, P));
    s += pire;
  }
  return s / seeds.length;
}

// Légende : on joue la suite du tour (jusqu'à P.horizon coups) avec une main adverse tirée parmi les cartes
// que c ne voit pas, chaque camp choisissant vite (candidats normaux, un seul tirage) ; valeur pour c en fin de course
function rapide(D, h, s, restants, P) {
  const cands = candidatsAction(D, h, s, restants, 1);
  if (cands.length <= 1) return cands[0] || null;
  const seeds = [h.graine];
  let best = cands[0], bv = -Infinity;
  for (const a of cands) { const v = simuler(D, h, s, a, seeds, P); if (v > bv) { bv = v; best = a; } }
  return best;
}
function suiteDuTour(D, g, c, action, seed, P) {
  const o = adv(c), h = cloner(g);
  h.graine = seed;
  const pool = h.pioche.concat(h.mains[o]), n = h.mains[o].length;
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(alea(h) * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  h.mains[o] = pool.slice(0, n); h.pioche = pool.slice(n);
  jouer(D, h, c, action);
  const rounds = h.paquet ? h.paquet.rounds[h.tour <= 3 ? 0 : 1] : (h.phase === 1 ? 6 : 7);
  const p = h.tour % 2 === 1 ? A : F; // premier joueur du tour (alternance)
  let r = h.round, s = adv(c), coups = 0;
  if (c !== p) r++;
  while (!h.fin && r <= rounds && coups < P.horizon) {
    h.round = r; h.actif = s;
    if (h.mains[s].length) { const a = rapide(D, h, s, rounds - r, P); if (a) { jouer(D, h, s, a); coups++; } }
    if (s !== p) r++;
    s = adv(s);
  }
  return pourCamp(c, evaluer(D, h, c, P));
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
  for (const k in opts) if (k !== "niveau" && opts[k] != null) N[k] = opts[k]; // réglages d'essai
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
      let ids = g.mains[c].filter(id => !carte(D, id).decompte && !D.idsPape?.has(id));
      if (!ids.length) return null;
      const utiles = ids.filter(id => { const k = carte(D, id); return k.camp === adv(c) || !evenementPossible(D, g, k.camp === "N" ? c : k.camp, id) || !evenementVide(D, g, c, id); });
      if (N.candidats > 0 && utiles.length) ids = utiles; // ouverture : pas d'événement propre qui ne change rien
      const seeds = graines(g.graine ^ 0x85ebca6b, N.finale ? 12 : N.tirages);
      let best = ids[0], bv = -Infinity;
      for (const id of ids) {
        const k = carte(D, id);
        let v = 0;
        for (const seed of seeds) {
          const h = cloner(g); h.journal = null; h.graine = seed;
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
      if (N.suite && (actionsRestantes(g, adv(c)) > 0 || actionsRestantes(g, c) > 1)) { // Légende : la suite du tour, mains adverses tirées au sort
        notes.sort((x, y) => y.v - x.v); notes = notes.slice(0, N.suite);
        const ss = graines(base ^ 0x5bd1e995, N.courses);
        for (const x of notes) { let t = 0; for (const sd of ss) t += suiteDuTour(D, g, c, x.a, sd, N); x.v = 0.5 * x.v + 0.5 * t / ss.length; }
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
