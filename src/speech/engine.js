/* ===================================================================
   MOTEUR VOCAL

   Chaîne complète, une étape par ligne :

     micro -> contexte audio -> détection de parole -> enregistrement
        -> TENTATIVE identifiée -> fournisseur de reconnaissance
        -> comparaison -> verdict -> retour parlé -> écho -> modèle

   RÈGLE FONDATRICE DE CETTE VERSION

   Trois natures d'échec, jamais confondues, jamais présentées de la
   même façon, jamais traitées de la même façon par la progression :

     ERREUR_UTILISATEUR   un moteur PROBANT a transcrit autre chose que
                          l'attendu. C'est la seule situation où la
                          progression peut baisser.

     INCERTITUDE_MOTEUR   le moteur n'a pas su, ou n'était pas probant,
                          ou le signal était trop faible pour conclure.
                          Aucune écriture, ni dans un sens ni dans
                          l'autre. On le dit à l'utilisateur.

     PANNE_TECHNIQUE      micro refusé, réseau coupé, format rejeté,
                          service en erreur. Aucune écriture. La panne
                          est nommée, et jamais imputée à l'apprenant.

   Le défaut que cela corrige est précis : jusqu'ici, un service vocal
   indisponible et une mauvaise réponse aboutissaient tous deux à
   « on réessaie », et une transcription réussie par un moteur allemand
   pouvait faire monter une dimension.
   =================================================================== */

import { compare, verdictDe, VERDICT, EFFET, MESSAGE, LIBELLE } from "./score.js";
import { CAUSE, texteComplet } from "./erreurs.js";
import * as Providers from "./provider.js";
import * as Prononciation from "./prononciation.js";
import * as Tentatives from "../audio/tentative.js";
import { analyser as analyserRythme, phrase as phraseRythme, detail as detailRythme } from "../audio/rythme.js";

/** Nature de ce qui s'est passé. Trois valeurs, jamais mélangées. */
export const NATURE = {
  REUSSITE: "reussite",
  ERREUR_UTILISATEUR: "erreur_utilisateur",
  INCERTITUDE_MOTEUR: "incertitude_moteur",
  PANNE_TECHNIQUE: "panne_technique"
};

export const MESSAGE_NATURE = {
  [NATURE.REUSSITE]: "",
  [NATURE.ERREUR_UTILISATEUR]: "Ce n'est pas encore la bonne forme. Écoute et réessaie.",
  [NATURE.INCERTITUDE_MOTEUR]: "Je n'ai pas pu vérifier tes mots. Ta progression n'est pas touchée.",
  [NATURE.PANNE_TECHNIQUE]: "Problème technique de mon côté. Ta progression n'est pas touchée."
};

/** Causes techniques. Leur présence interdit toute écriture. */
const CAUSES_TECHNIQUES = new Set([
  CAUSE.CONFIG_ABSENTE, CAUSE.CONFIG_INCOMPLETE, CAUSE.NON_CONNECTE,
  CAUSE.FONCTION_INTROUVABLE, CAUSE.CORS, CAUSE.RESEAU, CAUSE.AUTH,
  CAUSE.QUOTA, CAUSE.SERVEUR, CAUSE.FORMAT_AUDIO, CAUSE.AUDIO_TROP_LONG,
  CAUSE.TIMEOUT, CAUSE.MOTEUR_ABSENT
]);

/**
 * Évalue une réponse orale.
 *
 * La capture n'est PAS faite ici. Elle est déléguée à l'orchestrateur
 * audio via `opt.capturer`, ce qui garantit que la machine à états
 * traverse réellement ÉCOUTE, ENREGISTREMENT puis TRAITEMENT, et que
 * Pause peut interrompre à tout moment.
 *
 * @param {object} phrase   phrase de contenu
 * @param {object} opt
 * @param {function} opt.capturer     obligatoire
 * @param {string}   opt.idSession
 * @param {string}   opt.idExercice
 * @param {string}   opt.prefere      identifiant de fournisseur, ou "auto"
 * @param {boolean}  opt.enLigne
 */
export async function evaluerReponse(phrase, opt = {}) {
  const t0 = Date.now();
  const trace = [];
  const marque = (etape, detail) => trace.push({ etape, ms: Date.now() - t0, ...detail });

  if (typeof opt.capturer !== "function") {
    // Refus explicite. Contourner l'orchestrateur audio ferait perdre
    // la garantie de fermeture du micro.
    return finaliser({
      nature: NATURE.PANNE_TECHNIQUE, cause: CAUSE.MOTEUR_ABSENT,
      error: "Aucune source de capture fournie.",
      attemptId: "", tentative: null, phrase, trace
    });
  }

  /* 1. Capture -------------------------------------------------- */
  const capture = await opt.capturer({
    profil: opt.profil || "calme",
    attenteMaxMs: opt.attenteMaxMs,
    paroleMaxMs: opt.paroleMaxMs,
    onNiveau: opt.onNiveau,
    annule: opt.annule
  });
  marque("capture", {
    mime: capture.mimeType, octets: capture.octets,
    parole: capture.vad?.speechDetected, paroleMs: capture.vad?.speechMs,
    snrDb: Math.round(capture.vad?.snrDb ?? 0)
  });

  /* 2. Tentative identifiée ------------------------------------- */
  // Le Blob est rangé sous un identifiant AVANT toute autre opération.
  // C'est ce qui garantit que l'écho rejouera CETTE tentative.
  const attemptId = Tentatives.nouvelId(opt.idSession, opt.idExercice);
  const tentative = Tentatives.enregistrer({
    attemptId,
    idSession: opt.idSession || "",
    idPhrase: phrase.id,
    idExercice: opt.idExercice || "",
    blob: capture.blob || null,
    mimeType: capture.mimeType || "",
    dureeMs: capture.vad?.speechMs || 0,
    plateforme: opt.plateforme || "web",
    errorKind: capture.errorKind
  });
  marque("tentative", { attemptId, etat: tentative.etat, octets: tentative.octets });

  const base = {
    phrase, attemptId, tentative, trace,
    speechDetected: !!capture.vad?.speechDetected,
    speechMs: capture.vad?.speechMs || 0,
    snrDb: capture.vad?.snrDb || 0,
    mimeType: capture.mimeType || "",
    vad: capture.vad || null,
    transcripts: [], match: null,
    providerId: "", providerNom: "", probant: false, reserve: "",
    cause: CAUSE.OK, error: "", detail: ""
  };

  // Micro en défaut : panne technique, pas une erreur de l'apprenant.
  if (capture.errorKind === "mic") {
    return finaliser({ ...base, nature: NATURE.PANNE_TECHNIQUE,
      cause: CAUSE.MOTEUR_ABSENT, error: capture.error || "Micro indisponible." });
  }

  // Rien entendu. Ce n'est ni une faute ni une panne : on ne conclut pas.
  if (!base.speechDetected) {
    return finaliser({ ...base, nature: NATURE.INCERTITUDE_MOTEUR,
      cause: CAUSE.TRANSCRIPTION_VIDE,
      error: capture.vad?.detail || "Aucune parole détectée." });
  }

  /* 3. Reconnaissance ------------------------------------------- */
  const { provider, etat, essais } = await Providers.choisir({
    prefere: opt.prefere || "auto",
    enLigne: opt.enLigne !== false
  });
  marque("fournisseur", { retenu: provider?.id || "", ok: !!etat?.ok, essais: essais?.length || 0 });

  if (!provider || !etat.ok) {
    const r = { ...base, nature: NATURE.PANNE_TECHNIQUE,
      cause: etat?.cause || CAUSE.MOTEUR_ABSENT,
      error: etat?.resume || "Aucun moteur de reconnaissance disponible." };
    return finaliser(await avecRythme(r, capture, phrase, marque));
  }

  base.providerId = provider.id;
  base.providerNom = provider.nom;
  base.probant = !!provider.probant;
  base.reserve = provider.reserve || "";

  // Le mode sans reconnaissance est un mode à part entière, pas un
  // échec. La séance continue, l'écho et le modèle font le travail.
  if (provider.id === "aucun") {
    const r = { ...base, nature: NATURE.INCERTITUDE_MOTEUR, cause: CAUSE.OK, error: "" };
    return finaliser(await avecRythme(r, capture, phrase, marque));
  }

  const stt = await provider.transcrire({
    blob: capture.blob, mimeType: capture.mimeType,
    attendu: phrase.lb, acceptees: phrase.alt || [],
    contexte: opt.contexte || [],
    dureeMaxMs: Math.min(6000, opt.paroleMaxMs || 6000)
  });
  marque("transcription", { provider: stt.providerId, cause: stt.cause, n: stt.transcripts.length, latenceMs: stt.latencyMs });

  base.cause = stt.cause;
  base.error = stt.error || "";
  base.detail = texteComplet(stt.cause, stt.error);
  base.latencyMs = stt.latencyMs || 0;
  base.model = stt.model || "";
  base.lang = stt.lang || "";
  base.ipa = stt.ipa || "";

  if (!stt.transcripts.length) {
    // Distinguer une panne d'un silence. Une transcription vide sur un
    // signal correct n'est pas la même chose qu'un serveur injoignable.
    const nature = CAUSES_TECHNIQUES.has(stt.cause) && stt.cause !== CAUSE.MOTEUR_ABSENT
      ? NATURE.PANNE_TECHNIQUE
      : (stt.cause === CAUSE.TRANSCRIPTION_VIDE ? NATURE.INCERTITUDE_MOTEUR : NATURE.PANNE_TECHNIQUE);
    const r = { ...base, nature };
    return finaliser(await avecRythme(r, capture, phrase, marque));
  }

  /* 4. Comparaison ---------------------------------------------- */
  base.transcripts = stt.transcripts;
  base.match = compare(phrase.lb, phrase.alt || [], stt.transcripts);
  marque("comparaison", {
    entendu: base.match.texte, cible: base.match.cible,
    score: Number(base.match.score.toFixed(3)), exact: base.match.exact
  });

  Tentatives.annoter(attemptId, {
    transcription: base.match.texte, provider: provider.id
  });

  /* 5. Verdict --------------------------------------------------- */
  const v = verdictDe({
    engine: provider.probant ? "cloud" : "browser",
    errorKind: "none",
    speechDetected: base.speechDetected,
    speechMs: base.speechMs,
    snrDb: base.snrDb,
    match: base.match
  });

  let nature;
  if (v.effet === EFFET.NONE) nature = NATURE.INCERTITUDE_MOTEUR;
  else if (v.effet === EFFET.DOWN) nature = NATURE.ERREUR_UTILISATEUR;
  else if (v.verdict === VERDICT.CORRECT) nature = NATURE.REUSSITE;
  else nature = NATURE.INCERTITUDE_MOTEUR;

  // Verrou d'architecture. Un moteur non probant ne peut jamais
  // produire une erreur imputée à l'utilisateur, ni une écriture.
  if (!provider.probant) {
    if (nature === NATURE.ERREUR_UTILISATEUR) nature = NATURE.INCERTITUDE_MOTEUR;
    v.fiable = false;
  }

  const r = { ...base, nature, verdict: v.verdict, effet: v.effet, fiable: !!v.fiable && !!provider.probant };
  Tentatives.annoter(attemptId, { verdict: v.verdict, fiable: r.fiable });
  return finaliser(await avecRythme(r, capture, phrase, marque));
}

/**
 * Ajoute l'analyse locale du rythme.
 *
 * Elle n'est calculée que lorsqu'aucune transcription n'est
 * disponible : afficher les deux en même temps a déjà été une source
 * de confusion, l'utilisateur lisant « 1 groupe de son sur 1 attendu »
 * comme si le mot avait été reconnu.
 */
async function avecRythme(r, capture, phrase, marque) {
  if (r.transcripts.length) return r;
  if (!capture.vad?.mesureFiable) return r;
  r.rythme = analyserRythme({
    enveloppe: capture.vad.enveloppe,
    seuilDb: capture.vad.seuilDb,
    dureeMs: capture.vad.speechMs,
    fiable: capture.vad.mesureFiable
  }, phrase.syl ?? null);
  r.messageRythme = phraseRythme(r.rythme);
  r.detailRythme = detailRythme(r.rythme);
  marque?.("rythme_local", { verdict: r.rythme.verdict, noyaux: r.rythme.noyaux, attendu: r.rythme.attendu });
  return r;
}

function finaliser(r) {
  r.verdict = r.verdict || verdictParDefaut(r.nature);
  r.effet = r.effet ?? (r.nature === NATURE.REUSSITE ? EFFET.UP_STRONG
    : r.nature === NATURE.ERREUR_UTILISATEUR ? EFFET.DOWN : EFFET.NONE);
  r.fiable = !!r.fiable;
  r.correct = r.nature === NATURE.REUSSITE;

  // Message affiché ET dit. Une panne n'est jamais formulée comme une
  // faute de l'apprenant.
  r.message = r.nature === NATURE.REUSSITE
    ? MESSAGE[VERDICT.CORRECT]
    : (r.nature === NATURE.ERREUR_UTILISATEUR
        ? (MESSAGE[r.verdict] || MESSAGE_NATURE[r.nature])
        : MESSAGE_NATURE[r.nature]);
  r.libelle = LIBELLE[r.verdict] || "";

  // Aucune écriture pédagogique n'est possible sans preuve probante.
  r.ecrivable = r.fiable && (r.nature === NATURE.REUSSITE || r.nature === NATURE.ERREUR_UTILISATEUR);

  // Rappel systématique : la prononciation n'est pas mesurée.
  r.prononciation = { disponible: false, message: Prononciation.MESSAGE_INDISPONIBLE };

  r.totalMs = r.trace?.length ? r.trace[r.trace.length - 1].ms : 0;
  return r;
}

const verdictParDefaut = (nature) => ({
  [NATURE.REUSSITE]: VERDICT.CORRECT,
  [NATURE.ERREUR_UTILISATEUR]: VERDICT.RETRAVAILLER,
  [NATURE.INCERTITUDE_MOTEUR]: VERDICT.INCERTAIN,
  [NATURE.PANNE_TECHNIQUE]: VERDICT.SERVICE
}[nature] || VERDICT.INCERTAIN);

export { VERDICT, EFFET, CAUSE, LIBELLE, MESSAGE };
