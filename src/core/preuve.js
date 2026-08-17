/* ===================================================================
   MODÈLE DE PREUVES

   Principe directeur : une donnée n'est une preuve de compétence que
   si elle démontre réellement cette compétence. Tout le reste est un
   SIGNAL, stocké séparément, et ne fait monter aucune dimension.

   Ce que chaque source a le droit de faire :

     Écoute                  compte les expositions. Rien d'autre.
     Auto-évaluation         renseigne une confiance DÉCLARÉE.
                             L'apprenant peut se croire compétent et
                             se tromper. Ce n'est pas une preuve.
     Analyse locale du rythme renseigne des mesures acoustiques.
                             Un rythme ressemblant à « eent » ne
                             prouve pas que « eent » a été dit.
     Transcription fiable    seule source qui écrit dans les dimensions.

   Cas particulier de la PRONONCIATION.
   Une transcription correcte prouve la production lexicale et une
   intelligibilité suffisante pour le moteur. Elle ne prouve PAS une
   prononciation juste : un moteur reconnaît souvent le bon mot malgré
   un accent marqué ou des phonèmes approximatifs. Tant qu'aucun
   système acoustique adapté n'existe, cette dimension reste
   explicitement NON MESURÉE. On ne fabrique pas un score faux.
   =================================================================== */

export const DIM = {
  COMPREHENSION: "comprehension",   // le sens est reconnu sans le texte
  RAPPEL: "rappel",                 // la forme est retrouvée depuis le français
  PRODUCTION: "production",         // produite à voix haute, transcrite comme attendue
  FLUIDITE: "fluidite",             // produite vite, latence en baisse
  PRONONCIATION: "prononciation",   // NON MESURÉE, voir ci-dessus
  TRANSFERT: "transfert"            // réussie dans un contexte différent
};
export const DIMENSIONS = Object.values(DIM);

/**
 * Dimensions qu'un instrument fiable existe pour mesurer aujourd'hui.
 * La prononciation est délibérément à false. Aucune écriture n'y sera
 * acceptée tant que ce drapeau ne change pas.
 */
export const MESURABLE = {
  [DIM.COMPREHENSION]: true,
  [DIM.RAPPEL]: true,
  [DIM.PRODUCTION]: true,
  [DIM.FLUIDITE]: true,
  [DIM.PRONONCIATION]: false,
  [DIM.TRANSFERT]: true
};

export const ETAT_DIM = {
  MESUREE: "mesuree",
  NON_MESUREE: "non_mesuree_faute_d_instrument"
};

/**
 * Sources d'information. Une seule est probante.
 */
export const SOURCE = {
  EXPOSITION: "exposition",         // écoute passive
  AUTO_EVALUATION: "auto_evaluation",
  RYTHME_LOCAL: "rythme_local",
  TRANSCRIPTION: "transcription",   // moteur fiable, seule source probante
  AUCUNE: "aucune"                  // panne technique
};

/** Seule source autorisée à écrire dans les dimensions. */
export const SOURCES_PROBANTES = new Set([SOURCE.TRANSCRIPTION]);

export const NIVEAU_MAX = 7;
export const NIVEAU_SOLIDE = 4;
export const MINUTE = 60000;
export const JOUR = 86400000;

/**
 * Paliers de reprise, en millisecondes, à partir de l'instant présent.
 *
 * En 5.1.0 les intervalles étaient exprimés en JOURS et l'échéance
 * était calculée depuis minuit. Une phrase vue à neuf heures du matin
 * pour la première fois ne pouvait donc pas revenir avant le
 * lendemain, alors que la reprise la plus rentable est celle qui a
 * lieu quelques minutes plus tard, dans la même séance.
 *
 * Le premier palier vaut dix minutes. C'est le changement qui rend la
 * mémorisation possible en une seule séance de trajet.
 */
export const PALIERS = [10 * MINUTE, 1 * JOUR, 3 * JOUR, 7 * JOUR, 14 * JOUR, 30 * JOUR, 60 * JOUR];
export const PALIER_MAX = PALIERS.length - 1;

/** Conservé pour la lecture des états 5.1.0. N'est plus utilisé en écriture. */
export const INTERVALLES = [0, 1, 2, 4, 8, 16, 32, 64];

export const aujourdHui = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const borne = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
const entier = (n) => Math.max(0, Math.min(NIVEAU_MAX, Math.round(Number(n) || 0)));

/* ---------- Structure ---------- */

export function dimensionVide() {
  return { n: 0, reussites: 0, echecs: 0, avecIndice: 0, sansIndice: 0,
           // `premier` date la PREMIÈRE réussite. Sans lui, trois
           // réussites obtenues en une minute seraient indiscernables
           // de trois réussites étalées sur deux semaines, et une
           // phrase serait déclarée solide sans avoir jamais été
           // retrouvée après un oubli.
           premier: 0, dernier: 0, echeance: 0, dernierAttempt: "" };
}

export function signauxVides() {
  return {
    // Écoute
    nombreExpositions: 0,
    dateDerniereExposition: 0,

    // Auto-évaluation. Déclaratif, jamais une preuve.
    selfAssessment: null,        // "hard" | "ok" | "easy"
    confidenceDeclared: 0,       // 0 à 1
    dateAutoEvaluation: 0,
    nombreAutoEvaluations: 0,

    // Analyse locale du rythme. Acoustique, pas lexical.
    attemptDetected: false,
    speechDurationMs: 0,
    rhythmSimilarity: 0,         // 0 à 1
    syllabicGroups: 0,
    localAudioQuality: 0,        // 0 à 1, dérivé du rapport signal sur bruit
    dateRythme: 0,
    nombreTentatives: 0
  };
}

export function entreeVide() {
  const dims = {};
  for (const d of DIMENSIONS) dims[d] = dimensionVide();
  return {
    schema: 6,
    dims,                  // maîtrise vérifiée. Alimentée par la transcription seule.
    signaux: signauxVides(),
    latences: [],
    legacy: null           // état 5.1.0 conservé intact, jamais promu en preuve
  };
}

export function normaliser(p) {
  if (!p || typeof p !== "object") return entreeVide();

  if (p.schema === 6 && p.dims) {
    const v = entreeVide();
    for (const d of DIMENSIONS) {
      v.dims[d] = { ...v.dims[d], ...(p.dims[d] || {}) };
      v.dims[d].n = entier(v.dims[d].n);
    }
    v.signaux = { ...signauxVides(), ...(p.signaux || {}) };
    v.latences = Array.isArray(p.latences) ? p.latences.slice(-10) : [];
    v.legacy = p.legacy || null;
    return v;
  }

  // Format 5.1.0. Rangé en héritage, sans aucune promotion.
  const v = entreeVide();
  v.legacy = {
    schema: 5,
    comprehension: entier(p.comprehension ?? p.n ?? 0),
    production: entier(p.production ?? p.n ?? 0),
    pronunciation: entier(p.pronunciation ?? 0),
    seen: Math.max(0, Number(p.seen) || 0),
    errors: Math.max(0, Number(p.errors) || 0),
    lastSeen: Number(p.lastSeen) || 0,
    nextDue: Number(p.nextDue) || 0
  };
  v.signaux.nombreExpositions = v.legacy.seen;
  v.signaux.dateDerniereExposition = v.legacy.lastSeen;
  return v;
}

/* ---------- Lecture · maîtrise vérifiée ---------- */

/**
 * Niveau démontré. UNIQUEMENT les preuves du nouveau modèle.
 *
 * L'héritage n'entre PAS dans ce calcul. Il a pu être gonflé par de
 * l'écoute passive, et j'ai démontré qu'on ne peut pas distinguer
 * après coup ce qui venait d'une réussite réelle. Le reprendre comme
 * preuve prolongerait l'illusion indéfiniment.
 */
export function niveau(entree, dim) {
  const e = normaliser(entree);
  if (!MESURABLE[dim]) return 0;
  return e.dims[dim]?.n || 0;
}

/** Niveau historique, affiché séparément sous « Progression historique ». */
export function niveauHistorique(entree, dim) {
  const e = normaliser(entree);
  if (!e.legacy) return 0;
  return dim === DIM.COMPREHENSION ? e.legacy.comprehension
       : dim === DIM.RAPPEL || dim === DIM.PRODUCTION ? e.legacy.production
       : dim === DIM.PRONONCIATION ? e.legacy.pronunciation
       : 0;
}

export const aHistorique = (entree) => !!normaliser(entree).legacy;

/** Maîtrise globale : la plus faible des dimensions démontrées. */
export function niveauGlobal(entree) {
  return Math.min(niveau(entree, DIM.RAPPEL), niveau(entree, DIM.PRODUCTION));
}

export function niveauGlobalHistorique(entree) {
  return Math.min(niveauHistorique(entree, DIM.COMPREHENSION), niveauHistorique(entree, DIM.RAPPEL));
}

export const estSolide = (e) => niveauGlobal(e) >= NIVEAU_SOLIDE;
export const etaitSolideHistoriquement = (e) => niveauGlobalHistorique(e) >= 4;

export function echeance(entree) {
  const e = normaliser(entree);
  const d = DIMENSIONS.map((x) => e.dims[x].echeance).filter(Boolean);
  return d.length ? Math.min(...d) : 0;
}

export function estDu(entree, t = Date.now()) {
  if (niveauGlobal(entree) <= 0) return false;
  const ech = echeance(entree);
  return ech === 0 || ech <= t;
}

/**
 * Priorité de reprise, utilisée par l'ordonnanceur uniquement.
 *
 * C'est le seul usage de l'héritage : il ne dit pas « cette expression
 * est maîtrisée », il dit « celle-ci a déjà été travaillée, ne la
 * présente pas comme une découverte ». Cela évite de remettre les 255
 * expressions à zéro dans la file, sans transformer une donnée non
 * fiable en preuve.
 *
 * 0 = jamais vue, 1 = déjà rencontrée, 2 = travaillée de longue date.
 */
export function familiariteHistorique(entree) {
  const e = normaliser(entree);
  if (!e.legacy) return 0;
  if (etaitSolideHistoriquement(e)) return 2;
  if (e.legacy.seen > 0 || niveauGlobalHistorique(e) > 0) return 1;
  return 0;
}

/* ---------- Écriture · signaux, non probants ---------- */

/** Écoute. Écrit deux compteurs. Aucune dimension. */
export function exposer(entree) {
  const e = normaliser(entree);
  e.signaux.nombreExpositions += 1;
  e.signaux.dateDerniereExposition = Date.now();
  return e;
}

/**
 * Auto-évaluation. Confiance DÉCLARÉE, rangée à part.
 * Elle peut orienter faiblement l'ordonnanceur. Elle n'est jamais
 * une preuve de compétence et ne crée aucun niveau.
 */
export function noterAutoEvaluation(entree, valeur) {
  const e = normaliser(entree);
  const table = { hard: 0.15, ok: 0.55, easy: 0.85 };
  if (!(valeur in table)) return e;
  e.signaux.selfAssessment = valeur;
  // Moyenne mobile : une déclaration isolée ne fixe pas la confiance.
  const ancienne = e.signaux.confidenceDeclared || 0;
  e.signaux.confidenceDeclared = e.signaux.nombreAutoEvaluations
    ? borne(ancienne * 0.6 + table[valeur] * 0.4, 0, 1)
    : table[valeur];
  e.signaux.dateAutoEvaluation = Date.now();
  e.signaux.nombreAutoEvaluations += 1;
  return e;
}

/**
 * Mesures acoustiques locales. Aucune dimension n'est touchée.
 * Un rythme proche de l'attendu ne prouve pas le mot prononcé.
 */
export function noterRythme(entree, m = {}) {
  const e = normaliser(entree);
  e.signaux.attemptDetected = !!m.attemptDetected;
  e.signaux.speechDurationMs = Math.max(0, Math.round(m.speechDurationMs || 0));
  e.signaux.rhythmSimilarity = borne(m.rhythmSimilarity, 0, 1);
  e.signaux.syllabicGroups = Math.max(0, Math.round(m.syllabicGroups || 0));
  e.signaux.localAudioQuality = borne(m.localAudioQuality, 0, 1);
  e.signaux.dateRythme = Date.now();
  if (m.attemptDetected) e.signaux.nombreTentatives += 1;
  return e;
}

/* ---------- Écriture · preuves ---------- */

/**
 * Enregistre une preuve issue d'une transcription fiable.
 *
 * Refuse toute autre source, et refuse la prononciation tant qu'aucun
 * instrument adapté n'existe. Renvoie toujours l'entrée, plus une
 * raison de refus quand il y a lieu.
 *
 * @returns {{entree: object, ecrit: boolean, raison: string}}
 */
export function enregistrerPreuve(entree, p = {}) {
  const e = normaliser(entree);
  const { dim, source, reussi } = p;

  if (!DIMENSIONS.includes(dim)) return { entree: e, ecrit: false, raison: "dimension_inconnue" };
  if (!MESURABLE[dim]) return { entree: e, ecrit: false, raison: "dimension_non_mesurable" };
  if (!SOURCES_PROBANTES.has(source)) return { entree: e, ecrit: false, raison: "source_non_probante" };

  const d = e.dims[dim];
  const maintenant = Date.now();

  /* ------------------------------------------------------------------
     RÉUSSIR EN AVANCE NE FAIT PAS PROGRESSER LE PALIER

     Défaut corrigé ici. Une phrase reprise plusieurs fois dans la même
     séance enchaînait les réussites, et chaque réussite montait d'un
     palier. Cinq passages en vingt minutes suffisaient à propulser la
     phrase au palier de soixante jours. Résultat : elle ne revenait
     plus jamais, alors qu'elle n'avait jamais été retrouvée après le
     moindre oubli.

     Règle appliquée : un palier ne monte QUE si la reprise a lieu à son
     échéance ou après. Une reprise anticipée est enregistrée comme
     réussite, elle nourrit la facilité et le profil, mais elle ne
     repousse pas la prochaine échéance.

     Un ÉCHEC, lui, compte toujours, quel qu'en soit le moment :
     l'oubli est l'information la plus fiable dont nous disposions.
     ------------------------------------------------------------------ */
  const etaitDue = !d.echeance || d.echeance <= maintenant;

  d.dernier = maintenant;

  if (reussi) {
    if (!d.premier) d.premier = maintenant;
    d.reussites += 1;
    if (p.avecIndice) d.avecIndice += 1; else d.sansIndice += 1;
    // Une réussite sans indice est une meilleure preuve de rappel.
    if (etaitDue) d.n = entier(d.n + (p.avecIndice ? 1 : 2));
    if (p.latenceMs > 0) e.latences = [...e.latences, Math.round(p.latenceMs)].slice(-10);
  } else {
    d.echecs += 1;
    d.n = entier(d.n - 1);
  }

  // Échéance en temps absolu, pas en jours depuis minuit. Le palier
  // dérive du niveau atteint, borné par le nombre de paliers.
  // Une réussite anticipée laisse l'échéance existante intacte.
  if (etaitDue || !reussi) {
    const palier = Math.min(PALIER_MAX, Math.max(0, d.n - 1));
    d.echeance = maintenant + PALIERS[palier];
  }

  // Traçabilité : d'où vient cette preuve. Sert au profil vocal et au
  // diagnostic. Aucune décision pédagogique ne s'appuie dessus.
  if (p.attemptId) d.dernierAttempt = String(p.attemptId);

  return { entree: e, ecrit: true, raison: "" };
}

/** État déclaré d'une dimension, pour l'affichage. */
export function etatDimension(dim) {
  return MESURABLE[dim] ? ETAT_DIM.MESUREE : ETAT_DIM.NON_MESUREE;
}

export function latenceMediane(entree) {
  const e = normaliser(entree);
  if (!e.latences.length) return null;
  const t = e.latences.slice().sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}

/* ---------- Fusion ---------- */

export function fusionner(local, distant) {
  const a = normaliser(local), b = normaliser(distant);
  const f = entreeVide();
  for (const d of DIMENSIONS) {
    const x = a.dims[d], y = b.dims[d];
    const recent = (x.dernier || 0) >= (y.dernier || 0) ? x : y;
    f.dims[d] = {
      n: Math.max(x.n, y.n),
      reussites: Math.max(x.reussites, y.reussites),
      echecs: Math.max(x.echecs, y.echecs),
      avecIndice: Math.max(x.avecIndice, y.avecIndice),
      sansIndice: Math.max(x.sansIndice, y.sansIndice),
      premier: Math.min(x.premier || Infinity, y.premier || Infinity) === Infinity ? 0
             : Math.min(x.premier || Infinity, y.premier || Infinity),
      dernier: Math.max(x.dernier, y.dernier),
      echeance: recent.echeance || 0,
      dernierAttempt: recent.dernierAttempt || ""
    };
  }
  const sa = a.signaux, sb = b.signaux;
  // Chaque famille de signaux est arbitrée par SA propre date. Trancher
  // globalement ferait perdre une mesure récente d'une autre famille.
  const dernierAuto = (sa.dateAutoEvaluation || 0) >= (sb.dateAutoEvaluation || 0) ? sa : sb;
  const dernierRythme = (sa.dateRythme || 0) >= (sb.dateRythme || 0) ? sa : sb;
  f.signaux = {
    ...signauxVides(),
    nombreExpositions: Math.max(sa.nombreExpositions, sb.nombreExpositions),
    dateDerniereExposition: Math.max(sa.dateDerniereExposition, sb.dateDerniereExposition),
    selfAssessment: dernierAuto.selfAssessment,
    confidenceDeclared: dernierAuto.confidenceDeclared,
    dateAutoEvaluation: Math.max(sa.dateAutoEvaluation, sb.dateAutoEvaluation),
    nombreAutoEvaluations: Math.max(sa.nombreAutoEvaluations, sb.nombreAutoEvaluations),
    attemptDetected: dernierRythme.attemptDetected,
    speechDurationMs: dernierRythme.speechDurationMs,
    rhythmSimilarity: dernierRythme.rhythmSimilarity,
    syllabicGroups: dernierRythme.syllabicGroups,
    localAudioQuality: dernierRythme.localAudioQuality,
    dateRythme: Math.max(sa.dateRythme, sb.dateRythme),
    nombreTentatives: Math.max(sa.nombreTentatives, sb.nombreTentatives)
  };
  f.latences = (a.latences.length >= b.latences.length ? a.latences : b.latences).slice(-10);
  f.legacy = a.legacy && b.legacy
    ? (a.legacy.lastSeen >= b.legacy.lastSeen ? a.legacy : b.legacy)
    : (a.legacy || b.legacy);
  return f;
}
