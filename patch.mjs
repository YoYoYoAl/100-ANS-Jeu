// leviers d'équilibrage testés sans toucher aux fichiers du moteur
import { EFFETS } from "./moteur/effets.js";
import * as RG from "./moteur/regles.js";
export function appliquerPatch(D, P) {
  if (P.sansPape) D.idPape = null;
  if (P.arras3) EFFETS["Congrès d'Arras"] = (D, g) => RG.loy(g, "Bourgogne", 3);
  if (P.troyes) { const t = EFFETS["Traité de Troyes"]; EFFETS["Traité de Troyes"] = (D, g, c) => { t(D, g, c); RG.placerLibre(D, g, "A", 3, RG.zone(D, { r: "Île-de-France" })); }; }
  if (P.montereau) { const t = EFFETS["Assassinat de Montereau"]; EFFETS["Assassinat de Montereau"] = (D, g, c) => { t(D, g, c); RG.placerLibre(D, g, "A", 2, RG.zone(D, { r: ["Bourgogne", "Île-de-France"] })); }; }
  // retours en arrière partiels de la 2e passe sur les cartes historiques
  const { A, F } = RG;
  if (P.r1) EFFETS["Mort d'Édouard III"] = (D, g) => { RG.legit(g, A, -1); g.prochainMalus = g.prochainMalus || { A: 0, F: 0 }; g.prochainMalus[A] = 1; };
  if (P.r2) { const f = EFFETS["Le Grand Ferré"]; EFFETS["Le Grand Ferré"] = (D, g, c) => { f(D, g, c); g.statuts.grandFerre = true; }; }
  if (P.r3) EFFETS["Bataille de Soubise"] = (D, g) => RG.retirerChoisi(D, g, A, 2, [...RG.zone(D, { r: "Guyenne" }), "La Rochelle"]);
  if (P.r4) { const f = EFFETS["Raids sur les côtes anglaises"]; EFFETS["Raids sur les côtes anglaises"] = (D, g, c) => { f(D, g, c); RG.tresor(g, A, -1); }; }
  for (const [n, inf] of Object.entries(P.inf || {})) D.lieux[n].inf = { ...D.lieux[n].inf, ...inf };   // influence de départ d'un lieu
  for (const [n, o] of Object.entries(P.ops || {})) D.parNom[n].ops = o;                                 // OPS d'une carte
  for (const [n, s] of Object.entries(P.statut || {})) D.parNom[n].statut = s;                           // obligatoire / facultative
}
