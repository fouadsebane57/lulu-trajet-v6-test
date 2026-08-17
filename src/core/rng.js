/* ===================================================================
   SOURCE D'ALÉA

   Jusqu'au GATE 2.4, le mélange de la file appelait `Math.random()`
   directement dans session.js. Deux conséquences :

     1. aucun test ne pouvait reproduire une file fautive ;
     2. la suite de tests devenait non déterministe. Un défaut réel
        n'apparaissait que dans une exécution sur deux, ce qui est
        pire qu'un défaut permanent.

   Ici l'aléa devient une dépendance injectée. La production garde un
   aléa normal. Les tests passent une graine et obtiennent toujours la
   même file. Le hasard n'est plus un facteur caché.

   Ce module est le SEUL du dossier `core` autorisé à appeler
   `Math.random()`. Un test d'architecture le vérifie.
   =================================================================== */

/**
 * Générateur déterministe, algorithme mulberry32.
 * Choisi pour trois raisons : état sur 32 bits, aucune dépendance,
 * distribution suffisante pour un mélange de file d'exercices.
 *
 * Ce n'est PAS un générateur cryptographique. Il ne doit jamais servir
 * à produire un identifiant, un jeton ou un secret.
 *
 * @param {number} graine entier
 * @returns {() => number} tirage dans [0, 1[
 */
export function creerRng(graine) {
  let a = (Number(graine) >>> 0) || 0x9e3779b9;
  return function tirage() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Aléa de production. Seul endroit de `core` où Math.random est appelé. */
export const rngSysteme = () => Math.random();

/**
 * Résout la source d'aléa à partir des options d'appel.
 * Ordre : rng explicite, puis graine, puis aléa système.
 */
export function resoudreRng({ rng, seed, graine } = {}) {
  if (typeof rng === "function") return rng;
  const g = seed ?? graine;
  if (g !== undefined && g !== null && g !== "") return creerRng(g);
  return rngSysteme;
}

/**
 * Mélange de Fisher-Yates. Ne modifie pas le tableau reçu.
 * @param {Array} liste
 * @param {() => number} rng
 */
export function melanger(liste, rng = rngSysteme) {
  const x = liste.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
