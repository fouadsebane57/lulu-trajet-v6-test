/* ===================================================================
   ACCÈS AU CONTENU

   Source unique de vérité. Toute lecture du contenu passe par ici.
   Une phrase est identifiée par son `id` permanent, jamais par sa
   position dans un tableau.

   Le contenu est importé statiquement : aucun `window.LULU_CONTENT`,
   aucune dépendance à l'ordre de chargement des balises script. C'est
   ce qui permet aux tests de charger le contenu réel sans DOM.
   =================================================================== */

import { PHRASES_A } from "./phrases-a.js";
import { PHRASES_B } from "./phrases-b.js";
import { DIALOGUES as DLG } from "./dialogues.js";
import { NIVEAUX as NIV, PAQUETS as PKS, MICRO_MODULES as MIC } from "./parcours.js";
import { VERSION_CONTENU } from "./version.js";

const TOUTES = [...PHRASES_A, ...PHRASES_B];

export const versionContenu = () => VERSION_CONTENU;
export const NIVEAUX = () => NIV;
export const PAQUETS = () => PKS;
export const MICRO_MODULES = () => MIC;
export const DIALOGUES = () => DLG;

/** Toutes les phrases, dans l'ordre du parcours. */
export const phrases = () => TOUTES;

const _parId = new Map();
for (const p of TOUTES) if (!_parId.has(p.id)) _parId.set(p.id, p);

export const parId = (id) => _parId.get(id) || null;

const _parPaquet = new Map();
for (const p of TOUTES) {
  if (!_parPaquet.has(p.paquet)) _parPaquet.set(p.paquet, []);
  _parPaquet.get(p.paquet).push(p);
}
export const phrasesDuPaquet = (idPaquet) => _parPaquet.get(idPaquet) || [];

export const phrasesDuNiveau = (n) => TOUTES.filter((p) => p.niveau === n && !p.micro);

/** Un paquet ou un micro-module, par identifiant. */
export function paquet(id) {
  return PKS.find((p) => p.id === id) || MIC.find((m) => m.id === id) || null;
}

/** Tous les paquets d'un niveau, micro-modules exclus. */
export const paquetsDuNiveau = (n) => PKS.filter((p) => p.n === n);

/**
 * Micro-modules ouverts par un paquet donné.
 * Les chiffres, l'alphabet et les sons n'ouvrent plus le parcours :
 * ils arrivent au moment où le paquet correspondant en a besoin.
 */
export const microDeclenchesPar = (idPaquet) => MIC.filter((m) => m.declencheur === idPaquet);

export const dialoguesDuNiveau = (n) => DLG.filter((d) => d.niveau <= n);
export const dialogueParId = (id) => DLG.find((d) => d.id === id) || null;

/** Vocabulaire d'un paquet. Sert à guider la reconnaissance vocale. */
export function vocabulaireDuPaquet(idPaquet, max = 40) {
  return phrasesDuPaquet(idPaquet).map((p) => p.lb).slice(0, max);
}

/** Répartition des statuts de vérification. Affichée telle quelle. */
export function statuts() {
  const r = { verified: 0, reviewing: 0, unverified: 0 };
  for (const p of TOUTES) r[p.st] = (r[p.st] || 0) + 1;
  return r;
}

export function chiffres() {
  return {
    phrases: TOUTES.length,
    reprises: TOUTES.filter((p) => !p.derive).length,
    derivees: TOUTES.filter((p) => p.derive).length,
    paquets: PKS.length,
    microModules: MIC.length,
    dialogues: DLG.length,
    niveaux: NIV.length,
    statuts: statuts()
  };
}
