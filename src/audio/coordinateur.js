/* ===================================================================
   COORDINATEUR AUDIO

   Une seule couche arbitre TOUT le son : modèle, consigne, retour,
   écho, lecture manuelle, diagnostic.

   POURQUOI CE MODULE EXISTE

   Test physique sur iPhone réel, GitHub Pages, Safari privé :
   la capture fonctionnait, l'enregistrement était produit, mais rien
   n'était audible, ni la voix de l'apprenant, ni le modèle, et la
   séance avançait quand même.

   Quatre défauts se combinaient.

   1. PLUSIEURS PROPRIÉTAIRES DU SON
      La séance jouait par la machine à états ; le bouton « Écouter »
      de l'onglet Voix appelait la lecture directement ; le diagnostic
      avait son propre chemin ; la voix du modèle contournait la
      machine. Quatre chemins concurrents, aucun arbitrage.

   2. UN NOUVEL ÉLÉMENT AUDIO À CHAQUE LECTURE
      `new Audio()` créé puis jeté. Sur iOS, un élément média n'est
      autorisé à jouer que s'il a été « débloqué » par une activation
      utilisateur. Un élément neuf, créé après plusieurs `await`, ne
      l'est pas.

   3. L'ACTIVATION UTILISATEUR ÉTAIT PERDUE
      Le premier son d'une séance arrivait après le réveil du contexte
      audio, la préparation de la synthèse, la session de plateforme et
      le verrou d'écran, soit plusieurs centaines de millisecondes et
      autant d'`await`. iOS ne considère plus la pile d'appels comme
      issue du geste.

   4. LA SESSION AUDIO RESTAIT EN MODE ENREGISTREMENT
      L'AudioContext n'était jamais fermé. Sur iOS, tant que les
      ressources de capture ne sont pas rendues, la sortie reste
      routée vers l'écouteur, pas vers le haut-parleur. Fait documenté
      par Apple et par WebKit : après un appel à getUserMedia, la
      lecture d'un élément audio part dans l'écouteur interne, et
      aucune sélection de sortie n'est exposée.
      Fermer l'AudioContext est ce qui rend les ressources système.

   CE QUE CE MODULE GARANTIT

     un seul élément audio, créé au premier geste et conservé ;
     un verrou : deux sons ne jouent jamais en même temps ;
     un déverrouillage exécuté SYNCHRONEMENT dans le geste ;
     un résultat de lecture qui distingue autorisé, démarré, terminé ;
     la fermeture du contexte audio après chaque capture.

   CE QU'IL NE PEUT PAS GARANTIR

   Qu'un son émis soit effectivement ENTENDU. Aucune API web ne le
   dit. Il peut seulement affirmer que la lecture a été autorisée,
   qu'elle a démarré, et qu'elle est allée à son terme.
   =================================================================== */

import { LECTURE, MESSAGE } from "./lecture.js";
import * as SessionIOS from "./session-ios.js";

/** Qui détient le son. Un seul à la fois. */
export const PROPRIETAIRE = {
  AUCUN: "",
  SEANCE: "seance",
  MANUEL: "manuel",
  DIAGNOSTIC: "diagnostic"
};

export const DEVERROUILLAGE = {
  JAMAIS: "jamais_tente",
  REUSSI: "reussi",
  PARTIEL: "partiel",
  ECHOUE: "echoue"
};

/* ---------- État du module ---------- */

let element = null;                 // HTMLAudioElement persistant
let urlCourante = "";
let detenteur = PROPRIETAIRE.AUCUN;
let deverrouille = DEVERROUILLAGE.JAMAIS;
let detailDeverrouillage = {};
let journal = [];
let arretDemande = false;

const noter = (evt, detail = {}) => {
  const l = { t: Date.now(), evt, ...detail };
  journal.push(l);
  if (journal.length > 400) journal.shift();
  return l;
};

export const journalAudio = () => journal.slice();
export const viderJournal = () => { journal = []; };
export const etatDeverrouillage = () => ({ etat: deverrouille, ...detailDeverrouillage });
export const proprietaire = () => detenteur;

/* ===================================================================
   ÉLÉMENT PERSISTANT
   =================================================================== */

/**
 * Crée l'élément audio unique.
 *
 * Doit être appelé DANS un geste utilisateur, sans aucun `await`
 * avant. C'est la seule façon, sur iOS, d'obtenir un élément qui
 * acceptera de jouer plus tard sans nouveau geste.
 */
export function creerElement() {
  if (element) return element;
  element = document.createElement("audio");
  element.setAttribute("playsinline", "");
  element.setAttribute("webkit-playsinline", "");
  element.preload = "auto";
  element.volume = 1;
  element.muted = false;
  // Hors flux de mise en page, mais présent dans le document : un
  // élément détaché est traité différemment par certains navigateurs.
  element.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none";
  document.body.appendChild(element);
  noter("element_cree");
  return element;
}

export const elementExiste = () => !!element;

/** Uniquement pour les tests. */
export function injecterElement(faux) { element = faux; }

/* ===================================================================
   DÉVERROUILLAGE iOS
   =================================================================== */

/** Un WAV silencieux minimal, en base64. Assez pour débloquer l'élément. */
const SILENCE_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

/**
 * Déverrouille le son. À APPELER SYNCHRONEMENT DANS LE GESTE.
 *
 * Ne fait aucun `await` avant les deux appels décisifs : `play()` sur
 * l'élément persistant, et `speak()` sur la synthèse. Les promesses
 * sont observées ensuite, mais les appels partent immédiatement.
 *
 * @returns {object} rapport synchrone, complété par `attendre()`
 */
export function deverrouiller() {
  // Important sur iOS : la catégorie "playback" remet la sortie sur le
  // chemin de lecture après un éventuel passage antérieur par le micro.
  // Appel synchrone pour rester dans le geste utilisateur.
  const sessionAudio = SessionIOS.preparerLecture();

  const rapport = {
    elementCree: false,
    playAppele: false,
    playPromesse: null,
    ttsAppele: false,
    sessionAudio,
    erreurs: []
  };

  try {
    creerElement();
    rapport.elementCree = true;
  } catch (e) {
    rapport.erreurs.push("element:" + (e?.message || e));
  }

  // 1. Débloquer l'élément média avec un silence.
  if (element) {
    try {
      element.src = SILENCE_WAV;
      const p = element.play();
      rapport.playAppele = true;
      rapport.playPromesse = p && typeof p.then === "function"
        ? p.then(() => ({ ok: true })).catch((e) => ({ ok: false, nom: e?.name || "", message: e?.message || "" }))
        : Promise.resolve({ ok: true, nom: "sans_promesse" });
    } catch (e) {
      rapport.erreurs.push("play:" + (e?.message || e));
    }
  }

  // 2. Débloquer la synthèse vocale avec un énoncé vide.
  //    Sur iOS, la première invocation doit venir d'un geste. Un
  //    énoncé d'un seul espace ne produit aucun son audible mais
  //    marque le moteur comme activé.
  if (typeof speechSynthesis !== "undefined") {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
      rapport.ttsAppele = true;
    } catch (e) {
      rapport.erreurs.push("tts:" + (e?.message || e));
    }
  }

  noter("deverrouillage_demande", {
    element: rapport.elementCree, play: rapport.playAppele, tts: rapport.ttsAppele
  });
  return rapport;
}

/** Complète le rapport de déverrouillage. Appelable après des `await`. */
export async function confirmerDeverrouillage(rapport) {
  const play = rapport?.playPromesse ? await rapport.playPromesse : { ok: false, nom: "non_appele" };
  const ok = !!rapport?.elementCree && play.ok;
  deverrouille = ok ? DEVERROUILLAGE.REUSSI
    : (rapport?.elementCree ? DEVERROUILLAGE.PARTIEL : DEVERROUILLAGE.ECHOUE);
  detailDeverrouillage = {
    element: !!rapport?.elementCree,
    playAutorise: play.ok,
    playErreur: play.nom || "",
    tts: !!rapport?.ttsAppele,
    audioSession: rapport?.sessionAudio || SessionIOS.etat(),
    erreurs: rapport?.erreurs || []
  };
  noter("deverrouillage_resultat", detailDeverrouillage);
  try { element?.pause?.(); } catch (_) {}
  return etatDeverrouillage();
}

/**
 * Prépare une lecture déclenchée DIRECTEMENT par un clic sans lancer
 * le WAV silencieux. Le play() du contenu réel doit être le premier
 * play() utile du geste ; cela évite une course silence -> Blob.
 */
export function preparerLectureDirecte() {
  const sessionAudio = SessionIOS.preparerLecture();
  let elementCree = false;
  try { creerElement(); elementCree = true; } catch (_) {}
  noter("lecture_directe_preparee", { elementCree, audioSession: sessionAudio.type || "" });
  return { elementCree, sessionAudio };
}

/* ===================================================================
   VERROU D'EXCLUSIVITÉ
   =================================================================== */

/**
 * Prend le son. Refuse si un autre propriétaire le détient.
 * Le refus est explicite : aucune lecture concurrente ne part en
 * silence, comme c'était le cas entre la séance et l'onglet Voix.
 */
export function prendre(qui) {
  if (detenteur !== PROPRIETAIRE.AUCUN && detenteur !== qui) {
    noter("verrou_refuse", { demandeur: qui, detenteur });
    return { ok: false, detenteur };
  }
  detenteur = qui;
  return { ok: true, detenteur };
}

export function rendre(qui) {
  if (detenteur === qui) detenteur = PROPRIETAIRE.AUCUN;
  return detenteur;
}

export function forcerLiberation() {
  detenteur = PROPRIETAIRE.AUCUN;
  noter("verrou_force");
}

/* ===================================================================
   LECTURE D'UN ENREGISTREMENT
   =================================================================== */

/**
 * Joue un Blob sur l'élément persistant.
 *
 * Distingue explicitement, comme demandé :
 *   autorisé   la promesse de play() a été tenue
 *   démarré    l'événement playing a été reçu
 *   terminé    l'événement ended a été reçu
 *   interrompu démarré puis coupé
 *   indécodable le conteneur n'est pas lisible ici
 *
 * Une promesse de `play()` tenue n'est PAS une preuve d'audition. Elle
 * signifie seulement que la lecture a été autorisée à commencer.
 */
export function jouerBlob(blob, opt = {}) {
  // Chaque lecture réaffirme la catégorie playback. C'est volontaire :
  // sur Safari iOS, getUserMedia peut la remettre en play-and-record.
  const sessionAudio = SessionIOS.preparerLecture();
  const plafondMs = opt.plafondMs ?? 15000;
  const trace = [];
  const marque = (nom, extra = {}) => trace.push({ nom, ms: Date.now(), ...extra });

  return new Promise((resolve) => {
    if (!blob || !blob.size) {
      return resolve(resultat(LECTURE.AUCUN_AUDIO, { trace, autorise: false, demarree: false, terminee: false }));
    }
    if (!element) {
      // Aucun élément persistant : le déverrouillage n'a jamais eu lieu.
      return resolve(resultat(LECTURE.BLOQUEE_IOS, {
        trace, autorise: false, demarree: false, terminee: false,
        message: "Le son n'a pas encore été activé. Touche l'écran pour activer LULU."
      }));
    }

    arretDemande = false;
    const el = element;
    let demarree = false, terminee = false, autorise = false, fini = false;
    let t0 = 0, dureeMedia = 0;

    const nouvelleUrl = URL.createObjectURL(blob);

    const nettoyer = () => {
      clearTimeout(plafond);
      clearInterval(veille);
      for (const evt of EVENEMENTS) el.removeEventListener(evt, ecouteur);
      try { el.pause(); } catch (_) {}
      // Révocation SEULEMENT ici : jamais pendant le décodage ni
      // pendant la lecture. C'est la règle qui coupait le son quand
      // l'exercice suivant démarrait.
      if (urlCourante) { URL.revokeObjectURL(urlCourante); urlCourante = ""; }
    };

    const terminer = (etat, detail) => {
      if (fini) return;
      fini = true;
      nettoyer();
      noter("lecture", { etat, autorise, demarree, terminee, dureeMs: t0 ? Date.now() - t0 : 0 });
      resolve(resultat(etat, {
        trace, autorise, demarree, terminee, dureeMs: t0 ? Date.now() - t0 : 0,
        dureeMedia, readyState: el.readyState, networkState: el.networkState,
        codeErreur: el.error?.code ?? null, volume: el.volume, muted: el.muted,
        message: detail
      }));
    };

    const EVENEMENTS = ["loadedmetadata", "loadeddata", "canplay", "playing",
                        "pause", "ended", "error", "abort", "stalled", "waiting"];

    // Tous les événements sont observés. Seuls quelques-uns décident ;
    // les autres servent à savoir ce que Safari fait réellement.
    const ecouteur = (e) => {
      marque(e.type, { readyState: el.readyState, networkState: el.networkState });
      if (e.type === "loadedmetadata") dureeMedia = Number.isFinite(el.duration) ? el.duration : 0;
      if (e.type === "playing") { demarree = true; if (!t0) t0 = Date.now(); }
      if (e.type === "ended") {
        terminee = true;
        if (el.volume === 0 || el.muted) return terminer(LECTURE.INAUDIBLE);
        return terminer(LECTURE.TERMINEE);
      }
      if (e.type === "error") {
        const code = el.error?.code;
        return terminer(code === 4 ? LECTURE.DECODAGE : LECTURE.DEMARREE_INTERROMPUE,
          code === 4 ? `${MESSAGE[LECTURE.DECODAGE]} Format ${blob.type || "inconnu"}.` : "");
      }
    };
    for (const evt of EVENEMENTS) el.addEventListener(evt, ecouteur);

    // Réutilisation de l'élément : on arrête proprement l'ancienne
    // source avant d'affecter la nouvelle.
    try { el.pause(); } catch (_) {}
    if (urlCourante) { URL.revokeObjectURL(urlCourante); }
    urlCourante = nouvelleUrl;
    el.src = nouvelleUrl;
    el.volume = opt.volume ?? 1;
    el.muted = false;
    try { el.load(); } catch (_) {}
    marque("src_affecte", { type: blob.type, octets: blob.size });

    const veille = setInterval(() => {
      if (fini) return;
      if (arretDemande || opt.annule?.()) terminer(demarree ? LECTURE.DEMARREE_INTERROMPUE : LECTURE.BLOQUEE_IOS,
        "Lecture interrompue avant la fin.");
    }, 120);

    const plafond = setTimeout(() => {
      terminer(demarree ? LECTURE.DEMARREE_INTERROMPUE : LECTURE.BLOQUEE_IOS);
    }, plafondMs);

    const p = el.play();
    marque("play_appele");
    if (p && typeof p.then === "function") {
      p.then(() => { autorise = true; marque("play_resolue"); })
       .catch((err) => {
         const n = err?.name || "";
         marque("play_rejetee", { nom: n });
         if (n === "NotAllowedError" || n === "SecurityError") return terminer(LECTURE.BLOQUEE_IOS);
         if (n === "NotSupportedError") return terminer(LECTURE.DECODAGE);
         terminer(LECTURE.DEMARREE_INTERROMPUE, err?.message || "");
       });
    } else {
      autorise = true;
      marque("play_sans_promesse");
    }
  });
}

function resultat(etat, extra) {
  return {
    etat,
    message: extra.message || MESSAGE[etat] || "",
    autorise: !!extra.autorise,
    demarree: !!extra.demarree,
    terminee: !!extra.terminee,
    dureeMs: extra.dureeMs || 0,
    dureeMedia: extra.dureeMedia || 0,
    readyState: extra.readyState ?? null,
    networkState: extra.networkState ?? null,
    codeErreur: extra.codeErreur ?? null,
    volume: extra.volume ?? null,
    muted: extra.muted ?? null,
    trace: extra.trace || []
  };
}

/** Coupe immédiatement ce qui joue. */
export function arreter() {
  arretDemande = true;
  try { element?.pause?.(); } catch (_) {}
  try { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); } catch (_) {}
  noter("arret");
}

export { LECTURE };
