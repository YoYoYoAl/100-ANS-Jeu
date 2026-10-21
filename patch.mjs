// leviers d'équilibrage testés sans toucher aux fichiers du moteur
import { EFFETS } from "./moteur/effets.js";
import * as RG from "./moteur/regles.js";
export function appliquerPatch(D, P) {
  if (P.sansPape) D.idPape = null;
  if (P.arras3) EFFETS["Congrès d'Arras"] = (D, g) => RG.loy(g, "Bourgogne", 3);
  if (P.troyes) { const t = EFFETS["Traité de Troyes"]; EFFETS["Traité de Troyes"] = (D, g, c) => { t(D, g, c); RG.placerLibre(D, g, "A", 3, RG.zone(D, { r: "Île-de-France" })); }; }
  if (P.montereau) { const t = EFFETS["Assassinat de Montereau"]; EFFETS["Assassinat de Montereau"] = (D, g, c) => { t(D, g, c); RG.placerLibre(D, g, "A", 2, RG.zone(D, { r: ["Bourgogne", "Île-de-France"] })); }; }
  for (const [n, inf] of Object.entries(P.inf || {})) D.lieux[n].inf = { ...D.lieux[n].inf, ...inf };   // influence de départ d'un lieu
  for (const [n, o] of Object.entries(P.ops || {})) D.parNom[n].ops = o;                                 // OPS d'une carte
  for (const [n, s] of Object.entries(P.statut || {})) D.parNom[n].statut = s;                           // obligatoire / facultative
}
