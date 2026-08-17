/* ===================================================================
   ENREGISTREMENT

   L'enregistrement démarre immédiatement et s'arrête quand la détection
   de parole conclut. La durée est bornée en dur : garde-fou contre les
   coûts cloud et contre un micro resté ouvert.

   Formats réels observés :
     Chrome Android  audio/webm;codecs=opus
     Safari iOS      audio/mp4  (AAC)
   Les deux sont acceptés par Google STT V2 avec AutoDetectDecodingConfig.
   Le type MIME retenu est transmis au serveur et affiché au diagnostic.
   =================================================================== */

import { ouvrir, infosFlux, reveiller, liberer } from "./mic.js";
import { ecouter } from "./vad.js";
import { choisir, inventaire } from "./formats.js";
import { jouer } from "./lecture.js";

export const DUREE_MAX_MS = 10000;   // plafond absolu envoyé au cloud
export const TAILLE_MAX_OCTETS = 900 * 1024;


/** Format retenu, choisi pour être à la fois enregistrable ET relisible. */
export function formatRetenu() { return choisir(); }
export function mimeDisponible() { return choisir().mime; }
export function formatsDisponibles() { return inventaire(); }

export function supporte() {
  return typeof MediaRecorder !== "undefined" && choisir().mime !== null;
}

/**
 * Capture une réponse orale.
 * Renvoie toujours un objet, jamais d'exception non typée.
 */
/**
 * Capture une réponse orale.
 *
 * GARANTIE : aucun chemin de sortie ne laisse un MediaStreamTrack actif.
 * Le micro est ouvert, puis tout le travail est placé sous try, et la
 * libération est dans finally. Une exception de MediaRecorder, du VAD
 * ou de n'importe quelle étape ne peut plus laisser le micro allumé.
 *
 * `opt.garderMicroOuvert` est la seule dérogation, explicite.
 */
export async function capturer(opt = {}) {
  const t0 = performance.now();
  const format = choisir();
  let flux = null;
  let micro = null;

  const sortie = (extra) => ({
    ok: false, errorKind: "mic", error: "", blob: null, vad: null,
    mimeType: format.mime || "", octets: 0,
    dureeMs: Math.round(performance.now() - t0),
    micro, format, relisible: format.relisible, ...extra
  });

  try {
    flux = await ouvrir();
  } catch (err) {
    // Rien n'a été ouvert : rien à libérer.
    return sortie({ error: err.message });
  }

  try {
    // Le contexte audio doit tourner AVANT toute mesure. Sans cette
    // attente, iOS renvoie du silence et la détection part en vrille.
    await reveiller();
    micro = infosFlux();

    if (!supporte()) {
      return sortie({ error: "L'enregistrement audio n'est pas supporté par ce navigateur." });
    }

    let rec;
    try {
      rec = new MediaRecorder(flux, format.mime ? { mimeType: format.mime, audioBitsPerSecond: 32000 } : undefined);
    } catch (err) {
      return sortie({ error: "Enregistreur audio indisponible : " + err.message });
    }

    const morceaux = [];
    let stoppe = false;

    const finEnregistrement = new Promise((resolve) => {
      rec.ondataavailable = (e) => { if (e.data?.size) morceaux.push(e.data); };
      rec.onstop = () => resolve();
      rec.onerror = () => resolve();
    });

    const arreter = () => {
      if (stoppe) return;
      stoppe = true;
      try { if (rec.state !== "inactive") rec.stop(); } catch (_) {}
    };

    let gardeFou;
    let vad;
    try {
      rec.start(250);
      gardeFou = setTimeout(arreter, DUREE_MAX_MS + 1500);
      vad = await ecouter(flux, {
        profil: opt.profil || "calme",
        attenteMaxMs: opt.attenteMaxMs ?? 4500,
        paroleMaxMs: Math.min(opt.paroleMaxMs ?? 9000, DUREE_MAX_MS),
        onNiveau: opt.onNiveau,
        annule: opt.annule
      });
    } catch (err) {
      return sortie({ errorKind: "service", error: "Analyse du signal interrompue : " + err.message });
    } finally {
      // L'enregistreur est arrêté même si la détection a échoué.
      clearTimeout(gardeFou);
      arreter();
      await finEnregistrement;
    }

    const blob = morceaux.length ? new Blob(morceaux, { type: rec.mimeType || format.mime || "audio/webm" }) : null;
    const trop = blob && blob.size > TAILLE_MAX_OCTETS;

    return {
      ok: !!blob && !trop && vad.speechDetected,
      errorKind: trop ? "service" : "none",
      error: trop ? "Enregistrement trop volumineux, il n'a pas été envoyé." : (vad.detail || ""),
      blob: trop ? null : blob,
      mimeType: rec.mimeType || format.mime || "",
      octets: blob?.size || 0,
      dureeMs: Math.round(performance.now() - t0),
      micro, format,
      // Si le navigateur enregistre un format qu'il ne sait pas relire,
      // on le sait AVANT que l'utilisateur constate un silence.
      relisible: format.relisible,
      vad
    };
  } finally {
    // GARANTIE, tous chemins confondus : le micro est refermé.
    if (!opt.garderMicroOuvert) await liberer();
  }
}

export function blobEnBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
    fr.onerror = () => reject(new Error("Lecture de l'enregistrement impossible."));
    fr.readAsDataURL(blob);
  });
}

/**
 * Conservé pour compatibilité, mais délègue désormais à lecture.js,
 * qui distingue réellement un succès d'un échec.
 * Renvoie un résultat, ne renvoie plus rien en silence.
 */
export function lireBlob(blob, opt) { return jouer(blob, opt); }
