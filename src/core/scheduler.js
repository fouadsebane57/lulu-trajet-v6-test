/* ===================================================================
   RÉPÉTITION ESPACÉE

   Ce module remplace l'ordonnanceur de la 5.1.0, qui dupliquait le
   modèle de progression au lieu de s'appuyer dessus. Deux sources de
   vérité sur la même donnée finissent toujours par diverger.

   Ici, l'ordonnanceur ne stocke rien. Il LIT les preuves écrites par
   core/preuve.js et répond à une seule question :

     quand cette phrase doit-elle revenir, et pour quel exercice ?

   PALIERS

   La 5.1.0 n'avait pas de palier court. Une phrase vue pour la
   première fois ne revenait qu'au lendemain, ce qui laisse le temps de
   tout oublier. Les paliers commencent donc à dix minutes, dans la
   séance elle-même.

     palier 0   10 minutes    même séance
     palier 1    1 jour
     palier 2    3 jours
     palier 3    7 jours
     palier 4   14 jours
     palier 5   30 jours
     palier 6   60 jours

   FACILITÉ

   Inspirée de SM-2, sans en reprendre la formule telle quelle : SM-2
   suppose une note d'auto-évaluation de 0 à 5, que nous n'avons pas et
   que nous refusons de simuler. La facilité bouge donc sur trois
   faits mesurés : réussite, échec, et présence d'un indice.

   CE QUE L'ORDONNANCEUR NE FAIT PAS

   Il ne fait jamais monter une phrase d'un palier sur une simple
   écoute. Une exposition ne change ni le palier ni la facilité. C'est
   la règle qui empêche l'illusion de progression.
   =================================================================== */

import { DIM, DIMENSIONS, MESURABLE, normaliser, niveau, aujourdHui } from "./preuve.js";

export const MINUTE = 60000;
export const JOUR = 86400000;

/** Paliers, en millisecondes. Le premier est volontairement court. */
export const PALIERS = [10 * MINUTE, 1 * JOUR, 3 * JOUR, 7 * JOUR, 14 * JOUR, 30 * JOUR, 60 * JOUR];
export const PALIER_MAX = PALIERS.length - 1;

export const FACILITE_MIN = 1.3;
export const FACILITE_MAX = 2.8;
export const FACILITE_INITIALE = 2.2;

/**
 * Solidité.
 *
 * Deux conditions, pas une seule. Le palier ne suffit pas : deux
 * réussites obtenues à une minute d'intervalle font monter le niveau
 * sans rien prouver de la mémoire à long terme. Une phrase n'est
 * solide que si elle a AUSSI été retrouvée après un délai réel.
 */
export const PALIER_SOLIDE = 3;
export const ETALEMENT_SOLIDE_MS = 20 * 60 * 60 * 1000;   // vingt heures
export const REUSSITES_SOLIDE = 3;

/* ---------- État d'ordonnancement, dérivé des preuves ---------- */

/**
 * L'état d'une dimension pour l'ordonnanceur.
 * `n` vient des preuves. Le palier en découle, borné.
 */
export function etatDimension(entree, dim) {
  const e = normaliser(entree);
  const d = e.dims[dim] || {};
  const reussites = d.reussites || 0;
  const echecs = d.echecs || 0;
  const palier = Math.min(PALIER_MAX, Math.max(0, (d.n || 0) - 1));
  return {
    dim,
    mesurable: !!MESURABLE[dim],
    n: d.n || 0,
    palier,
    reussites,
    echecs,
    avecIndice: d.avecIndice || 0,
    sansIndice: d.sansIndice || 0,
    dernier: d.dernier || 0,
    echeance: d.echeance || 0,
    facilite: facilite(d)
  };
}

/**
 * Facilité d'une dimension. Trois faits seulement, tous mesurés.
 * Un échec pèse plus qu'une réussite : l'oubli est l'information la
 * plus fiable dont nous disposions.
 */
export function facilite(d = {}) {
  const reussites = d.sansIndice || 0;
  const aides = d.avecIndice || 0;
  const echecs = d.echecs || 0;
  const f = FACILITE_INITIALE + reussites * 0.08 - aides * 0.04 - echecs * 0.20;
  return Math.max(FACILITE_MIN, Math.min(FACILITE_MAX, Number(f.toFixed(3))));
}

/**
 * Prochaine échéance après un résultat.
 *
 * @param {object} d       dimension, format preuve
 * @param {boolean} reussi
 * @param {boolean} avecIndice
 * @param {number} maintenant
 */
export function prochaineEcheance(d, { reussi, avecIndice = false, maintenant = Date.now() } = {}) {
  const palierActuel = Math.min(PALIER_MAX, Math.max(0, (d?.n || 0) - 1));
  if (!reussi) {
    // Un échec ramène au palier court, jamais à zéro absolu : la phrase
    // a déjà été rencontrée, la retraiter comme neuve gaspille du temps.
    return maintenant + PALIERS[0];
  }
  const suivant = avecIndice ? palierActuel : Math.min(PALIER_MAX, palierActuel + 1);
  const base = PALIERS[suivant];
  const f = facilite(d);
  // La facilité module l'intervalle sans jamais le rendre plus court
  // que le palier précédent, ni plus long que le palier suivant.
  const module = Math.round(base * (f / FACILITE_INITIALE));
  const plancher = PALIERS[Math.max(0, suivant - 1)];
  const plafond = PALIERS[Math.min(PALIER_MAX, suivant + 1)];
  return maintenant + Math.max(plancher, Math.min(plafond, module));
}

/* ---------- Décisions de séance ---------- */

/** Échéance la plus proche parmi les dimensions mesurables déjà entamées. */
export function echeance(entree) {
  const e = normaliser(entree);
  const dates = DIMENSIONS
    .filter((d) => MESURABLE[d])
    .map((d) => e.dims[d])
    .filter((d) => d && d.n > 0 && d.echeance)
    .map((d) => d.echeance);
  return dates.length ? Math.min(...dates) : 0;
}

/** La phrase est-elle à revoir maintenant ? */
export function estDue(entree, maintenant = Date.now()) {
  const e = normaliser(entree);
  const entamee = DIMENSIONS.some((d) => MESURABLE[d] && (e.dims[d]?.n || 0) > 0);
  if (!entamee) return false;
  const ech = echeance(entree);
  return ech === 0 || ech <= maintenant;
}

/** Jamais rencontrée : aucune preuve, aucune exposition. */
export function estNeuve(entree) {
  const e = normaliser(entree);
  const aucunePreuve = DIMENSIONS.every((d) => (e.dims[d]?.n || 0) === 0);
  return aucunePreuve && (e.signaux?.nombreExpositions || 0) === 0;
}

/** Rencontrée mais jamais prouvée. Elle a été entendue, rien de plus. */
export function estExposeeSeulement(entree) {
  const e = normaliser(entree);
  const aucunePreuve = DIMENSIONS.every((d) => (e.dims[d]?.n || 0) === 0);
  return aucunePreuve && (e.signaux?.nombreExpositions || 0) > 0;
}

export function estSolide(entree, maintenant = Date.now()) {
  const e = normaliser(entree);
  for (const dim of [DIM.RAPPEL, DIM.PRODUCTION]) {
    const d = e.dims[dim] || {};
    if (Math.max(0, (d.n || 0) - 1) < PALIER_SOLIDE) return false;
    if ((d.reussites || 0) < REUSSITES_SOLIDE) return false;
    // Étalement réel entre la première et la dernière réussite.
    if (!d.premier || (d.dernier || 0) - d.premier < ETALEMENT_SOLIDE_MS) return false;
  }
  return true;
}

/**
 * Prochaine dimension à travailler pour cette phrase.
 *
 * L'ordre respecte la progression naturelle : on comprend avant de
 * retrouver, on retrouve avant de produire, on produit avant d'aller
 * vite. La prononciation n'apparaît jamais : aucun instrument fiable
 * n'existe pour le luxembourgeois, la dimension reste non mesurée.
 */
export const ORDRE_DIMENSIONS = [DIM.COMPREHENSION, DIM.RAPPEL, DIM.PRODUCTION, DIM.FLUIDITE, DIM.TRANSFERT];

export function dimensionSuivante(entree) {
  const e = normaliser(entree);
  for (const d of ORDRE_DIMENSIONS) {
    if (!MESURABLE[d]) continue;
    if ((e.dims[d]?.n || 0) < 2) return d;
  }
  // Tout est entamé : on reprend la dimension la plus en retard.
  let pire = ORDRE_DIMENSIONS[0], min = Infinity;
  for (const d of ORDRE_DIMENSIONS) {
    const n = e.dims[d]?.n || 0;
    if (n < min) { min = n; pire = d; }
  }
  return pire;
}

/**
 * Types d'exercice acceptables pour une phrase, à cet instant.
 * Une phrase jamais entendue ne peut pas partir en rappel actif.
 */
export function typesAdmissibles(entree) {
  const e = normaliser(entree);
  if (estNeuve(e)) return ["ecoute", "ecoute_lente", "repetition"];
  const comprehension = e.dims[DIM.COMPREHENSION]?.n || 0;
  const rappel = e.dims[DIM.RAPPEL]?.n || 0;
  const production = e.dims[DIM.PRODUCTION]?.n || 0;

  const out = ["ecoute", "ecoute_lente", "repetition", "comprehension", "discrimination"];
  if (comprehension >= 1 || production >= 1) out.push("rappel", "production", "nombre");
  if (rappel >= 2 && production >= 2) out.push("variation", "dialogue", "test_differe");
  // La fluidité ne se travaille pas avant que la forme soit disponible.
  if (production >= 3) out.push("fluidite");
  return out;
}

/**
 * Priorité de reprise. Plus le nombre est bas, plus c'est urgent.
 * Le retard compte davantage que l'utilité : une phrase oubliée coûte
 * plus cher qu'une phrase utile jamais vue.
 */
export function priorite(entree, phrase, maintenant = Date.now()) {
  const e = normaliser(entree);
  const ech = echeance(e);
  const retardJours = ech ? Math.max(0, (maintenant - ech) / JOUR) : 0;
  const echecs = DIMENSIONS.reduce((s, d) => s + (e.dims[d]?.echecs || 0), 0);
  const utilite = phrase?.util || 3;

  if (echecs > 0 && estDue(e, maintenant)) return 0;        // fragile et due
  if (estDue(e, maintenant)) return retardJours >= 1 ? 1 : 2;
  if (estNeuve(e)) return utilite >= 4 ? 3 : 5;
  if (estExposeeSeulement(e)) return 4;
  return 6;
}

/** Compteurs affichés dans le tableau de bord. Aucun n'est estimé. */
export function tableauDeBord(phrases, progressionDe, maintenant = Date.now()) {
  let rencontrees = 0, comprises = 0, rappelees = 0, produites = 0, solides = 0, aRevoir = 0;
  for (const p of phrases) {
    const e = normaliser(progressionDe(p.id));
    if (!estNeuve(e)) rencontrees++;
    if ((e.dims[DIM.COMPREHENSION]?.n || 0) >= 2) comprises++;
    if ((e.dims[DIM.RAPPEL]?.n || 0) >= 2) rappelees++;
    if ((e.dims[DIM.PRODUCTION]?.n || 0) >= 2) produites++;
    if (estSolide(e)) solides++;
    if (estDue(e, maintenant)) aRevoir++;
  }
  return { total: phrases.length, rencontrees, comprises, rappelees, produites, solides, aRevoir };
}

export { aujourdHui };
