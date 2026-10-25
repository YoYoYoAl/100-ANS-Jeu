// Effets des cartes d'événement (les 8 cartes de décompte sont gérées par le moteur, la Faveur du pape aussi).
// Chaque effet reçoit (D, g, c) : c est le camp bénéficiaire (le propriétaire de la carte,
// ou le joueur qui l'a jouée pour une carte neutre). Textes de référence : cartes.md.
import {
  A, F, adv, zone, ajouter, retirer, forcerControle, placerLibre, retirerChoisi, treve, crise, tresor,
  vp, legit, loy, versCamp, assaut, bataille, controle, DECIDEURS, de, assautsInterdits, terminer, faveurPape,
  choisir, enliser, alea, carte, etape, PREMIER_TOUR, phaseDe, lieuxAccessibles, maitriseManche,
} from "./regles.js?v=5ce436b0";

const inf = (D, g, c, n, z) => placerLibre(D, g, c, n, zone(D, z));
const perd = (D, g, c, n, z) => retirerChoisi(D, g, c, n, zone(D, z));
// Assaut gratuit d'événement : jamais en Angleterre, ni là où une carte l'interdit ce tour.
// Une carte qui nomme sa zone passe outre la protection de la Trêve ; sans zone (La Hire), toutes les interdictions s'appliquent.
const assautGratuit = (D, g, c, ops, z, sansTreve = true) => {
  const nommee = !!(z.r || z.p || z.l);
  const cibles = zone(D, z).filter(n => g.inf[n][adv(c)] > 0 && D.lieux[n].region !== "Angleterre"
    && (nommee ? !(assautsInterdits(D, { ...g, treve: 5 }, n, c)) : !assautsInterdits(D, g, n, c)));
  if (!cibles.length) return false;
  const n = DECIDEURS[c].cibleAssaut(D, g, c, ops, cibles);
  return assaut(D, g, c, ops, n, { gratuit: true, sansTreve });
};
const toutRetirer = (D, g, c, z) => { for (const n of zone(D, z)) g.inf[n][c] = 0; };
const malusProchainTour = (g, c) => { g.prochainMalus = g.prochainMalus || { A: 0, F: 0 }; g.prochainMalus[c] = 1; };

export const EFFETS = {
  // ------------------------------------------------ cartes anglaises ajoutées en v24 (factions)
  "Hommage de Jean de Montfort": (D, g) => { loy(g, "Bretagne", -2); ajouter(g, A, "Brest"); },
  "Traité de Westminster": (D, g) => { loy(g, "Bretagne", -2); inf(D, g, A, 2, { r: "Bretagne" }); },
  "Jacques Ier d'Écosse en France": (D, g) => loy(g, "Écosse", -2),
  "Le captal de Buch": (D, g) => inf(D, g, A, 3, { r: "Guyenne" }),
  "Chevauchée de Buckingham": (D, g) => { inf(D, g, A, 2, { r: "Bretagne" }); tresor(g, F, -1); },
  // ------------------------------------------------ phase I
  "Confiscation de la Guyenne": (D, g) => { inf(D, g, F, 3, { r: "Guyenne", sauf: ["Bordeaux"] }); treve(D, g, -1); },
  "Embargo sur la laine": (D, g) => { loy(g, "Flandre", -2); tresor(g, F, -1); },
  "Jacques van Artevelde": (D, g) => { ajouter(g, A, "Gand", 2); ajouter(g, A, "Bruges"); g.statuts.artevelde = true; },
  "Alliance avec Louis de Bavière": (D, g) => { inf(D, g, A, 2, { r: "Flandre" }); tresor(g, A, -1); },
  "Raids sur les côtes anglaises": (D, g) => { tresor(g, A, -1); perd(D, g, A, 1, { l: ["Southampton", "Portsmouth", "Plymouth", "Douvres"] }); }, // rééquilibrage 21/10 (2e passe) : Trésor A -2 → -1
  "Chevauchée du Cambrésis": (D, g) => { assautGratuit(D, g, A, 2, { p: ["Picardie", "Ponthieu", "Artois", "Tournaisis"] }); },
  "Édouard III, roi de France": (D, g) => legit(g, A, 2),
  "Bataille de l'Écluse": (D, g) => { g.statuts.manche = A; g.militaire[A] += 4; }, // rééquilibrage 21/10 : victoire écrasante, sans jet (la Fortune des armes reste)
  "Siège de Tournai": (D, g) => { inf(D, g, F, 2, { l: ["Tournai", "Lille", "Arras"] }); tresor(g, A, -1); },
  "Gabelle du sel": (D, g) => { g.statuts.gabelle = true; crise(g, 1); },
  "Guerre de succession de Bretagne": (D, g, c) => { inf(D, g, c, 3, { r: "Bretagne" }); },
  "Charles de Blois": (D, g) => { ajouter(g, F, "Rennes", 2); ajouter(g, F, "Nantes"); },
  "Trêve de Malestroit": (D, g) => { treve(D, g, 1); g.tourFlags.aucunAssautBretagne = true; },
  "Faillite des Bardi et des Peruzzi": (D, g) => tresor(g, A, -3),
  "Derby en Gascogne": (D, g) => { assautGratuit(D, g, A, 3, { r: "Guyenne" }); },
  "Siège d'Aiguillon": (D, g) => { inf(D, g, F, 2, { r: "Guyenne" }); g.tourFlags.aiguillon = true; },
  "Godefroy d'Harcourt": (D, g) => inf(D, g, A, 3, { r: "Normandie" }),
  "Bataille de Crécy": (D, g) => bataille(D, g, A, 4, () => { vp(g, A, 2); perd(D, g, F, 3, {}); legit(g, F, -1); }),
  "Bataille de Neville's Cross": (D, g) => { loy(g, "Écosse", -2); tresor(g, A, 1); },
  "Siège de Calais": (D, g) => forcerControle(D, g, A, "Calais"),
  "Peste noire": (D, g) => { crise(g, 2); for (const n of D.noms) for (const c of [A, F]) if (g.inf[n][c] > 2) retirer(g, c, n); },
  "Ordre de la Jarretière": (D, g) => { legit(g, A, 1); g.statuts.jarretiere = true; },
  "Transport du Dauphiné": (D, g) => { tresor(g, F, 1); }, // rééquilibrage 21/10 : sans Légitimité
  "Avènement de Jean le Bon": (D, g) => legit(g, F, 1),
  "Combat des Trente": (D, g, c) => { if (de(g) >= 4) { inf(D, g, c, 1, { r: "Bretagne" }); vp(g, c, 1); } },
  "Ordre de l'Étoile": (D, g) => { if (!g.joues["Bataille de Mauron"]) legit(g, F, 1); },
  "Bataille de Mauron": (D, g) => { perd(D, g, F, 3, { r: "Bretagne" }); loy(g, "Bretagne", -1); if (g.joues["Ordre de l'Étoile"]) legit(g, F, -1); }, // l'Ordre de l'Étoile est dissous
  "Charles le Mauvais": (D, g) => { loy(g, "Navarre", -2); ajouter(g, A, "Évreux", 2); },
  "Chevauchée du Prince Noir": (D, g) => { perd(D, g, F, 3, { r: "Languedoc" }); tresor(g, A, 2); crise(g, 1); },
  "Bataille de Poitiers": (D, g) => bataille(D, g, A, 4, () => { g.statuts.roiCaptif = true; legit(g, F, -2); vp(g, A, 2); }),
  "Du Guesclin au siège de Rennes": (D, g) => ajouter(g, F, "Rennes", 3),
  "Étienne Marcel": (D, g) => { perd(D, g, F, 2, { r: "Île-de-France" }); crise(g, 1); legit(g, F, -1); },
  "Grande Jacquerie": (D, g) => { const l = [...zone(D, { r: "Île-de-France" }), ...zone(D, { p: ["Picardie"] })]; crise(g, 2); perd(D, g, F, 2, { l }); perd(D, g, A, 2, { l }); },
  "Le Grand Ferré": (D, g) => { inf(D, g, F, 1, { p: ["Picardie", "Valois"] }); g.statuts.grandFerre = true; },
  "Campagne de Reims": (D, g) => { if (controle(D, g, "Reims") === A) legit(g, A, 3); else legit(g, A, 1); },
  "Lundi noir": (D, g) => { g.statuts.lundiNoir = true; treve(D, g, 1); }, // annule la prochaine Bataille anglaise (rétabli le 23/10 à la demande d'AlwwAl)
  "Traité de Brétigny": (D, g) => {
    g.treve = 5; inf(D, g, A, 3, { l: zone(D, { r: "Guyenne" }).concat(["Poitiers", "La Rochelle", "Limoges"]) }); legit(g, A, -2);
    if (g.statuts.roiCaptif) { g.statuts.roiCaptif = false; tresor(g, A, 2); }
  },
  // ------------------------------------------------ phase II
  "Chevauchée de Robert Knolles": (D, g) => { assautGratuit(D, g, A, 2, { p: ["Picardie", "Île-de-France", "Valois", "Brie"] }); tresor(g, A, 1); },
  "Cherbourg et Brest cédés à l'Angleterre": (D, g) => { forcerControle(D, g, A, "Cherbourg"); forcerControle(D, g, A, "Brest"); g.statuts.cherbourgBrest = true; },
  "Bataille d'Homildon Hill": (D, g) => loy(g, "Écosse", -2),
  "Bataille de Shrewsbury": (D, g) => { legit(g, A, 1); if (g.statuts.owain) g.statuts.owain = false; },
  "Expédition de Clarence": (D, g) => { tresor(g, A, 3); tresor(g, F, -1); },
  "Bataille de Brignais": (D, g) => { crise(g, 1); perd(D, g, F, 2, { p: ["Lyonnais", "Bourgogne"] }); },
  "Bataille de Launac": (D, g, c) => inf(D, g, c, 3, { l: ["Orthez", "Lectoure"] }),
  "Ordonnance sur le tir à l'arc": (D, g) => { g.statuts.arc = true; },
  "Avènement de Charles V": (D, g) => { legit(g, F, 1); g.statuts.roiCaptif = false; }, // rééquilibrage 21/10 : +2 → +1
  "Bataille de Cocherel": (D, g) => { loy(g, "Navarre", 2); inf(D, g, F, 2, { r: "Normandie" }); },
  "Bataille d'Auray": (D, g) => { tresor(g, F, -1); inf(D, g, A, 3, { r: "Bretagne" }); },
  "Traité de Guérande": (D, g) => { g.loy.Bretagne = 0; },
  "Appel des seigneurs gascons": (D, g) => inf(D, g, F, 4, { r: "Guyenne" }),
  "Confiscation de l'Aquitaine": (D, g) => { treve(D, g, -1); inf(D, g, F, 2, { p: ["Poitou", "Aunis", "Limousin"] }); },
  "Fondation de la Bastille": (D, g) => { inf(D, g, F, 1, { l: ["Paris"] }); g.statuts.bastille = true; },
  "Sac de Limoges": (D, g) => { legit(g, A, -1); inf(D, g, F, 2, { p: ["Limousin"] }); },
  "Du Guesclin connétable": (D, g) => { g.statuts.duGuesclin = true; },
  "Bataille de Pontvallain": (D, g) => { assautGratuit(D, g, F, 2, { p: ["Maine", "Touraine"] }); },
  "Bataille de La Rochelle": (D, g) => { g.statuts.manche = null; if (g.statuts.mancheJusque) g.statuts.mancheAvant = null; inf(D, g, F, 2, { p: ["Poitou", "Aunis"] }); },
  "Grande chevauchée de Jean de Gand": (D, g) => { perd(D, g, F, 3, { sauf: [] }); tresor(g, A, -1); },
  "Mort du Prince Noir": (D, g) => legit(g, A, -1),
  "Mort d'Édouard III": (D, g) => { legit(g, A, -1); }, // rééquilibrage 21/10 : -2 → -1, sans malus d'OPS (le conseil de régence gouverne)
  "Mort de du Guesclin": (D, g) => { g.statuts.duGuesclin = false; },
  "Mort de Charles V": (D, g) => { tresor(g, F, -3); legit(g, F, -1); },
  "Bataille de Roosebeke": (D, g) => { loy(g, "Flandre", 3); g.statuts.artevelde = false; },
  "Croisade de Despenser": (D, g) => { if (!assautGratuit(D, g, A, 3, { r: "Flandre" }, true)) legit(g, A, -1); },
  "Héritage flamand de Philippe le Hardi": (D, g, c) => loy(g, "Bourgogne", versCamp(c, 1)),
  "Flotte d'invasion de L'Écluse": (D, g) => { tresor(g, A, -2); g.opsMalus.A = 1; },
  "Bataille d'Otterburn": (D, g) => loy(g, "Écosse", 2),
  "Trêve de Leulinghem": (D, g) => treve(D, g, 2),
  "Folie de Charles VI": (D, g) => { legit(g, F, -2); g.statuts.folieCharlesVI = true; },
  "Bal des Ardents": (D, g) => legit(g, F, -1),
  "Trêve de vingt-huit ans": (D, g) => { treve(D, g, 2); g.tourFlags.aucunAssaut = true; },
  "Usurpation d'Henri IV": (D, g) => { legit(g, A, -2); treve(D, g, -1); },
  "Assassinat de Louis d'Orléans": (D, g) => { loy(g, "Bourgogne", -3); crise(g, 1); },
  "Révolte cabochienne": (D, g) => { crise(g, 1); perd(D, g, F, 2, { r: "Île-de-France" }); },
  // ------------------------------------------------ phase III
  "Bataille de la Seine": (D, g) => { if (!g.statuts.mancheJusque) g.statuts.mancheAvant = g.statuts.manche ?? null; g.statuts.manche = A; g.statuts.mancheJusque = g.tour + 1; },
  "Prise de Caen": (D, g) => { forcerControle(D, g, A, "Caen"); ajouter(g, A, "Évreux"); },
  "Henri V entre dans Paris": (D, g) => { ajouter(g, A, "Paris", 3); legit(g, A, 1); },
  "Prise du Mans": (D, g) => { forcerControle(D, g, A, "Le Mans"); inf(D, g, A, 1, { r: "Normandie" }); },
  "Campagne de Salisbury": (D, g) => inf(D, g, A, 4, { l: D.lieux["Orléans"].voisins.concat(["Orléans"]) }),
  "Échec bourguignon devant Calais": (D, g) => { g.statuts.calaisImprenable = true; loy(g, "Bourgogne", -1); },
  "Reprise d'Harfleur": (D, g) => { forcerControle(D, g, A, "Harfleur"); inf(D, g, A, 1, { r: "Normandie" }); },
  "Siège d'Harfleur": (D, g) => { forcerControle(D, g, A, "Harfleur"); inf(D, g, A, 2, { r: "Normandie" }); },
  "Bataille d'Azincourt": (D, g) => bataille(D, g, A, 4, () => { perd(D, g, F, 4, {}); vp(g, A, 3); legit(g, A, 1); }),
  "Les Bourguignons prennent Paris": (D, g, c) => { perd(D, g, adv(c), 3, { r: "Île-de-France" }); loy(g, "Bourgogne", versCamp(c, 1)); },
  "Siège de Rouen": (D, g) => { forcerControle(D, g, A, "Rouen"); inf(D, g, A, 2, { r: "Normandie" }); },
  "Assassinat de Montereau": (D, g) => { g.loy.Bourgogne = -3; },
  "Traité de Troyes": (D, g) => { legit(g, A, 3); legit(g, F, -2); },
  "Siège de Meaux": (D, g) => { forcerControle(D, g, A, "Meaux"); inf(D, g, A, 1, { r: "Île-de-France" }); },
  "Bataille de Baugé": (D, g) => { loy(g, "Écosse", 1); perd(D, g, A, 2, { p: ["Maine", "Touraine"] }); },
  "Mort d'Henri V": (D, g) => { legit(g, A, -1); malusProchainTour(g, A); }, // rééquilibrage 21/10 : -2 → -1 (régence efficace de Bedford)
  "Mort de Charles VI": (D, g) => { if (g.joues["Traité de Troyes"]) legit(g, A, 1); else legit(g, F, 1); g.statuts.folieCharlesVI = false; },
  "Le roi de Bourges": (D, g) => { if (g.inf.Bourges.F < 2) g.inf.Bourges.F = 2; g.statuts.roiBourges = true; },
  "Traité d'Amiens": (D, g) => { loy(g, "Bourgogne", -1); loy(g, "Bretagne", -1); },
  "Bataille de Cravant": (D, g) => { assautGratuit(D, g, A, 3, { r: "Bourgogne" }); },
  "Bataille de Verneuil": (D, g) => { loy(g, "Écosse", -3); vp(g, A, 1); perd(D, g, F, 2, { r: "Normandie" }); },
  "Bedford régent": (D, g) => { g.statuts.bedford = true; },
  "Gloucester en Hainaut": (D, g) => loy(g, "Bourgogne", 2), // la brouille avec Gloucester éloigne Philippe le Bon des Anglais
  "Richemont connétable": (D, g) => loy(g, "Bretagne", 2),
  "Siège d'Orléans": (D, g) => inf(D, g, A, 4, { l: D.lieux["Orléans"].voisins.concat(["Orléans"]) }),
  "Journée des Harengs": (D, g) => { retirer(g, F, "Orléans", 3); tresor(g, F, -1); },
  "Dunois, Bâtard d'Orléans": (D, g) => { ajouter(g, F, "Orléans", 3); g.statuts.dunois = true; },
  "La Hire et Xaintrailles": (D, g) => { assautGratuit(D, g, F, 2, {}); },
  "Jeanne d'Arc": (D, g) => { g.inf["Orléans"].A = 0; ajouter(g, F, "Orléans", 3); g.statuts.jeanne = true; legit(g, F, 1); },
  "Bataille de Patay": (D, g) => { perd(D, g, A, 3, { p: ["Beauce", "Orléanais"] }); vp(g, F, 2); },
  "Sacre de Charles VII à Reims": (D, g) => { legit(g, F, 3); forcerControle(D, g, F, "Reims"); delete g.statuts.roiBourges; }, // fin du « roi de Bourges »
  "Capture à Compiègne": (D, g) => { g.statuts.jeanne = false; },
  "Procès de Rouen": (D, g) => { legit(g, A, -1); legit(g, F, -1); },
  "Henri VI couronné à Paris": (D, g) => legit(g, A, controle(D, g, "Reims") === F ? 1 : 2),
  "Mort de Bedford": (D, g) => { g.statuts.bedford = false; legit(g, A, -1); inf(D, g, F, 2, { r: "Île-de-France" }); },
  "Congrès d'Arras": (D, g) => loy(g, "Bourgogne", 4),
  "Reprise de Paris": (D, g) => { forcerControle(D, g, F, "Paris"); inf(D, g, F, 3, { r: "Île-de-France" }); },
  "Écorcheurs": (D, g, c) => { crise(g, 1); perd(D, g, adv(c), 2, {}); },
  "Pragmatique Sanction de Bourges": (D, g) => { g.statuts.pragmatique = true; },
  "Taille royale permanente": (D, g) => { g.statuts.taille = true; },
  "Praguerie": (D, g) => perd(D, g, F, 3, {}),
  "Jacques Cœur, argentier": (D, g) => { tresor(g, F, 3); g.statuts.jacquesCoeur = true; },
  "Trêve de Tours": (D, g) => { treve(D, g, 2); inf(D, g, F, 2, { p: ["Maine"] }); },
  "Compagnies d'ordonnance": (D, g) => { g.statuts.compagnies = true; g.statuts.arc = false; crise(g, -1); },
  "Les frères Bureau": (D, g) => { g.statuts.bureau = true; },
  "Sac de Fougères": (D, g) => { treve(D, g, -1); loy(g, "Bretagne", 2); },
  "Prise de Rouen": (D, g) => forcerControle(D, g, F, "Rouen"),
  "Bataille de Formigny": (D, g) => bataille(D, g, F, 4, () => { toutRetirer(D, g, A, { r: "Normandie", sauf: ["Cherbourg"] }); vp(g, F, 3); }),
  "Prise de Bordeaux": (D, g) => { forcerControle(D, g, F, "Bordeaux"); forcerControle(D, g, F, "Bayonne"); },
  "Talbot à Bordeaux": (D, g) => { g.inf.Bordeaux.F = 0; forcerControle(D, g, A, "Bordeaux"); inf(D, g, A, 1, { r: "Guyenne" }); },
  "Bataille de Castillon": (D, g) => bataille(D, g, F, 4, () => { toutRetirer(D, g, A, { r: "Guyenne" }); if (["Bordeaux", "Rouen", "Paris"].every(n => controle(D, g, n) === F)) terminer(g, F, "Castillon : Bordeaux, Rouen et Paris"); }),
  "Procès de Jacques Cœur": (D, g) => { g.statuts.jacquesCoeur = false; tresor(g, F, -2); },
  // ------------------------------------------------ cartes nouvelles v27 : phase I
  "Subside du Parlement": (D, g) => tresor(g, A, 2),
  "Bataille de Saint-Omer": (D, g) => perd(D, g, A, 2, { r: "Flandre" }),
  "Sac de Caen": (D, g) => { tresor(g, A, 2); perd(D, g, F, 1, { r: "Normandie" }); },
  "Les Espagnols sur mer": (D, g) => loy(g, "Castille", -1),
  "Prise de Guînes": (D, g) => inf(D, g, A, 2, { l: ["Calais", ...D.lieux.Calais.voisins.filter(n => D.lieux[n].region !== "Angleterre")] }),
  "États généraux de 1355": (D, g) => { tresor(g, F, 2); crise(g, 1); },
  "Prise de Bergerac": (D, g) => inf(D, g, A, 2, { l: ["Bergerac", "Périgueux"] }),
  // ------------------------------------------------ phase II
  "Grandes Compagnies": (D, g, c) => { crise(g, 1); perd(D, g, adv(c), 1, { l: D.noms.filter(n => !D.lieux[n].pf && D.lieux[n].region !== "Angleterre") }); },
  "Retour de la peste": (D, g) => { crise(g, 1); tresor(g, A, -1); tresor(g, F, -1); },
  "Prise de Poitiers": (D, g) => forcerControle(D, g, F, "Poitiers"),
  "Siège de Saint-Sauveur-le-Vicomte": (D, g) => inf(D, g, F, 2, { r: "Normandie" }),
  "Jean de Vienne en Écosse": (D, g) => { loy(g, "Écosse", 2); tresor(g, F, -1); },
  "Le Bon Parlement": (D, g) => legit(g, A, -1),
  "Couronnement de Richard II": (D, g) => legit(g, A, 1),
  "Reprise de Bergerac": (D, g) => forcerControle(D, g, F, "Bergerac"),
  "Visite de l'empereur Charles IV": (D, g) => tresor(g, F, 1),   // rééquilibrage : Trésor plutôt que Légitimité
  "Échec devant Saint-Malo": (D, g) => { tresor(g, A, -1); loy(g, "Bretagne", 1); },
  "Louis d'Anjou en Languedoc": (D, g) => inf(D, g, F, 1, { r: "Languedoc" }),   // rééquilibrage : +1 au lieu de +2
  // ------------------------------------------------ phase III
  "Échec devant Bourg": (D, g) => { tresor(g, F, -1); legit(g, F, -1); },
  "Traité de Bourges": (D, g) => { inf(D, g, A, 2, { r: "Guyenne" }); legit(g, F, -1); },
  "Avènement d'Henri V": (D, g) => legit(g, A, 2),
  "Complot de Southampton": (D, g) => { g.opsMalus.A = 1; },
  "Prise de Pontoise": (D, g) => inf(D, g, A, 2, { r: "Île-de-France" }),
  "Siège de Melun": (D, g) => { inf(D, g, A, 2, { l: ["Montereau", "Meaux"] }); perd(D, g, F, 1, { r: "Île-de-France" }); },
  "Mariage d'Henri V et de Catherine": (D, g) => legit(g, A, 1),
  "Bataille de La Brossinière": (D, g) => perd(D, g, A, 2, { p: ["Maine", "Anjou"] }),
  "Siège du Crotoy": (D, g) => inf(D, g, A, 2, { p: ["Ponthieu", "Picardie"] }),
  "Défense du Mont-Saint-Michel": (D, g) => { ajouter(g, F, "Mont-Saint-Michel"); g.statuts.montImprenable = true; },
  "Isabeau rejoint Jean sans Peur": (D, g) => { loy(g, "Bourgogne", -1); legit(g, F, -1); },
  "Armée d'Écosse": (D, g) => { loy(g, "Écosse", 1); inf(D, g, F, 2, { r: "Val de Loire" }); },
  "Bataille de Montargis": (D, g) => perd(D, g, A, 2, { l: [...zone(D, { p: ["Orléanais"] }), ...zone(D, { r: "Île-de-France" })] }),
  "Charles d'Orléans prisonnier": (D, g) => legit(g, F, -1),
  "Bataille d'Othée": (D, g, c) => loy(g, "Bourgogne", versCamp(c, 1)),
  "Bataille de Blackpool": (D, g) => { loy(g, "Bretagne", -1); tresor(g, F, -1); },
  "Siège d'Arras": (D, g) => { loy(g, "Bourgogne", 1); tresor(g, F, -1); },
  // ------------------------------------------------ phase IV
  "Mort de Salisbury": (D, g) => perd(D, g, A, 2, { l: ["Orléans", ...D.lieux["Orléans"].voisins] }),
  "Campagne de la Loire": (D, g) => perd(D, g, A, 3, { r: "Val de Loire" }),
  "Échec devant Paris": (D, g) => { legit(g, F, -1); perd(D, g, F, 1, { r: "Île-de-France" }); },
  "Bataille de Gerberoy": (D, g) => perd(D, g, A, 2, { l: [...zone(D, { p: ["Picardie"] }), ...zone(D, { r: "Normandie" })] }),
  "Libération de Charles d'Orléans": (D, g) => { legit(g, F, 1); loy(g, "Bourgogne", 1); },
  "Reprise de Pontoise": (D, g) => { perd(D, g, A, 2, { r: "Île-de-France" }); inf(D, g, F, 1, { r: "Île-de-France" }); },
  "Journée de Tartas": (D, g) => inf(D, g, F, 2, { r: "Guyenne" }),
  "Reddition du Mans": (D, g) => forcerControle(D, g, F, "Le Mans"),
  "Richard d'York lieutenant en France": (D, g) => { inf(D, g, A, 2, { r: "Normandie" }); tresor(g, A, -1); },
  "Siège de Dieppe": (D, g) => perd(D, g, A, 2, { r: "Normandie" }),
  "Francs-archers": (D, g) => inf(D, g, F, 2, { l: D.noms.filter(n => D.lieux[n].region !== "Angleterre") }),
  "Guerre de Gand": (D, g) => { g.loy.Bourgogne -= Math.sign(g.loy.Bourgogne); crise(g, 1); },
  "Bataille de Bulgnéville": (D, g, c) => loy(g, "Bourgogne", versCamp(c, 1)),
};


// ================================================================ refonte B (validée par AlwwAl le 25/10)
// Les effets ci-dessous remplacent ceux des mêmes noms. Les choix passent par choisir() : l'option f reçoit l'état (h).
const infMax = (D, g, c, n, lieux, max) => { const pose = {}; for (let k = 0; k < n; k++) { const l = lieux.filter(x => (pose[x] || 0) < max); if (!l.length) return; const avant = Object.fromEntries(l.map(x => [x, g.inf[x][c]])); placerLibre(D, g, c, 1, l); for (const x of l) if (g.inf[x][c] > avant[x]) pose[x] = (pose[x] || 0) + 1; } };
const nbCtl = (D, g, c, lieux) => lieux.filter(n => controle(D, g, n) === c).length;
const pfDe = (D, r) => zone(D, { r }).filter(n => D.lieux[n].pf);
const autour = (D, n) => [n, ...D.lieux[n].voisins];
const ports = (D, r) => zone(D, { r }).filter(n => D.lieux[n].port);
const revelerMain = (D, g, c) => etape(g, { k: "info", camp: adv(c), titre: "Main révélée", txt: `${c === F ? "La France" : "L'Angleterre"} montre sa main : ${g.mains[c].map(id => `« ${carte(D, id).nom} »`).join(", ") || "aucune carte"}.` });
const maitriseJusque = (g, c, tour) => { g.statuts.mancheAvant = g.statuts.mancheJusque ? g.statuts.mancheAvant : (g.statuts.manche ?? null); g.statuts.manche = c; g.statuts.mancheJusque = tour; };
const leger = c => (c === F ? "France" : "Angleterre");
// chemin de lieux voisins (Chevauchée de Buckingham)
function chemin(D, g, c, depart, n) {
  let cur = depart, vus = new Set([depart]);
  ajouter(g, c, cur);
  for (let k = 1; k < n; k++) {
    const l = D.lieux[cur].voisins.filter(v => !vus.has(v) && D.lieux[v].region !== "Angleterre" && !D.lieux[cur].mer?.includes(v));
    if (!l.length) return;
    const avant = Object.fromEntries(l.map(x => [x, g.inf[x][c]]));
    placerLibre(D, g, c, 1, l);
    cur = l.find(x => g.inf[x][c] > avant[x]) || l[0]; vus.add(cur);
  }
}
const EFFETS_B = {
  // ------------------------------------------------ phase I
  "Confiscation de la Guyenne": (D, g) => { infMax(D, g, F, 3, zone(D, { r: "Guyenne" }).filter(n => n !== "Bordeaux"), 2); treve(D, g, -1); },
  "Embargo sur la laine": (D, g) => { loy(g, "Flandre", -1); g.statuts.embargo = true; },
  "Alliance avec Louis de Bavière": (D, g) => { inf(D, g, A, 1, { r: "Flandre" }); choisir(D, g, A, "Alliance avec Louis de Bavière", [0, 1, 2].filter(k => k <= g.tresor[A]).map(k => ({ t: k ? `payer ${k} Trésor : +${k} Influence en Flandre` : "ne rien payer", f: h => { if (k) { tresor(h, A, -k); inf(D, h, A, k, { r: "Flandre" }); } } }))); },
  "Raids sur les côtes anglaises": (D, g) => choisir(D, g, F, "Raids sur les côtes anglaises", [{ t: "Trésor anglais −2", f: h => tresor(h, A, -2) }, { t: "une place côtière anglaise perd 2 Influence", f: h => { const l = ports(D, "Angleterre").filter(n => h.inf[n].A > 0); if (l.length) choisir(D, h, F, "Place côtière", l.map(n => ({ t: n, f: k => retirer(k, A, n, 2) }))); } }]),
  "Chevauchée du Cambrésis": (D, g) => { const ok = assautGratuit(D, g, A, 2, { p: ["Picardie", "Artois"] }); if (ok) choisir(D, g, A, "Chevauchée du Cambrésis réussie", [{ t: "Trésor +1", f: h => tresor(h, A, 1) }, { t: "Flandre 1 cran vers l'Angleterre", f: h => loy(h, "Flandre", -1) }]); },
  "Édouard III, roi de France": (D, g) => legit(g, A, 1 + (controle(D, g, "Gand") === A || controle(D, g, "Bruges") === A ? 1 : 0)),
  "Siège de Tournai": (D, g) => enliser(g, A, "Siège de Tournai"),
  "Gabelle du sel": (D, g) => { g.statuts.gabelle = true; },
  "Guerre de succession de Bretagne": (D, g, c) => choisir(D, g, c, "Guerre de succession de Bretagne", [{ t: "+3 Influence en Bretagne", f: h => inf(D, h, c, 3, { r: "Bretagne" }) }, { t: "+2 Influence en Bretagne et la Bretagne 1 cran vers vous", f: h => { inf(D, h, c, 2, { r: "Bretagne" }); loy(h, "Bretagne", versCamp(c, 1)); } }]),
  "Montfort tient la Bretagne": (D, g) => choisir(D, g, A, "Montfort tient la Bretagne", [{ t: "+3 Influence en Bretagne et aucun Assaut français en Bretagne ce tour", f: h => { inf(D, h, A, 3, { r: "Bretagne" }); h.tourFlags.aucunAssautBretagneF = true; } }, { t: "la France perd 2 Influence en Bretagne et la Bretagne 1 cran vers l'Angleterre", f: h => { perd(D, h, F, 2, { r: "Bretagne" }); loy(h, "Bretagne", -1); } }]),
  "Charles de Blois": (D, g) => inf(D, g, F, Math.min(4, Math.max(2, nbCtl(D, g, F, pfDe(D, "Bretagne")))), { r: "Bretagne" }),
  "Trêve de Malestroit": (D, g, c) => { treve(D, g, 1); choisir(D, g, c, "Trêve de Malestroit", [{ t: "aucun Assaut en Bretagne ce tour", f: h => { h.tourFlags.aucunAssautBretagne = true; } }, { t: "+1 Influence dans un lieu tenu", f: h => { const l = D.noms.filter(n => h.inf[n][c] > 0); if (l.length) placerLibre(D, h, c, 1, l); } }]); },
  "Faillite des Bardi et des Peruzzi": (D, g) => { tresor(g, A, -Math.min(3, Math.floor(g.tresor[A] / 3))); tresor(g, F, 1); },
  "Siège d'Aiguillon": (D, g) => enliser(g, F, "Siège d'Aiguillon"),
  "Godefroy d'Harcourt": (D, g) => { if (g.actif === F) legit(g, A, 1); choisir(D, g, A, "Godefroy d'Harcourt", [{ t: "+2 Influence en Normandie", f: h => inf(D, h, A, 2, { r: "Normandie" }) }, { t: "+2 Influence à Saint-Sauveur-le-Vicomte", f: h => ajouter(h, A, "Saint-Sauveur-le-Vicomte", 2) }]); },
  "Transport du Dauphiné": (D, g) => choisir(D, g, F, "Transport du Dauphiné", [{ t: "Trésor +2", f: h => tresor(h, F, 2) }, { t: "Légitimité +1", f: h => legit(h, F, 1) }]),
  "Avènement de Jean le Bon": (D, g) => { legit(g, F, 1); tresor(g, F, Math.min(2, nbCtl(D, g, F, pfDe(D, "Île-de-France")))); },
  "Le jeu navarrais": (D, g, c) => choisir(D, g, c, "Le jeu navarrais", [{ t: "la Navarre 1 cran vers vous", f: h => loy(h, "Navarre", versCamp(c, 1)) }, { t: "Trésor +2", f: h => tresor(h, c, 2) }]),
  "Chevauchée du Prince Noir": (D, g) => { perd(D, g, F, 3, { r: "Languedoc" }); tresor(g, A, Math.min(3, zone(D, { r: "Languedoc" }).filter(n => g.inf[n].F === 0).length)); },
  "Étienne Marcel": (D, g) => { perd(D, g, F, 2, { r: "Île-de-France" }); crise(g, 1); g.statuts.marcel = true; },
  "L'Auld Alliance": (D, g) => choisir(D, g, F, "L'Auld Alliance", [{ t: "Écosse 2 crans vers la France", f: h => loy(h, "Écosse", 2) }, { t: "+2 Influence à Édimbourg et Écosse 1 cran vers la France", f: h => { ajouter(h, F, "Édimbourg", 2); loy(h, "Écosse", 1); } }]),
  "Balliol, roi d'Écosse": (D, g) => { const deja = g.loy["Écosse"] <= -2; const berwick = h => { forcerControle(D, h, A, "Berwick"); }; if (deja) { berwick(g); loy(g, "Écosse", -2); return; } choisir(D, g, A, "Balliol, roi d'Écosse", [{ t: "Berwick passe à l'Angleterre", f: berwick }, { t: "Écosse 2 crans vers l'Angleterre", f: h => loy(h, "Écosse", -2) }]); },
  "Subside du Parlement": (D, g) => choisir(D, g, A, "Subside du Parlement", [{ t: "Trésor +3", f: h => tresor(h, A, 3) }, { t: "Trésor +1 et Légitimité +1", f: h => { tresor(h, A, 1); legit(h, A, 1); } }]),
  "Bataille de Saint-Omer": (D, g) => perd(D, g, A, Math.min(3, 1 + nbCtl(D, g, F, zone(D, { r: "Flandre" }))), { r: "Flandre" }),
  "Sac de Caen": (D, g) => { tresor(g, A, 2); revelerMain(D, g, F); choisir(D, g, A, "Sac de Caen", [{ t: "+1 Influence dans un lieu accessible", f: h => placerLibre(D, h, A, 1, lieuxAccessibles(D, h, A)) }, { t: "Légitimité +1 (l'ordonnance lue à Londres)", f: h => legit(h, A, 1) }]); },
  "Les Espagnols sur mer": (D, g) => choisir(D, g, A, "Les Espagnols sur mer", [{ t: "Castille 1 cran vers l'Angleterre", f: h => loy(h, "Castille", -1) }, { t: "maîtrise de la mer jusqu'à la fin du tour", f: h => maitriseJusque(h, A, h.tour + 1) }]),
  "Prise de Guînes": (D, g) => { ajouter(g, A, "Guînes", 2); g.statuts.pale = true; },
  "États généraux de 1355": (D, g) => choisir(D, g, F, "États généraux de 1355", [{ t: "Trésor +3 et Crise +1", f: h => { tresor(h, F, 3); crise(h, 1); } }, { t: "Trésor +1 et Légitimité +1", f: h => { tresor(h, F, 1); legit(h, F, 1); } }]),
  "Prise de Bergerac": (D, g) => inf(D, g, A, 2, { l: ["Bergerac", "Périgueux", "La Réole"] }),
  "Bataille de Neville's Cross": (D, g) => { g.inf.Durham.F = 0; perd(D, g, F, 1, { r: "Écosse" }); g.statuts.davidCaptif = true; loy(g, "Écosse", 0); },
  "Exécution d'Olivier de Clisson": (D, g) => { const l = zone(D, { r: "Bretagne" }).filter(n => g.inf[n].A > 0); if (l.length) choisir(D, g, F, "Exécution d'Olivier de Clisson", l.map(n => ({ t: `${n} (${g.inf[n].A} Influence anglaise)`, f: h => retirer(h, A, n, Math.ceil(h.inf[n].A / 2)) }))); inf(D, g, A, 1, { l: ports(D, "Bretagne") }); },
  // ------------------------------------------------ phase II
  "Chevauchée de Robert Knolles": (D, g) => { choisir(D, g, A, "Chevauchée de Robert Knolles", [{ t: "Assaut gratuit à 3 OPS sur un lieu ouvert d'Île-de-France", f: h => assautGratuit(D, h, A, 3, { l: zone(D, { r: "Île-de-France" }).filter(n => !D.lieux[n].pf) }) }, { t: "Trésor +2 (rançons)", f: h => tresor(h, A, 2) }]); if (g.statuts.duGuesclin) perd(D, g, A, 1, { p: ["Maine"] }); },
  "Cherbourg et Brest cédés à l'Angleterre": (D, g) => { forcerControle(D, g, A, "Cherbourg"); forcerControle(D, g, A, "Brest"); g.statuts.cherbourgBrest = true; loy(g, "Navarre", 1); loy(g, "Bretagne", 1); },
  "La rançon du roi Jean": (D, g) => { delete g.statuts.roiCaptif; const m = g.mains[F].filter(id => !carte(D, id).decompte); if (!m.length) { tresor(g, A, 3); return; } const id = m[Math.floor(alea(g) * m.length)], k = carte(D, id); etape(g, { k: "info", camp: A, titre: "Rançon du roi Jean", txt: `L'Angleterre prend « ${k.nom} » dans la main française.` });
    choisir(D, g, A, `La rançon du roi Jean (« ${k.nom} », ${k.ops} OPS)`, [{ t: `garder la carte : ${k.ops} Influence anglaise dans des lieux accessibles`, f: h => { h.mains[F] = h.mains[F].filter(x => x !== id); h.defausse.push(id); h.sortis[k.nom] = true; placerLibre(D, h, A, k.ops, lieuxAccessibles(D, h, A)); } }, { t: "la rendre et Trésor +3", f: h => tresor(h, A, 3) }]); },
  "Bataille de Brignais": (D, g, c) => { crise(g, 1); perd(D, g, F, Math.min(3, nbCtl(D, g, F, zone(D, { r: "Bourgogne" }))), { r: "Bourgogne" }); },
  "Avènement de Charles V": (D, g) => { legit(g, F, 1); delete g.statuts.roiCaptif; choisir(D, g, F, "Avènement de Charles V", [{ t: "+2 Influence à Reims (sacre)", f: h => ajouter(h, F, "Reims", 2) }, { t: "Trésor +2", f: h => tresor(h, F, 2) }]); },
  "Bataille de Cocherel": (D, g) => { delete g.statuts.captal; choisir(D, g, F, "Bataille de Cocherel", [{ t: "la France contrôle Mantes", f: h => forcerControle(D, h, F, "Mantes") }, { t: "Navarre 2 crans vers la France", f: h => loy(h, "Navarre", 2) }]); },
  "Bataille d'Auray": (D, g) => { ajouter(g, A, "Auray", 2); inf(D, g, A, 1, { r: "Bretagne" }); g.statuts.blois = "mort"; choisir(D, g, A, "Du Guesclin capturé à Auray", [{ t: "Trésor français −2 (rançon)", f: h => tresor(h, F, -2) }, { t: "« Du Guesclin connétable » injouable ce tour", f: h => { h.tourFlags.guesclinCaptif = true; } }]); },
  "Guerre civile de Castille": (D, g, c) => choisir(D, g, c, "Guerre civile de Castille", [{ t: "soutenir Trastamare : Castille 2 crans vers la France, Crise −1", f: h => { loy(h, "Castille", 2); crise(h, -1); } }, { t: "soutenir Pierre le Cruel : Castille 2 crans vers l'Angleterre, mais Trésor anglais −2 et l'Appel des seigneurs gascons renforcé", f: h => { loy(h, "Castille", -2); tresor(h, A, -2); h.statuts.najera = true; } }]),
  "Appel des seigneurs gascons": (D, g) => inf(D, g, F, 3 + (g.statuts.najera ? 2 : 0), { l: [...zone(D, { r: "Guyenne" }), "Rodez"] }),
  "Confiscation de l'Aquitaine": (D, g) => { inf(D, g, F, 2, { p: ["Poitou", "Aunis", "Limousin"] }); treve(D, g, -1); },
  "Bataille de La Rochelle": (D, g) => { maitriseJusque(g, F, PREMIER_TOUR[3]); inf(D, g, F, 2, { l: ["La Rochelle", "Lusignan"] }); },
  "Grande chevauchée de Jean de Gand": (D, g) => { perd(D, g, F, 3, { l: D.noms.filter(n => !D.lieux[n].pf) }); const l = D.noms.filter(n => !["Calais", "Bordeaux"].includes(n) && D.lieux[n].region !== "Angleterre"); for (let k = 0; k < 4; k++) { const p = l.filter(n => g.inf[n].A > 0 && (g._gand?.[n] || 0) < 2); if (!p.length) break; const av = Object.fromEntries(p.map(n => [n, g.inf[n].A])); retirerChoisi(D, g, A, 1, p); for (const n of p) if (g.inf[n].A < av[n]) (g._gand ||= {})[n] = (g._gand[n] || 0) + 1; } delete g._gand; },
  "Le captal de Buch": (D, g) => { inf(D, g, A, 2, { r: "Guyenne" }); g.statuts.captal = true; },
  "Chevauchée de Buckingham": (D, g) => { chemin(D, g, A, "Calais", 4); tresor(g, F, -1); },
  "Réformes de Charles V": (D, g) => choisir(D, g, F, "Réformes de Charles V", [{ t: "Trésor +3", f: h => tresor(h, F, 3) }, { t: "+1 OPS à toutes vos cartes jusqu'à la fin du tour", f: h => { (h.statuts.endiguement ||= {}).F = h.tour; } }]),
  "Reconquête du Poitou": (D, g) => { delete g.statuts.captal; const l = zone(D, { p: ["Poitou", "Aunis"] }); perd(D, g, A, Math.min(3, l.filter(n => g.inf[n].F > 0).length), { l }); },
  "Prise de Poitiers": (D, g) => { forcerControle(D, g, F, "Poitiers"); if (controle(D, g, "La Rochelle") === F) retirer(g, A, "Lusignan", 2); },
  "Siège de Saint-Sauveur-le-Vicomte": (D, g) => choisir(D, g, F, "Siège de Saint-Sauveur-le-Vicomte", [g.tresor[F] >= 2 && { t: "payer 2 Trésor : la France contrôle Saint-Sauveur", f: h => { tresor(h, F, -2); forcerControle(D, h, F, "Saint-Sauveur-le-Vicomte"); } }, { t: "+2 Influence en Normandie", f: h => inf(D, h, F, 2, { r: "Normandie" }) }]),
  "Reprise de Bergerac": (D, g) => choisir(D, g, F, "Reprise de Bergerac", [{ t: "la France contrôle Bergerac", f: h => forcerControle(D, h, F, "Bergerac") }, { t: "la France contrôle La Réole", f: h => forcerControle(D, h, F, "La Réole") }]),
  "Échec devant Saint-Malo": (D, g) => enliser(g, A, "Échec devant Saint-Malo"),
  "Jean IV et les barons bretons": (D, g, c) => choisir(D, g, c, "Jean IV et les barons bretons", [{ t: "exil de Jean IV : Bretagne 1 cran vers la France, l'Angleterre perd 1 Influence en Bretagne", f: h => { loy(h, "Bretagne", 1); perd(D, h, A, 1, { r: "Bretagne" }); } }, { t: "retour de Jean IV : Bretagne 2 crans vers l'Angleterre", f: h => loy(h, "Bretagne", -2) }]),
  "Fin de la Navarre normande": (D, g) => { g.loy.Navarre = 0; choisir(D, g, F, "Fin de la Navarre normande", [{ t: "la France contrôle Évreux", f: h => forcerControle(D, h, F, "Évreux") }, { t: "la France contrôle Mantes", f: h => forcerControle(D, h, F, "Mantes") }]); },
  "Louis d'Anjou en Languedoc": (D, g) => { inf(D, g, F, Math.max(1, nbCtl(D, g, F, pfDe(D, "Languedoc"))), { r: "Languedoc" }); crise(g, 1); },
  "Flotte d'invasion de L'Écluse": (D, g) => { tresor(g, A, -2); g.opsMalus.A = 1; if (maitriseManche(D, g) === F) inf(D, g, F, 2, { l: ports(D, "Angleterre") }); },
  "Révolte paysanne": (D, g) => { crise(g, 1); const c = g.tresor.A > g.tresor.F ? A : g.tresor.F > g.tresor.A ? F : null; if (c) tresor(g, c, -2); if (g.statuts.gabelle) perd(D, g, F, 1, {}); },
  "Révolte urbaine": (D, g) => { crise(g, 1); for (const c of [A, F]) { const l = zone(D, { r: ["Flandre", "Île-de-France"] }).filter(n => g.inf[n][c] > 0); if (!l.length) continue; const m = Math.max(...l.map(n => g.inf[n][c])); retirer(g, c, l.find(n => g.inf[n][c] === m)); } if (g.statuts.gabelle) perd(D, g, F, 1, {}); },
  "Jean de Vienne en Écosse": (D, g) => choisir(D, g, F, "Jean de Vienne en Écosse", [{ t: "Écosse 2 crans vers la France", f: h => loy(h, "Écosse", 2) }, g.tresor[F] >= 2 && { t: "payer 2 Trésor : +3 Influence en Écosse et à Durham (2 au plus par lieu)", f: h => { tresor(h, F, -2); infMax(D, h, F, 3, [...zone(D, { r: "Écosse" }), "Durham"], 2); } }]),
  "Bataille d'Otterburn": (D, g) => { perd(D, g, A, 2, { l: ["Durham", "Berwick"] }); tresor(g, A, -1); if (controle(D, g, "Berwick") === F) loy(g, "Écosse", 1); },
  "Richard II brûle Édimbourg": (D, g) => { const ok = assaut(D, g, A, 3, "Édimbourg", { gratuit: true, sansTreve: true }); if (ok) loy(g, "Écosse", -1); },
  // ------------------------------------------------ phase III
  "Trêve de Leulinghem": (D, g, c) => { treve(D, g, 2); choisir(D, g, c, "Trêve de Leulinghem", [{ t: "+1 Influence dans un lieu tenu", f: h => { const l = D.noms.filter(n => h.inf[n][c] > 0); if (l.length) placerLibre(D, h, c, 1, l); } }, { t: "Trésor +2", f: h => tresor(h, c, 2) }]); },
  "Trêve de vingt-huit ans": (D, g, c) => { treve(D, g, 2); g.tourFlags.aucunAssaut = true; const l = g.defausse.filter(id => !carte(D, id).decompte); if (l.length) choisir(D, g, c, "Trêve de vingt-huit ans : reprendre une carte de la défausse", l.map(id => ({ t: carte(D, id).nom, id, f: h => { h.defausse = h.defausse.filter(x => x !== id); h.mains[c].push(id); } }))); },
  "Usurpation d'Henri IV": (D, g) => { legit(g, A, -2); if (g.joues["Trêve de vingt-huit ans"]) legit(g, F, 1); },
  "La révolte galloise": (D, g) => { g.statuts.owain = true; choisir(D, g, F, "La révolte galloise", [maitriseManche(D, g) !== A && { t: "débarquement de 1405 : +2 Influence au pays de Galles", f: h => ajouter(h, F, "Pays de Galles", 2) }, { t: "Trésor anglais −2", f: h => tresor(h, A, -2) }]); },
  "Bataille de Shrewsbury": (D, g) => { legit(g, A, 1); delete g.statuts.owain; crise(g, -1); },
  "Expédition de Clarence": (D, g) => choisir(D, g, A, "Expédition de Clarence", [{ t: `Trésor +${5 + (g.joues["Traité de Bourges"] ? 2 : 0)} (traité de Buzançais)`, f: h => tresor(h, A, 5 + (h.joues["Traité de Bourges"] ? 2 : 0)) }, { t: "Assaut gratuit à 3 OPS en Val de Loire", f: h => assautGratuit(D, h, A, 3, { r: "Val de Loire" }) }]),
  "Guerre civile": (D, g, c) => { crise(g, 1); choisir(D, g, c, "Guerre civile", [{ t: "l'adversaire perd 2 Influence en Île-de-France ou en Val de Loire", f: h => perd(D, h, adv(c), 2, { r: ["Île-de-France", "Val de Loire"] }) }, { t: "+3 Influence en Languedoc (Ligue de Gien)", f: h => inf(D, h, c, 3, { r: "Languedoc" }) }]); },
  "Paix fourrées": (D, g) => { crise(g, -1); treve(D, g, 1); g.loy.Bourgogne -= Math.sign(g.loy.Bourgogne); },
  "Révolte cabochienne": (D, g) => { crise(g, 1); const c = controle(D, g, "Paris"); if (c) retirer(g, c, "Paris", 2); },
  "Avènement d'Henri V": (D, g) => { legit(g, A, 2); choisir(D, g, A, "Avènement d'Henri V", [{ t: "+2 Influence dans des lieux tenus", f: h => { const l = D.noms.filter(n => h.inf[n].A > 0); if (l.length) placerLibre(D, h, A, 2, l); } }, { t: "maîtrise de la mer jusqu'à la fin du tour suivant", f: h => maitriseJusque(h, A, h.tour + 2) }]); },
  "Complot de Southampton": (D, g) => { g.opsMalus.A = 1; },
  "Siège d'Harfleur": (D, g) => { forcerControle(D, g, A, "Harfleur"); choisir(D, g, A, "Siège d'Harfleur : la dysenterie", [{ t: "perdre 2 Influence ailleurs en Normandie", f: h => { for (let k = 0; k < 2; k++) { const l = zone(D, { r: "Normandie" }).filter(n => n !== "Harfleur" && h.inf[n].A > 0); if (!l.length) break; retirer(h, A, l[0]); } } }, { t: "perdre 2 Trésor", f: h => tresor(h, A, -2) }]); },
  "Prise de Caen": (D, g) => { forcerControle(D, g, A, "Caen"); choisir(D, g, A, "Prise de Caen", [{ t: "+1 Influence à Falaise", f: h => ajouter(h, A, "Falaise") }, { t: "+1 Influence à Évreux", f: h => ajouter(h, A, "Évreux") }]); },
  "Siège de Rouen": (D, g) => { forcerControle(D, g, A, "Rouen"); choisir(D, g, A, "Siège de Rouen", [{ t: "ne rien payer", f: () => {} }, g.tresor[A] >= 3 && { t: "payer 3 Trésor : +2 Influence à Mantes ou à Pontoise", f: h => { tresor(h, A, -3); inf(D, h, A, 2, { l: ["Mantes", "Pontoise"] }); } }]); },
  "Prise de Pontoise": (D, g) => { forcerControle(D, g, A, "Pontoise"); inf(D, g, A, 1, { r: "Île-de-France" }); },
  "Siège de Melun": (D, g) => { forcerControle(D, g, A, "Melun"); (g.statuts.melun ||= {}).A = g.tour; },
  "Traité d'Amiens": (D, g) => choisir(D, g, A, "Traité d'Amiens", [{ t: "Bourgogne et Bretagne 1 cran vers l'Angleterre", f: h => { loy(h, "Bourgogne", -1); loy(h, "Bretagne", -1); } }, { t: "Bourgogne 2 crans vers l'Angleterre", f: h => loy(h, "Bourgogne", -2) }, { t: "Bretagne 2 crans vers l'Angleterre", f: h => loy(h, "Bretagne", -2) }]),
  "Richemont connétable": (D, g) => choisir(D, g, F, "Richemont connétable", [{ t: "Bretagne 2 crans vers la France", f: h => loy(h, "Bretagne", 2) }, { t: "+1 aux Assauts français jusqu'à la fin du tour suivant", f: h => { h.statuts.richemont = h.tour + 1; } }]),
  "Traité de Bourges": (D, g) => { inf(D, g, A, 2, { r: "Guyenne" }); legit(g, F, -1); },
  "Siège du Crotoy": (D, g) => forcerControle(D, g, A, "Le Crotoy"),
  "Bataille de Montargis": (D, g) => { g.inf.Montargis.A = 0; perd(D, g, A, 1, { p: ["Orléanais"] }); },
  "Bataille d'Homildon Hill": (D, g) => { loy(g, "Écosse", -2); crise(g, 1); },
  "Jacques Ier d'Écosse en France": (D, g) => { loy(g, "Écosse", -2); const l = D.noms.filter(n => g.inf[n].F > 2); if (l.length) perd(D, g, F, 2, { l: [l[0]] }); },
  "Armée d'Écosse": (D, g) => { choisir(D, g, F, "Armée d'Écosse", [{ t: "+3 Influence en Val de Loire", f: h => inf(D, h, F, 3, { r: "Val de Loire" }) }, { t: "+2 Influence en Val de Loire et +1 à la prochaine Bataille française", f: h => { inf(D, h, F, 2, { r: "Val de Loire" }); h.statuts.dunois = true; } }]); perd(D, g, F, 1, { r: "Écosse" }); },
  "Bataille de Baugé": (D, g) => { perd(D, g, A, g.joues["Armée d'Écosse"] ? 3 : 2, { p: ["Maine", "Touraine"] }); loy(g, "Écosse", 1); },
  "Bataille de Verneuil": (D, g) => { loy(g, "Écosse", -3); perd(D, g, F, 2, { r: "Normandie" }); vp(g, A, g.joues["Armée d'Écosse"] ? 2 : 1); },
  // ------------------------------------------------ phase IV
  "Campagne de Salisbury": (D, g) => infMax(D, g, A, 4, autour(D, "Orléans"), 1),
  "Mort de Salisbury": (D, g) => { perd(D, g, A, 2, { l: autour(D, "Orléans") }); if (!g.joues["Jeanne d'Arc"]) enliser(g, A, "Mort de Salisbury : l'Angleterre s'enlise devant Orléans"); },
  "Dunois, Bâtard d'Orléans": (D, g) => choisir(D, g, F, "Dunois, Bâtard d'Orléans", [{ t: "+3 Influence à Orléans", f: h => ajouter(h, F, "Orléans", 3) }, { t: "+1 Influence à Orléans et +1 à la prochaine Bataille française", f: h => { ajouter(h, F, "Orléans"); h.statuts.dunois = true; } }]),
  "Échec bourguignon devant Calais": (D, g) => { g.statuts.calaisImprenable = true; g.statuts.guinesImprenable = true; loy(g, "Bourgogne", -1); },
  "Taille royale permanente": (D, g) => { g.statuts.taille = true; tresor(g, F, 1); },
  "Praguerie": (D, g) => perd(D, g, F, 3 + (g.statuts.taille ? 1 : 0), {}),
  "Crise anglaise": (D, g) => choisir(D, g, F, "Crise anglaise", [{ t: "Légitimité anglaise −2 (folie d'Henri VI)", f: h => legit(h, A, -2) }, { t: "Trésor anglais −2 et 2 Influence anglaise retirées en Angleterre (Jack Cade)", f: h => { tresor(h, A, -2); perd(D, h, A, 2, { r: "Angleterre" }); } }]),
  "Le duc de Suffolk au pouvoir": (D, g) => { inf(D, g, A, 2, { r: "Angleterre" }); if (g.joues["Trêve de Tours"]) legit(g, A, -1); },
  "Querelle de Gloucester et Beaufort": (D, g) => { perd(D, g, A, 2, { r: "Angleterre" }); tresor(g, A, -1); },
  "Fin de la Normandie anglaise": (D, g) => { forcerControle(D, g, F, "Caen"); if (g.joues["Bataille de Formigny"]) forcerControle(D, g, F, "Cherbourg"); },
  "Richard d'York lieutenant en France": (D, g) => { inf(D, g, A, 2, { r: "Normandie" }); choisir(D, g, A, "Richard d'York", [0, 1, 2].filter(k => k <= g.tresor[A]).map(k => ({ t: k ? `payer ${k} Trésor : +${k} Influence en Normandie` : "ne rien payer", f: h => { if (k) { tresor(h, A, -k); inf(D, h, A, k, { r: "Normandie" }); } } }))); },
  "Siège de Dieppe": (D, g) => { g.inf.Dieppe.A = 0; perd(D, g, A, 1, { r: "Normandie" }); },
  "Reprise de Pontoise": (D, g) => { forcerControle(D, g, F, "Pontoise"); perd(D, g, A, 1, { l: ["Mantes", "Paris"] }); },
  "Francs-archers": (D, g) => choisir(D, g, F, "Francs-archers", [{ t: "+2 Influence où vous voulez (hors Angleterre)", f: h => inf(D, h, F, 2, { l: D.noms.filter(n => D.lieux[n].region !== "Angleterre") }) }, { t: "+1 aux Batailles françaises jusqu'à la fin du tour", f: h => { h.statuts.dunois = true; } }]),
};
Object.assign(EFFETS, EFFETS_B);
{ const jeanne = EFFETS["Jeanne d'Arc"]; // Jeanne d'Arc délivre Orléans : fin de l'enlisement anglais
  EFFETS["Jeanne d'Arc"] = (D, g) => { jeanne(D, g); if (g.statuts.bourbier?.A?.startsWith("Mort de Salisbury")) delete g.statuts.bourbier.A; }; }

// ---------------------------------------------------------------- pile pontificale (24 cartes, 6 par phase)
const plusFaibleLegit = g => (g.legit.A < g.legit.F ? A : g.legit.F < g.legit.A ? F : (g.score > 0 ? A : F)); // à égalité : le camp mené au score
const meneScore = g => (g.score > 0 ? F : g.score < 0 ? A : null);
const pont = (g, c, txt) => etape(g, { k: "info", camp: c, titre: "Événement pontifical", txt });
export const EFFETS_PONT = {
  "Benoît XII entre les deux rois": (D, g) => { const c = plusFaibleLegit(g); treve(D, g, 1); choisir(D, g, c, "Benoît XII entre les deux rois", [{ t: "Légitimité +1", f: h => legit(h, c, 1) }, { t: "Trésor +2", f: h => tresor(h, c, 2) }]); },
  "Excommunication des Flamands": (D, g) => { loy(g, "Flandre", 1); g.tourFlags.excommunication = true; },
  "Trêve d'Esplechin": (D, g) => { treve(D, g, 1); g.tourFlags.aucunSiege = true; },
  "Cardinaux à Calais": (D, g) => { treve(D, g, 2); const c = meneScore(g); if (c) g.bonusPremiere[adv(c)] = 1; },
  "Clément VI achète Avignon": (D, g) => { tresor(g, F, 2); g.statuts.decime = true; },
  "Décime de Clément VI": (D, g) => { tresor(g, controle(D, g, "Avignon") || F, 3); crise(g, 1); },
  "Innocent VI et les négociations de Guînes": (D, g) => { treve(D, g, 1); for (const c of [A, F]) { const l = D.noms.filter(n => g.inf[n][c] > 0 && D.lieux[n].region !== "Angleterre"); choisir(D, g, c, "Innocent VI : déplacer 1 Influence", [{ t: "ne rien déplacer", f: () => {} }, ...l.map(n => ({ t: `retirer 1 Influence de ${n} et la replacer`, f: h => { retirer(h, c, n); placerLibre(D, h, c, 1, lieuxAccessibles(D, h, c).filter(x => x !== n)); } }))]); } },
  "Urbain V contre les Compagnies": (D, g) => { const l = zone(D, { r: "Languedoc" }), s = c => l.reduce((t, n) => t + g.inf[n][c], 0); const c = s(A) > s(F) ? A : s(F) > s(A) ? F : null; if (c) perd(D, g, adv(c), 2, { r: "Languedoc" }); },
  "Dispense refusée": (D, g) => loy(g, "Flandre", 1),
  "Trêve de Bruges": (D, g) => { treve(D, g, 2); g.tourFlags.aucunAssautRound1 = true; },
  "Retour de Grégoire XI à Rome": (D, g) => legit(g, A, 1),
  "Grand Schisme d'Occident": (D, g) => { g.statuts.schisme = true; g.bonusPremiere = { A: 1, F: 1 }; },
  "Croisade de Nicopolis": (D, g) => { perd(D, g, A, 1, {}); perd(D, g, F, 1, {}); treve(D, g, 1); },
  "Soustraction d'obédience": (D, g) => { g.statuts.soustraction = g.tour; if (g.bonusPremiere) g.bonusPremiere.F = 0; },
  "Concile de Pise": (D, g) => legit(g, plusFaibleLegit(g), 1),
  "Concile de Constance": (D, g) => { const c = meneScore(g); g.statuts.schisme = false; g.bonusPremiere = { A: 0, F: 0 }; if (c) legit(g, c, 1); },
  "Benoît XIII s'entête": (D, g) => loy(g, "Castille", -1),
  "Martin V élu": (D, g) => crise(g, -1),
  "Légats de Martin V": (D, g) => { treve(D, g, 1); tresor(g, plusFaibleLegit(g), 2); },
  "Concile de Bâle": (D, g) => { legit(g, F, 1); crise(g, -1); },
  "Médiation du cardinal Albergati": (D, g) => loy(g, "Bourgogne", g.loy.Bourgogne > 0 ? -1 : g.loy.Bourgogne < 0 ? 1 : 0),
  "Eugène IV contre Bâle": (D, g) => tresor(g, A, 2),
  "Jubilé de 1450": (D, g) => { crise(g, -1); treve(D, g, 1); },
  "Enquête du cardinal d'Estouteville": (D, g) => legit(g, F, 1),
};
