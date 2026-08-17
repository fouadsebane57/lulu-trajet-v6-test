/* ===================================================================
   COMPARAISON ET VERDICT

   Principe non négociable :
   une défaillance technique ne fait jamais baisser la progression.

   Le seuil dépend de la longueur. L'ancien moteur utilisait 0,78 pour
   tout. Mesuré sur le contenu réel, cela donnait :
     « Wann ech gelift » entendu « Wann ich geliebt »  -> 0,786 -> validé
     « jo » prononcé correctement, entendu « yo »      -> 0,500 -> refusé
   Faux positif sur les phrases, faux négatif sur les mots courts.
   =================================================================== */

import {
  normalizeStrict, normalizeLoose, apostropheVariants,
  tokenize, charSimilarity, wordAccuracy
} from "./normalize.js";

export const VERDICT = {
  CORRECT: "correct",
  PROBABLE: "probablement_correct",
  PROCHE: "proche",
  RETRAVAILLER: "a_retravailler",
  INCERTAIN: "reconnaissance_incertaine",
  AUCUNE_PAROLE: "aucune_parole",
  MICRO: "micro_indisponible",
  SERVICE: "service_indisponible",
  // Mode autonome : aucun moteur de transcription, mais l'application
  // a bien entendu une tentative. Elle le dit sans prétendre juger la
  // prononciation, puis fait comparer le modèle et l'enregistrement.
  AUTONOME: "compare_toi_meme"
};

/** Effet sur la progression. `none` = aucun écrit, la donnée est ignorée. */
export const EFFET = { UP_STRONG: "up_strong", UP: "up", HOLD: "hold", DOWN: "down", NONE: "none" };

export const LIBELLE = {
  [VERDICT.CORRECT]: "Excellent",
  [VERDICT.PROBABLE]: "Bien",
  [VERDICT.PROCHE]: "Presque",
  [VERDICT.RETRAVAILLER]: "À réessayer",
  [VERDICT.INCERTAIN]: "Reconnaissance incertaine",
  [VERDICT.AUCUNE_PAROLE]: "Aucune parole détectée",
  [VERDICT.MICRO]: "Micro indisponible",
  [VERDICT.SERVICE]: "Service vocal indisponible",
  [VERDICT.AUTONOME]: "Compare avec le modèle"
};

/** Message affiché et dit à l'utilisateur. Aucun message culpabilisant sur une panne. */
export const MESSAGE = {
  [VERDICT.CORRECT]: "Excellent.",
  [VERDICT.PROBABLE]: "Bien. Écoute le modèle pour confirmer.",
  [VERDICT.PROCHE]: "Presque. Écoute la différence.",
  [VERDICT.RETRAVAILLER]: "On réessaie. Écoute et répète.",
  [VERDICT.INCERTAIN]: "Je n'ai pas pu vérifier. Ta progression n'est pas touchée.",
  [VERDICT.AUCUNE_PAROLE]: "Je n'ai rien entendu. Ta progression n'est pas touchée.",
  [VERDICT.MICRO]: "Le micro n'est pas disponible. Ta progression n'est pas touchée.",
  [VERDICT.SERVICE]: "Le service vocal ne répond pas. Ta progression n'est pas touchée.",
  [VERDICT.AUTONOME]: "Écoute le modèle, puis ta voix."
};

/** Seuil de validation, fonction de la longueur en caractères. */
export function seuilPour(texteNormalise) {
  const L = texteNormalise.length;
  if (L <= 4) return 0.90;   // jo, un, gutt : une lettre fausse doit suffire à refuser
  if (L <= 9) return 0.84;
  if (L <= 18) return 0.80;
  return 0.76;
}

/**
 * Compare une attente à une liste d'hypothèses de transcription.
 * @param {string} expected      forme luxembourgeoise attendue
 * @param {string[]} accepted    réponses alternatives VALIDÉES dans les données
 * @param {{text:string, confidence?:number}[]} hypotheses
 */
export function compare(expected, accepted, hypotheses) {
  const cibles = [];
  const pousser = (txt, source) => {
    const strict = normalizeStrict(txt);
    if (!strict) return;
    for (const v of apostropheVariants(strict)) {
      cibles.push({ source, strict: v, loose: normalizeLoose(v), tokens: tokenize(v) });
    }
  };
  pousser(expected, "principale");
  (accepted || []).forEach((a) => pousser(a, "alternative"));

  let meilleur = {
    score: 0, charSim: 0, looseSim: 0, wordAcc: 0,
    texte: "", cible: normalizeStrict(expected),
    exact: false, diacritiqueSeul: false, viaAlternative: false, confidence: 0
  };

  for (const h of hypotheses || []) {
    const txt = String(h?.text ?? "");
    if (!txt.trim()) continue;
    const hStrict = normalizeStrict(txt);
    const hLoose = normalizeLoose(hStrict);
    const hTokens = tokenize(hStrict);

    for (const c of cibles) {
      const exact = hStrict === c.strict;
      const charSim = exact ? 1 : charSimilarity(hStrict, c.strict);
      const looseSim = charSimilarity(hLoose, c.loose);
      const wordAcc = wordAccuracy(hTokens, c.tokens);
      // Le score combine caractère et mot. Le mot pèse plus dès 2 jetons.
      const poidsMot = c.tokens.length >= 2 ? 0.45 : 0.15;
      const score = exact ? 1 : charSim * (1 - poidsMot) + wordAcc * poidsMot;

      if (score > meilleur.score) {
        meilleur = {
          score, charSim, looseSim, wordAcc,
          texte: txt, cible: c.strict, exact,
          // La réponse ne diffère que par un accent : cas ë/e, é/e, ä/a.
          diacritiqueSeul: !exact && looseSim === 1,
          viaAlternative: c.source === "alternative",
          confidence: Number(h?.confidence || 0)
        };
      }
    }
  }
  return meilleur;
}

/**
 * Traduit un résultat technique complet en verdict pédagogique.
 * @param {object} r
 * @param {string} r.engine        "cloud" | "browser" | "echo" | "none"
 * @param {string} r.error         message d'erreur technique, vide si aucun
 * @param {string} r.errorKind     "mic" | "service" | "none"
 * @param {boolean} r.speechDetected
 * @param {number} r.speechMs      durée de parole détectée
 * @param {number} r.snrDb         rapport signal sur bruit estimé
 * @param {object} r.match         résultat de compare()
 */
export function verdictDe(r) {
  const nul = (v) => ({ verdict: v, effet: EFFET.NONE, fiable: false });

  if (r.errorKind === "mic") return nul(VERDICT.MICRO);
  if (!r.speechDetected || r.speechMs < 180) return nul(VERDICT.AUCUNE_PAROLE);

  // Mode autonome. La parole a été entendue et mesurée localement.
  // Aucun moteur ne peut confirmer les mots, donc aucun écrit
  // automatique : c'est l'auto-évaluation qui fait avancer, après
  // écoute du modèle puis de sa propre voix.
  if (r.engine === "local") return nul(VERDICT.AUTONOME);

  if (r.engine === "echo" || r.engine === "none") return nul(VERDICT.SERVICE);
  if (r.errorKind === "service" && !r.match?.texte) return nul(VERDICT.SERVICE);
  if (!r.match || !r.match.texte) return nul(VERDICT.INCERTAIN);

  const m = r.match;
  const seuil = seuilPour(m.cible);
  const signalFaible = r.snrDb < 8 || r.speechMs < 350;

  // Le navigateur ne connaît pas le luxembourgeois. Il ne peut donc
  // jamais servir à sanctionner. Il peut seulement encourager.
  if (r.engine === "browser") {
    if (m.score >= seuil) return { verdict: VERDICT.PROBABLE, effet: EFFET.UP, fiable: false };
    if (m.score >= 0.55) return { verdict: VERDICT.PROCHE, effet: EFFET.HOLD, fiable: false };
    return nul(VERDICT.INCERTAIN);
  }

  // Moteur cloud lb-LU.
  if (m.exact || m.score >= seuil) {
    return { verdict: VERDICT.CORRECT, effet: EFFET.UP_STRONG, fiable: true };
  }
  if (m.diacritiqueSeul) {
    // La réponse est juste au mot près mais l'accent diffère.
    // C'est exactement ce que le cours enseigne. On travaille, on ne punit pas.
    return { verdict: VERDICT.PROCHE, effet: EFFET.HOLD, fiable: true };
  }
  if (m.score >= 0.55) {
    return { verdict: VERDICT.PROCHE, effet: EFFET.HOLD, fiable: true };
  }
  if (signalFaible) {
    // Score bas mais conditions d'écoute mauvaises. On ne conclut pas.
    return nul(VERDICT.INCERTAIN);
  }
  return { verdict: VERDICT.RETRAVAILLER, effet: EFFET.DOWN, fiable: true };
}
