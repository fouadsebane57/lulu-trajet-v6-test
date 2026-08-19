/* ===================================================================
   TESTS P0 ISOLÉS

   Deux tests, un seul objectif chacun, aucune interférence.

   Test 1 : BLOB IPHONE -> HAUT-PARLEUR IPHONE.
   Test 2 : SYNTHÈSE -> HAUT-PARLEUR.

   Pendant ces tests, il est interdit de démarrer ou de poursuivre une
   séance, de lancer un exercice, une reconnaissance, une écriture de
   progression, ou une autre voix. Le module n'importe d'ailleurs
   aucun de ces éléments : la contrainte est structurelle, pas
   déclarative, et un test d'architecture le vérifie.

   Chaque test rend un rapport COMPLET. L'objectif n'est pas de dire
   « ça marche » ou « ça ne marche pas », mais de dire OÙ le son
   s'arrête, avec les valeurs brutes que Safari expose.
   =================================================================== */

import * as Micro from "./mic.js";
import { capturer } from "./recorder.js";
import * as Coord from "./coordinateur.js";
import * as Tts from "./tts.js";
import * as Tentatives from "./tentative.js";
import { choisir as choisirFormat } from "./formats.js";

/* ===================================================================
   TEST 1 · MON ENREGISTREMENT
   =================================================================== */

/**
 * Étape 1 : enregistrer, puis TOUT fermer. Aucune lecture.
 *
 * La séparation en deux étapes est délibérée. La lecture automatique
 * juste après une capture est exactement la situation où iOS refuse le
 * son. En séparant, on sait lequel des deux échoue.
 */
export async function enregistrerSeulement({ dureeMs = 3000, onEtape } = {}) {
  const etapes = [];
  const noter = (nom, detail = {}) => { const e = { nom, ...detail }; etapes.push(e); onEtape?.(e); return e; };

  const format = choisirFormat();
  noter("format", { mime: format.mime, note: format.note, relisible: format.relisible });

  let capture;
  try {
    capture = await capturer({ profil: "calme", attenteMaxMs: 2500, paroleMaxMs: dureeMs });
  } catch (e) {
    noter("capture_exception", { message: e?.message });
    return { ok: false, etapes, tentative: null, message: e?.message || "Capture impossible." };
  }

  noter("capture", {
    parole: !!capture.vad?.speechDetected,
    paroleMs: capture.vad?.speechMs || 0,
    octets: capture.octets || 0,
    mime: capture.mimeType || "",
    erreur: capture.error || ""
  });

  // Fermeture TOTALE : pistes ET contexte audio. C'est ce qui rend la
  // sortie au haut-parleur sur iOS.
  const rendu = await Micro.rendreAudioAuSysteme();
  noter("audio_rendu", rendu);

  if (!capture.blob || !capture.blob.size) {
    return { ok: false, etapes, tentative: null,
             message: capture.error || "Aucun audio n'a été capté." };
  }

  const t = Tentatives.enregistrer({
    idSession: "p0", idExercice: "p0-enregistrement", idPhrase: "p0",
    blob: capture.blob, mimeType: capture.mimeType, dureeMs: capture.vad?.speechMs || 0
  });
  noter("tentative", { attemptId: t.attemptId, octets: t.octets, mime: t.mimeType });

  return {
    ok: true,
    etapes,
    tentative: {
      attemptId: t.attemptId,
      mime: t.mimeType,
      octets: t.octets,
      dureeMs: t.dureeMs,
      etat: t.etat
    },
    message: ""
  };
}

/**
 * Étape 2 : lire l'enregistrement.
 *
 * APPELER CETTE FONCTION DIRECTEMENT DEPUIS LE CLIC, sans `await`
 * avant. Elle amorce `play()` immédiatement. Toute opération
 * intercalée ferait perdre l'autorisation sur iOS.
 *
 * @returns {Promise<object>} rapport détaillé
 */
export function lireEnregistrement(attemptId) {
  const blob = Tentatives.blobDe(attemptId);
  if (!blob) {
    return Promise.resolve({
      ok: false, blobPresent: false,
      message: "Aucun enregistrement sous cet identifiant."
    });
  }

  // Déverrouillage puis lecture, tous deux dans le geste.
  const dev = Coord.deverrouiller();

  return Coord.jouerBlob(blob).then(async (r) => {
    const deverrouillage = await Coord.confirmerDeverrouillage(dev);
    return {
      ok: r.demarree && r.terminee,
      blobPresent: true,
      attemptId,
      mime: blob.type || "",
      octets: blob.size,
      deverrouillage: deverrouillage.etat,
      objectUrl: "créée",
      playAppele: true,
      // Une promesse de play() tenue signifie AUTORISÉE, pas ENTENDUE.
      playAutorisee: r.autorise,
      demarree: r.demarree,
      terminee: r.terminee,
      etat: r.etat,
      dureeMs: r.dureeMs,
      dureeMedia: r.dureeMedia,
      readyState: r.readyState,
      networkState: r.networkState,
      codeErreur: r.codeErreur,
      volume: r.volume,
      muted: r.muted,
      evenements: r.trace.map((t) => t.nom),
      message: r.message
    };
  });
}

/* ===================================================================
   TEST 2 · LA VOIX DU MODÈLE
   =================================================================== */

/**
 * Fait dire une phrase courte et rend compte de ce que la synthèse a
 * réellement fait.
 *
 * À APPELER DIRECTEMENT DEPUIS LE CLIC.
 * Sans `onstart`, le résultat est un échec, jamais une réussite.
 */
export function testerVoixModele(texte = "Moien") {
  Coord.deverrouiller();
  const voix = Tts.voixActuelles();

  return Tts.dire(texte, "lb", 1).then((r) => ({
    ok: !!r.demarree,
    texte,
    disponible: Tts.dispo(),
    qualite: Tts.qualiteVoix(),
    voix: r.voix || voix.lb?.name || "",
    locale: voix.lb?.lang || "",
    demande: r.demande,
    onstart: r.demarree,
    onend: r.terminee,
    onerror: r.erreur,
    cause: r.cause,
    dureeMs: r.dureeMs,
    message: r.demarree
      ? ""
      : "La synthèse n'a jamais démarré. Aucun son n'a été produit."
  }));
}

/** État du déverrouillage, pour affichage. */
export const etatSon = () => ({
  ...Coord.etatDeverrouillage(),
  elementPersistant: Coord.elementExiste(),
  proprietaire: Coord.proprietaire(),
  contexteAudio: Micro.etatContexte(),
  microOuvert: Micro.fluxOuvert()
});

export const journal = () => Coord.journalAudio();
