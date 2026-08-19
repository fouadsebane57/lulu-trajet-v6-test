/* ===================================================================
   MICRO

   CORRECTIF 5.1.0, cause racine de l'échec observé sur iPhone.

   Sur iOS, un AudioContext naît suspendu. La v5.0.0 appelait resume()
   sans attendre le résultat. L'analyseur lisait donc du zéro pendant
   les premières centaines de millisecondes, la mesure descendait vers
   moins l'infini, le plancher adaptatif de la détection de parole
   s'effondrait à moins 587 décibels, et tout dépassait le seuil.
   La détection annonçait de la parole sur du silence.

   Trois verrous ajoutés :
     le contexte est réveillé et ATTENDU avant toute mesure,
     la mesure est bornée à moins 100 décibels, plancher du numérique,
     une mesure jugée impossible est signalée, jamais utilisée.
   =================================================================== */

import * as SessionIOS from "./session-ios.js";

export const DB_MIN = -100;            // plancher numérique, jamais dépassé
export const DB_PAROLE_MINIMALE = -55; // sous ce pic, il n'y a pas de voix

let stream = null;
let audioCtx = null;
let deviceId = "";
let dernierEchec = "";

export const CONTRAINTES = {
  echoCancellation: true,   // la voix de synthèse sort du même appareil
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1
};

export const supporte = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
export const dernierProbleme = () => dernierEchec;

export async function etatPermission() {
  if (!navigator.permissions?.query) return "unknown";
  try { return (await navigator.permissions.query({ name: "microphone" })).state; }
  catch (_) { return "unknown"; }
}

export async function ouvrir(prefereId = deviceId) {
  if (!supporte()) throw typer("Ce navigateur ne donne pas accès au micro.", "mic");
  if (stream && stream.active && (!prefereId || prefereId === deviceId)) return stream;
  fermer();

  // iOS : getUserMedia bascule la session système en capture. On
  // annonce explicitement le mode play-and-record avant ET après
  // l'ouverture afin de stabiliser la route pendant l'enregistrement.
  SessionIOS.preparerCapture();

  const audio = { ...CONTRAINTES };
  if (prefereId) audio.deviceId = { ideal: prefereId };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio });
    // WebKit peut réécrire sa catégorie pendant la résolution de
    // getUserMedia. On la réaffirme une fois la capture réellement active.
    SessionIOS.preparerCapture();
  } catch (err) {
    dernierEchec = messageErreurMicro(err);
    throw typer(dernierEchec, "mic", err);
  }
  deviceId = stream.getAudioTracks()[0]?.getSettings?.().deviceId || prefereId || "";
  dernierEchec = "";
  return stream;
}

function typer(message, kind, cause) {
  const e = new Error(message); e.kind = kind; if (cause) e.cause = cause; return e;
}

function messageErreurMicro(err) {
  const n = err?.name || "";
  if (n === "NotAllowedError" || n === "SecurityError")
    return "Autorisation micro refusée. Réactive-la dans les réglages du navigateur.";
  if (n === "NotFoundError") return "Aucun microphone détecté sur cet appareil.";
  if (n === "NotReadableError") return "Le micro est utilisé par une autre application.";
  if (n === "OverconstrainedError") return "Le micro sélectionné n'est plus disponible.";
  return err?.message || "Micro indisponible.";
}

export function fermer() {
  try { stream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
  stream = null;
}

/**
 * Libère complètement le micro et laisse le système reprendre la main.
 * Nécessaire avant la reconnaissance du navigateur : sur iOS, elle ne
 * peut pas ouvrir le micro tant qu'un flux le retient.
 */
export async function liberer() {
  fermer();
  await new Promise((r) => setTimeout(r, 120));
}

export async function listerAppareils() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput")
            .map((d) => ({ id: d.deviceId, label: d.label || "Micro sans nom" }));
}

export function choisirAppareil(id) { deviceId = id || ""; fermer(); }
export const appareilActuel = () => deviceId;
export const fluxOuvert = () => !!(stream && stream.active);

export function infosFlux() {
  const t = stream?.getAudioTracks?.()[0];
  if (!t) return null;
  const s = t.getSettings?.() || {};
  const label = (t.label || "").toLowerCase();
  const bluetooth = /bluetooth|hands-?free|hfp|headset|mains libres|casque/.test(label);
  return {
    label: t.label || "Micro par défaut",
    deviceId: s.deviceId || "",
    sampleRate: s.sampleRate || 0,
    channelCount: s.channelCount || 0,
    echoCancellation: s.echoCancellation,
    noiseSuppression: s.noiseSuppression,
    autoGainControl: s.autoGainControl,
    bluetooth,
    // Un profil mains libres Bluetooth descend souvent à 8 ou 16 kHz.
    // La transcription se dégrade nettement. On signale sans bloquer.
    qualiteReduite: bluetooth || (s.sampleRate > 0 && s.sampleRate <= 16000)
  };
}

/* ---------- Contexte audio ---------- */

export function contexteBrut() {
  if (!audioCtx || audioCtx.state === "closed") {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    audioCtx = new C();
  }
  return audioCtx;
}

/**
 * Réveille le contexte et ATTEND qu'il tourne réellement.
 * C'est le correctif central de la 5.1.0.
 * @returns {Promise<boolean>} true si le contexte est en fonctionnement
 */
export async function reveiller(delaiMaxMs = 1500) {
  const ctx = contexteBrut();
  if (!ctx) return false;
  if (ctx.state === "running") return true;
  try { await ctx.resume(); } catch (_) {}
  const fin = Date.now() + delaiMaxMs;
  while (ctx.state !== "running" && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 40));
  }
  return ctx.state === "running";
}

export const contexteActif = () => audioCtx?.state === "running";
export const etatContexte = () => audioCtx?.state || "absent";

/**
 * Ferme le contexte audio et rend les ressources système.
 *
 * CORRECTIF ISSU DU TEST SUR IPHONE RÉEL.
 *
 * Arrêter les pistes du flux ne suffit pas. Tant que l'AudioContext
 * vit, iOS considère que la capture est en cours : la sortie reste
 * routée vers l'écouteur interne au lieu du haut-parleur, et plus rien
 * n'est audible pour quelqu'un qui ne colle pas le téléphone à son
 * oreille. Apple documente ce routage après un appel à getUserMedia,
 * sans exposer de sélection de sortie ; WebKit indique de son côté que
 * seule la fermeture du contexte rend les ressources audio.
 *
 * Le contexte est donc fermé après CHAQUE capture, et recréé au
 * besoin par contexteBrut().
 */
export async function fermerContexte() {
  if (!audioCtx) return "absent";
  const avant = audioCtx.state;
  try { await audioCtx.close(); } catch (_) {}
  audioCtx = null;
  return avant;
}

/**
 * Libération TOTALE : pistes, puis contexte.
 * À utiliser avant toute lecture, jamais pendant une capture.
 */
export async function rendreAudioAuSysteme() {
  fermer();
  const avant = await fermerContexte();

  // Correctif iPhone réel, deuxième niveau : arrêter les pistes et
  // fermer l'AudioContext ne suffit pas toujours à faire revenir la
  // sortie vers le haut-parleur. WebKit expose navigator.audioSession
  // sur les iPhone récents : on force la catégorie de LECTURE après
  // chaque capture. Cela corrige également le cas où l'interrupteur
  // silencieux coupe la sortie WebAudio.
  const session1 = SessionIOS.preparerLecture();
  await new Promise((r) => setTimeout(r, 220));
  // Réaffirmer après le délai car WebKit peut modifier la catégorie
  // pendant la destruction effective du périphérique de capture.
  const session2 = SessionIOS.preparerLecture();
  return {
    contexteAvant: avant,
    fluxOuvert: fluxOuvert(),
    audioSessionSupportee: session2.supporte,
    audioSessionType: session2.type,
    audioSessionEtat: session2.etat,
    audioSessionErreur: session2.erreur || session1.erreur || ""
  };
}

/**
 * Analyseur de niveau, en dBFS, borné.
 * 0 dB est le maximum numérique, -100 dB le silence.
 * Aucune valeur hors de cet intervalle ne peut sortir d'ici.
 */
export function analyseur(fluxCible = stream) {
  const ctx = contexteBrut();
  if (!ctx || !fluxCible) return null;
  let source, node;
  try {
    source = ctx.createMediaStreamSource(fluxCible);
    node = ctx.createAnalyser();
  } catch (_) { return null; }
  node.fftSize = 1024;
  node.smoothingTimeConstant = 0.2;
  source.connect(node);
  const buf = new Float32Array(node.fftSize);

  return {
    /** Niveau instantané, garanti entre DB_MIN et 0. */
    rmsDb() {
      if (ctx.state !== "running") return DB_MIN;   // contexte endormi : silence franc
      node.getFloatTimeDomainData(buf);
      let somme = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        if (Number.isFinite(v)) somme += v * v;
      }
      const rms = Math.sqrt(somme / buf.length);
      if (!(rms > 0)) return DB_MIN;
      const db = 20 * Math.log10(rms);
      // Borne dure. Sans elle, le plancher adaptatif part à moins l'infini.
      return Math.max(DB_MIN, Math.min(0, db));
    },
    actif: () => ctx.state === "running",
    detruire() { try { source.disconnect(); node.disconnect(); } catch (_) {} }
  };
}

/**
 * Mesure du niveau pendant N millisecondes.
 * Renvoie `fiable: false` si le contexte audio ne tournait pas :
 * la valeur ne doit alors alimenter aucune décision.
 */
export async function mesurerNiveau(ms = 1200) {
  await ouvrir();
  const running = await reveiller();
  const a = analyseur();
  if (!a) return { moyenDb: DB_MIN, picDb: DB_MIN, ok: false, fiable: false, raison: "analyseur_indisponible" };
  if (!running) { a.detruire(); return { moyenDb: DB_MIN, picDb: DB_MIN, ok: false, fiable: false, raison: "contexte_endormi" }; }

  let pic = DB_MIN, somme = 0, n = 0;
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const db = a.rmsDb();
    if (db > pic) pic = db;
    somme += db; n++;
    await new Promise((r) => setTimeout(r, 40));
  }
  a.detruire();
  return {
    moyenDb: n ? somme / n : DB_MIN,
    picDb: pic,
    // Un micro qui ne remonte jamais au dessus du plancher est muet,
    // coupé, ou dirigé vers un autre appareil.
    ok: pic > DB_MIN + 5,
    fiable: true,
    raison: pic > DB_MIN + 5 ? "" : "micro_muet"
  };
}
