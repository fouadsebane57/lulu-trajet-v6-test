/* ===================================================================
   CAUSES D'ÉCHEC DE LA RECONNAISSANCE

   Un « À régler » sans cause ne sert à rien. Chaque échec possible
   porte désormais un code, un message lisible et l'action exacte à
   faire. Le diagnostic affiche les trois.
   =================================================================== */

export const CAUSE = {
  OK: "ok",
  CONFIG_ABSENTE: "config_absente",
  CONFIG_INCOMPLETE: "config_incomplete",
  NON_CONNECTE: "non_connecte",
  FONCTION_INTROUVABLE: "fonction_introuvable",
  CORS: "cors",
  RESEAU: "reseau",
  AUTH: "auth",
  QUOTA: "quota",
  SERVEUR: "serveur",
  FORMAT_AUDIO: "format_audio",
  AUDIO_TROP_LONG: "audio_trop_long",
  TIMEOUT: "timeout",
  TRANSCRIPTION_VIDE: "transcription_vide",
  MOTEUR_ABSENT: "moteur_absent"
};

const FICHE = {
  [CAUSE.CONFIG_ABSENTE]: {
    titre: "Configuration absente",
    message: "Le fichier config.js n'a pas été chargé, ou il ne définit pas window.LULU_CONFIG.",
    action: "Vérifie que config.js existe bien à la racine du dépôt et qu'il n'est pas resté nommé config.example.js."
  },
  [CAUSE.CONFIG_INCOMPLETE]: {
    titre: "Configuration incomplète",
    message: "config.js est chargé mais une valeur obligatoire est vide.",
    action: "Ouvre config.js et renseigne supabaseUrl, supabaseAnonKey et functionsBaseUrl."
  },
  [CAUSE.NON_CONNECTE]: {
    titre: "Compte requis",
    message: "La reconnaissance cloud est réservée aux comptes, pour maîtriser les coûts.",
    action: "Va dans Compte et connecte-toi."
  },
  [CAUSE.FONCTION_INTROUVABLE]: {
    titre: "Fonction serveur introuvable",
    message: "L'adresse répond, mais aucune fonction speech-transcribe n'y est déployée.",
    action: "Dans Supabase, menu Edge Functions, déploie une fonction nommée exactement speech-transcribe."
  },
  [CAUSE.CORS]: {
    titre: "Requête bloquée par le navigateur",
    message: "Le serveur n'autorise pas l'adresse de l'application.",
    action: "Dans les secrets des Edge Functions, mets ALLOWED_ORIGIN à l'adresse exacte du site, ou supprime ce secret pour tout autoriser."
  },
  [CAUSE.RESEAU]: {
    titre: "Serveur injoignable",
    message: "Aucune réponse du serveur. Connexion coupée, adresse fausse, ou projet en pause.",
    action: "Vérifie ta connexion, puis l'adresse functionsBaseUrl. Vérifie aussi que le projet Supabase n'est pas en pause."
  },
  [CAUSE.AUTH]: {
    titre: "Authentification refusée",
    message: "Le serveur a refusé la session.",
    action: "Déconnecte-toi puis reconnecte-toi. Vérifie que supabaseAnonKey correspond bien à ce projet."
  },
  [CAUSE.QUOTA]: {
    titre: "Quota atteint",
    message: "Le nombre de reconnaissances autorisées est épuisé.",
    action: "Attends le mois suivant, ou passe ton compte en Premium avec supabase/admin-outils.sql."
  },
  [CAUSE.SERVEUR]: {
    titre: "Erreur du serveur vocal",
    message: "La fonction a répondu par une erreur.",
    action: "Dans Supabase, ouvre Edge Functions puis speech-transcribe, onglet Logs, et lis la dernière ligne rouge. Les secrets Google sont la cause la plus fréquente."
  },
  [CAUSE.FORMAT_AUDIO]: {
    titre: "Format audio refusé",
    message: "Le service de transcription n'a pas su décoder l'enregistrement.",
    action: "Note le format affiché dans le diagnostic et signale-le. Aucune action de ta part n'est possible."
  },
  [CAUSE.AUDIO_TROP_LONG]: {
    titre: "Enregistrement trop long",
    message: "L'extrait dépasse la limite de dix secondes.",
    action: "Réponds plus brièvement. La limite protège contre les coûts."
  },
  [CAUSE.TIMEOUT]: {
    titre: "Temps de réponse dépassé",
    message: "Le serveur n'a pas répondu dans le délai imparti.",
    action: "Réessaie. Si cela se répète, la connexion est trop lente ou la fonction met trop longtemps à démarrer."
  },
  [CAUSE.TRANSCRIPTION_VIDE]: {
    titre: "Rien n'a été compris",
    message: "Le service a répondu correctement mais n'a reconnu aucun mot.",
    action: "Réécoute ton enregistrement. S'il est audible, le moteur n'a pas reconnu la prononciation. S'il est vide, le problème vient du micro."
  },
  [CAUSE.MOTEUR_ABSENT]: {
    titre: "Aucun moteur disponible",
    message: "Ni la reconnaissance cloud ni celle du navigateur ne peuvent fonctionner ici.",
    action: "Configure la reconnaissance cloud. La reconnaissance du navigateur ne connaît pas le luxembourgeois."
  }
};

export const fiche = (cause) => FICHE[cause] || null;

export function texteCourt(cause) {
  const f = FICHE[cause];
  return f ? f.titre : "";
}

export function texteComplet(cause, detailTechnique = "") {
  const f = FICHE[cause];
  if (!f) return detailTechnique || "";
  return [f.message, f.action, detailTechnique].filter(Boolean).join(" ");
}

/**
 * Traduit une réponse HTTP en cause précise.
 * Le code HTTP seul ne suffit pas : Supabase renvoie 404 aussi bien
 * pour une fonction absente que pour une route inconnue.
 */
export function causeDeReponse(status, corps) {
  const msg = String(corps?.error || corps?.message || "").toLowerCase();
  if (status === 401 || status === 403) {
    if (msg.includes("quota")) return CAUSE.QUOTA;
    return CAUSE.AUTH;
  }
  if (status === 404) return CAUSE.FONCTION_INTROUVABLE;
  if (status === 413) return CAUSE.AUDIO_TROP_LONG;
  if (status === 429) return CAUSE.QUOTA;
  if (status === 400) return msg.includes("format") || msg.includes("audio") ? CAUSE.FORMAT_AUDIO : CAUSE.SERVEUR;
  if (status === 502 && msg.includes("format")) return CAUSE.FORMAT_AUDIO;
  if (status === 504) return CAUSE.TIMEOUT;
  if (status >= 500) return CAUSE.SERVEUR;
  return CAUSE.SERVEUR;
}

/**
 * Traduit une exception de fetch.
 * Le navigateur ne distingue pas CORS d'une panne réseau : les deux
 * donnent un TypeError « Failed to fetch ». On le dit honnêtement
 * plutôt que d'affirmer une cause au hasard.
 */
export function causeDException(err) {
  if (err?.name === "AbortError") return CAUSE.TIMEOUT;
  const m = String(err?.message || "").toLowerCase();
  if (m.includes("failed to fetch") || m.includes("load failed") || m.includes("networkerror")) return CAUSE.RESEAU;
  return CAUSE.RESEAU;
}
