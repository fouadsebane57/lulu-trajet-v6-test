/* ===================================================================
   TENTATIVES VOCALES

   Défaut corrigé ici, et raison d'être du module.

   Jusqu'au GATE 2.5, l'enregistrement de l'utilisateur vivait dans une
   variable unique, `dernierEnregistrement`, réécrite à chaque exercice
   et lue plus tard par la restitution. Trois conséquences :

     si la capture suivante démarrait avant la relecture, l'écho
     rejouait la MAUVAISE tentative ;
     un Blob vide écrasait silencieusement un Blob valide ;
     rien ne reliait un enregistrement à l'exercice qui l'avait produit,
     donc aucun historique personnel n'était possible.

   Ici, chaque tentative est un OBJET IDENTIFIÉ. L'écho ne reçoit plus
   « le dernier blob » mais « le blob de CETTE tentative ». C'est une
   garantie de construction, pas une promesse.

   CONFIDENTIALITÉ

   Par défaut, une tentative vit en mémoire et disparaît à la fermeture
   de l'application. Rien n'est écrit sur le disque, rien ne part sur
   le réseau sauf appel explicite à un moteur de reconnaissance, et
   dans ce cas l'utilisateur en est informé par le diagnostic.

   La conservation durable exige un consentement explicite, révocable,
   et ne concerne que les tentatives que l'utilisateur épingle
   lui-même. Aucun stockage caché.
   =================================================================== */

export const ETAT = {
  CAPTUREE: "capturee",       // audio présent, exploitable
  VIDE: "vide",               // aucune parole captée
  ECHEC: "echec"              // micro ou enregistreur en défaut
};

/** Plafond mémoire. Au-delà, les plus anciennes non épinglées sortent. */
export const MAX_EN_MEMOIRE = 40;

let compteur = 0;
const registre = new Map();
let consentement = false;
let stockage = null;          // adaptateur injecté, null = pas de disque

/**
 * Identifiant de tentative. Unique dans la session, lisible dans les
 * journaux : session, exercice, rang.
 */
export function nouvelId(idSession, idExercice) {
  compteur += 1;
  const court = String(idExercice || "").replace(/[^a-z0-9]+/gi, "").slice(-10);
  return `at-${idSession || "s"}-${court || "x"}-${compteur}`;
}

/**
 * Enregistre une tentative.
 *
 * @param {object} o
 * @param {string} o.attemptId
 * @param {string} o.idSession
 * @param {string} o.idPhrase
 * @param {string} o.idExercice
 * @param {Blob|null} o.blob
 * @param {string} o.mimeType
 * @param {number} o.dureeMs
 * @param {string} o.plateforme
 */
export function enregistrer(o = {}) {
  const blob = o.blob || null;
  const octets = blob?.size || 0;
  const t = {
    attemptId: o.attemptId || nouvelId(o.idSession, o.idExercice),
    idSession: o.idSession || "",
    idPhrase: o.idPhrase || "",
    idExercice: o.idExercice || "",
    horodatage: Date.now(),
    mimeType: o.mimeType || blob?.type || "",
    octets,
    dureeMs: Math.max(0, Math.round(o.dureeMs || 0)),
    plateforme: o.plateforme || "web",
    blob,
    epinglee: false,
    etat: o.etat || (octets > 0 ? ETAT.CAPTUREE : (o.errorKind === "mic" ? ETAT.ECHEC : ETAT.VIDE)),
    // Renseigné après la reconnaissance. Jamais avant.
    transcription: "",
    provider: "",
    verdict: ""
  };
  registre.set(t.attemptId, t);
  purger();
  return t;
}

export const tentative = (attemptId) => registre.get(attemptId) || null;

/**
 * Blob EXACT d'une tentative donnée.
 * Renvoie null plutôt qu'un blob approchant. Ne se rabat jamais sur
 * une autre tentative, jamais sur une synthèse vocale.
 */
export function blobDe(attemptId) {
  const t = registre.get(attemptId);
  if (!t) return null;
  if (!t.blob || !t.blob.size) return null;
  return t.blob;
}

/** Complète une tentative avec le résultat de la reconnaissance. */
export function annoter(attemptId, { transcription, provider, verdict, fiable } = {}) {
  const t = registre.get(attemptId);
  if (!t) return null;
  if (transcription !== undefined) t.transcription = String(transcription || "");
  if (provider !== undefined) t.provider = String(provider || "");
  if (verdict !== undefined) t.verdict = String(verdict || "");
  if (fiable !== undefined) t.fiable = !!fiable;
  return t;
}

/* ---------- Consentement et conservation ---------- */

export const consentementDonne = () => consentement;

/**
 * Le consentement est explicite et révocable. Le retirer supprime
 * immédiatement tout ce qui avait été conservé.
 */
export async function definirConsentement(valeur) {
  consentement = !!valeur;
  if (!consentement) await toutSupprimer();
  return consentement;
}

export function brancherStockage(adaptateur) { stockage = adaptateur || null; }

/**
 * Épingle une tentative pour la retrouver plus tard.
 * Refuse tant que le consentement n'est pas donné. Le refus est
 * explicite, il ne se contente pas de ne rien faire.
 */
export async function epingler(attemptId) {
  const t = registre.get(attemptId);
  if (!t) return { ok: false, raison: "tentative_inconnue" };
  if (!consentement) return { ok: false, raison: "consentement_absent" };
  if (!t.blob || !t.blob.size) return { ok: false, raison: "aucun_audio" };
  t.epinglee = true;
  if (stockage?.ecrireAudio) {
    try { await stockage.ecrireAudio(t.attemptId, t.blob, meta(t)); }
    catch (e) { t.epinglee = false; return { ok: false, raison: "ecriture_impossible", detail: e?.message }; }
  }
  return { ok: true, raison: "" };
}

export async function supprimer(attemptId) {
  const t = registre.get(attemptId);
  registre.delete(attemptId);
  if (t?.epinglee && stockage?.supprimerAudio) {
    try { await stockage.supprimerAudio(attemptId); } catch (_) {}
  }
  return true;
}

/** Efface tout, mémoire comprise. Utilisé par le retrait de consentement. */
export async function toutSupprimer() {
  const ids = [...registre.keys()];
  registre.clear();
  if (stockage?.supprimerAudio) {
    for (const id of ids) { try { await stockage.supprimerAudio(id); } catch (_) {} }
  }
  if (stockage?.viderAudio) { try { await stockage.viderAudio(); } catch (_) {} }
  return ids.length;
}

/** Métadonnées seules, sans audio. Utilisables dans un journal. */
export const meta = (t) => ({
  attemptId: t.attemptId, idPhrase: t.idPhrase, idExercice: t.idExercice,
  horodatage: t.horodatage, mimeType: t.mimeType, octets: t.octets,
  dureeMs: t.dureeMs, plateforme: t.plateforme, etat: t.etat,
  epinglee: t.epinglee, verdict: t.verdict, provider: t.provider
});

/** Ce qui est actuellement conservé. L'utilisateur doit pouvoir le voir. */
export function inventaire() {
  const tout = [...registre.values()];
  return {
    enMemoire: tout.length,
    epinglees: tout.filter((t) => t.epinglee).length,
    octets: tout.reduce((s, t) => s + t.octets, 0),
    consentement,
    surDisque: !!stockage,
    liste: tout.map(meta).sort((a, b) => b.horodatage - a.horodatage)
  };
}

/** Tentatives d'une phrase, de la plus récente à la plus ancienne. */
export const historiqueDe = (idPhrase) =>
  [...registre.values()].filter((t) => t.idPhrase === idPhrase)
    .sort((a, b) => b.horodatage - a.horodatage);

function purger() {
  if (registre.size <= MAX_EN_MEMOIRE) return;
  const jetables = [...registre.values()]
    .filter((t) => !t.epinglee)
    .sort((a, b) => a.horodatage - b.horodatage);
  while (registre.size > MAX_EN_MEMOIRE && jetables.length) {
    const t = jetables.shift();
    registre.delete(t.attemptId);
  }
}

/** Remise à zéro complète. Utilisée entre deux tests. */
export function reinitialiser() {
  registre.clear();
  compteur = 0;
  consentement = false;
  stockage = null;
}
