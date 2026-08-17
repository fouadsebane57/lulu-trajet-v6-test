/* ===================================================================
   NORMALISATION LINGUISTIQUE

   Deux niveaux volontairement distincts.

   normalizeStrict : ne touche QUE ce qui n'a aucune valeur phonémique.
     casse, ponctuation, apostrophes, espaces, tirets.
     Les voyelles ë é ä ö ü sont CONSERVÉES. Elles portent du sens
     en luxembourgeois et sont enseignées à l'étape 2.

   normalizeLoose : replie en plus les diacritiques.
     Sert uniquement à détecter qu'une réponse ne diffère QUE par un
     accent, afin de la classer « proche » et non « fausse ».
     Ne doit jamais servir à déclarer une réponse correcte.

   L'ancien moteur appliquait l'équivalent de normalizeLoose des deux
   côtés, puis ajoutait des substitutions phonétiques agressives
   (sch>sh, ch>h, w>v, z>ts, dédoublement). Résultat mesuré :
   « gär » et « gar » devenaient identiques, « méi » et « mei » aussi,
   « wäit » et « wait » aussi. Le moteur ne pouvait donc pas évaluer
   la prononciation qu'il prétendait enseigner.
   =================================================================== */

const APOSTROPHES = /[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g;
const PONCTUATION = /[.,;:!?…«»""()\[\]{}/\\]/g;
const TIRETS = /[\u2010-\u2015\u2212]/g;

/** Niveau strict. Diacritiques conservés. */
export function normalizeStrict(input) {
  return String(input ?? "")
    .normalize("NFC")
    .replace(APOSTROPHES, "'")
    .replace(TIRETS, "-")
    .toLowerCase()
    .replace(PONCTUATION, " ")
    .replace(/-/g, " ")
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Niveau souple. Diacritiques repliés. Usage restreint. */
export function normalizeLoose(input) {
  return normalizeStrict(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

/**
 * Variantes d'écriture équivalentes à l'oral, sans modifier le sens.
 * On accepte l'élision écrite ou non, car le moteur de transcription
 * peut rendre « d'Auer » ou « d Auer » selon la ponctuation automatique.
 */
export function apostropheVariants(normalized) {
  const set = new Set([normalized]);
  set.add(normalized.replace(/'/g, " ").replace(/\s+/g, " ").trim());
  set.add(normalized.replace(/'/g, ""));
  return [...set].filter(Boolean);
}

export function tokenize(normalized) {
  return normalized.split(" ").filter(Boolean);
}

/** Distance de Levenshtein, itérative, sans allocation superflue. */
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}

/** Similarité caractère, entre 0 et 1. */
export function charSimilarity(a, b) {
  const max = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / max;
}

/** Exactitude au mot, entre 0 et 1. Levenshtein appliqué aux jetons. */
export function wordAccuracy(aTokens, bTokens) {
  const max = Math.max(aTokens.length, bTokens.length, 1);
  return 1 - levenshtein(aTokens, bTokens) / max;
}
