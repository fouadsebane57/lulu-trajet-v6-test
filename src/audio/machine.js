/* ===================================================================
   MACHINE À ÉTATS AUDIO

   Propriétaire du micro, de l'enregistreur, de la voix de synthèse et
   de la lecture, POUR LE PARCOURS DE SÉANCE.

   Cette affirmation était fausse en GATE 2 : app.js appelait
   directement Voix.dire, et engine.js appelait directement capturer().
   La machine restait donc en PREPARING pendant que le micro et
   l'enregistrement se déroulaient ailleurs. Pause et Interruption ne
   pouvaient rien garantir.

   Corrigé ici. Toute opération audio de séance traverse cette machine,
   et une transition est réellement déclenchée à chaque étape. Un test
   d'architecture échoue si un module du parcours contourne ce point
   de passage.

   Exception assumée et hors séance : l'écran de diagnostic pilote le
   micro lui-même, avec son propre cycle d'ouverture et de fermeture.

   Ce que cette contrainte résout, et que la 5.1.0 ne résolvait pas :

     P0.4  le micro était ouvert par capturer() et jamais refermé
           entre deux exercices. Indicateur orange allumé toute la
           séance, batterie, et routage audio dégradé sur iOS.

     P0.5  Pause ne coupait ni le micro ni la détection de parole.
           Problème de vie privée, pas seulement de batterie.

     P0.6  Quitter ne libérait pas tout de façon déterministe.

     P0.8  rien n'empêchait deux séances de tourner en parallèle.
           Le jeton de session était vérifié après coup, pas avant.

   Un seul verrou, `occupe`, empêche toute opération concurrente.
   Toute transition passe par `aller()`, qui refuse les enchaînements
   impossibles au lieu de les subir.
   =================================================================== */

import * as Micro from "./mic.js";
import * as SessionIOS from "./session-ios.js";
import * as Voix from "./tts.js";
import { capturer } from "./recorder.js";
import { LECTURE } from "./lecture.js";
import * as Coord from "./coordinateur.js";

export const ETAT = {
  REPOS: "IDLE",
  PREPARATION: "PREPARING",
  MODELE: "PLAYING_PROMPT",
  ATTENTE: "WAITING_FOR_USER",
  ECOUTE: "LISTENING",
  ENREGISTREMENT: "RECORDING",
  TRAITEMENT: "PROCESSING",
  ECHO: "PLAYING_ECHO",
  RETOUR: "GIVING_FEEDBACK",
  PAUSE: "PAUSED",
  INTERROMPU: "INTERRUPTED",
  TERMINE: "FINISHED",
  ERREUR: "ERROR"
};

/**
 * Transitions autorisées. Tout le reste est refusé et journalisé.
 *
 * La table reste STRICTE : elle décrit un parcours produit, elle ne
 * cherche pas à tout accepter. En GATE 2.1 elle refusait
 * PLAYING_PROMPT vers PLAYING_ECHO, et l'écho ne pouvait donc jamais
 * être joué. La correction n'a pas été d'ouvrir cette transition, mais
 * de corriger l'ordre du produit, qui plaçait le modèle avant la
 * réécoute. Voir src/core/restitution.js.
 *
 * Séquence canonique d'un exercice oral :
 *
 *   PREPARING
 *     -> PLAYING_PROMPT     consigne
 *     -> WAITING_FOR_USER   temps de réponse
 *     -> LISTENING          détection de parole
 *     -> RECORDING          enregistrement
 *     -> PROCESSING         transcription et comparaison
 *     -> GIVING_FEEDBACK    verdict
 *     -> PLAYING_ECHO       ta voix, si l'écho est activé
 *     -> PLAYING_PROMPT     le modèle, en dernier
 *     -> exercice suivant
 */
const TRANSITIONS = {
  [ETAT.REPOS]:          [ETAT.PREPARATION, ETAT.TERMINE],
  [ETAT.PREPARATION]:    [ETAT.MODELE, ETAT.ATTENTE, ETAT.ERREUR, ETAT.TERMINE],
  [ETAT.MODELE]:         [ETAT.ATTENTE, ETAT.ECOUTE, ETAT.RETOUR, ETAT.PAUSE, ETAT.INTERROMPU, ETAT.TERMINE, ETAT.ERREUR],
  [ETAT.ATTENTE]:        [ETAT.ECOUTE, ETAT.MODELE, ETAT.PAUSE, ETAT.INTERROMPU, ETAT.TERMINE],
  [ETAT.ECOUTE]:         [ETAT.ENREGISTREMENT, ETAT.TRAITEMENT, ETAT.PAUSE, ETAT.INTERROMPU, ETAT.TERMINE, ETAT.ERREUR],
  [ETAT.ENREGISTREMENT]: [ETAT.TRAITEMENT, ETAT.PAUSE, ETAT.INTERROMPU, ETAT.TERMINE, ETAT.ERREUR],
  // Le retour vient toujours avant toute relecture. Aucun raccourci.
  [ETAT.TRAITEMENT]:     [ETAT.RETOUR, ETAT.PAUSE, ETAT.INTERROMPU, ETAT.TERMINE, ETAT.ERREUR],
  // Seule transition ajoutée en 2.2, et elle a un sens clair :
  // après le verdict, on rejoue ce que l'apprenant a produit.
  [ETAT.RETOUR]:         [ETAT.ECHO, ETAT.MODELE, ETAT.ATTENTE, ETAT.ECOUTE, ETAT.PAUSE, ETAT.TERMINE, ETAT.INTERROMPU],
  [ETAT.ECHO]:           [ETAT.MODELE, ETAT.RETOUR, ETAT.PAUSE, ETAT.INTERROMPU, ETAT.TERMINE, ETAT.ERREUR],
  [ETAT.PAUSE]:          [ETAT.MODELE, ETAT.ATTENTE, ETAT.ECOUTE, ETAT.TERMINE, ETAT.INTERROMPU],
  [ETAT.INTERROMPU]:     [ETAT.TERMINE, ETAT.PAUSE],
  [ETAT.TERMINE]:        [ETAT.REPOS],
  [ETAT.ERREUR]:         [ETAT.TERMINE, ETAT.REPOS]
};

/** États pendant lesquels le micro a le droit d'être ouvert. */
const MICRO_AUTORISE = new Set([ETAT.ECOUTE, ETAT.ENREGISTREMENT]);

/**
 * États pendant lesquels la commande Répéter est ignorée.
 *
 * Règle absolue : on ne parle jamais pendant que le micro enregistre.
 * Une voix de synthèse qui se superpose à la capture pollue le signal
 * et fausse la transcription.
 *
 * Trois stratégies étaient possibles : ignorer, mettre en file, ou
 * annuler la capture puis répéter. La mise en file ferait parler à un
 * moment imprévisible. L'annulation ferait perdre la réponse déjà
 * prononcée. On ignore, et on le dit.
 */
const REPETITION_INTERDITE = new Set([ETAT.ECOUTE, ETAT.ENREGISTREMENT, ETAT.TRAITEMENT]);

/** Motifs d'interruption d'une opération en cours. */
export const MOTIF = {
  AUCUN: "",
  PAUSE: "pause",
  SUIVANT: "suivant",
  SORTIE: "sortie",
  SYSTEME: "systeme"
};

/**
 * @param {function} lecteur  lecture d'un enregistrement. Injectable pour
 *                            que les tests vérifient qu'elle est bien
 *                            appelée, une seule fois, avec le bon Blob.
 */
export function creer({ onEtat, onJournal, lecteur = null } = {}) {
  // Le son passe par le coordinateur, propriétaire unique. Le lecteur
  // reste injectable pour que les tests vérifient l'appel exact.
  const lire = lecteur || ((blob, opt) => Coord.jouerBlob(blob, opt));
  let etat = ETAT.REPOS;
  let occupe = false;              // verrou anti double séance
  let jeton = 0;                   // identifiant de la séance courante
  let annulation = false;
  let motif = MOTIF.AUCUN;         // pourquoi l'opération courante s'arrête
  const journal = [];

  const noter = (evt, detail) => {
    const ligne = { t: new Date().toISOString().slice(11, 23), evt, etat, ...detail };
    journal.push(ligne);
    if (journal.length > 300) journal.shift();
    onJournal?.(ligne);
  };

  function peut(cible) { return (TRANSITIONS[etat] || []).includes(cible); }

  function aller(cible, detail) {
    if (etat === cible) return true;
    if (!peut(cible)) {
      noter("transition_refusee", { cible, ...detail });
      return false;
    }
    const avant = etat;
    etat = cible;
    noter("transition", { de: avant, vers: cible, ...detail });
    onEtat?.(etat, avant);
    return true;
  }

  /** Coupe tout ce qui produit ou capte du son. Idempotent. */
  async function silence(raison) {
    annulation = true;
    if (raison && Object.values(MOTIF).includes(raison)) motif = raison;
    try { Voix.stopper(); } catch (_) {}
    try { await Micro.liberer(); } catch (_) {}
    noter("silence", { raison, microOuvert: Micro.fluxOuvert() });
  }

  return {
    etat: () => etat,
    jetonCourant: () => jeton,
    occupe: () => occupe,
    journal: () => journal.slice(),
    /** Transitions refusées depuis le début de la séance. Doit rester vide. */
    transitionsRefusees: () => journal.filter((l) => l.evt === "transition_refusee" || l.evt === "echo_refuse"),
    peut,
    /** Pourquoi l'opération courante a été interrompue. */
    motif: () => motif,
    /** Remis à zéro juste avant de jouer un exercice, pas avant. */
    reinitialiserMotif() { motif = MOTIF.AUCUN; annulation = false; },
    /** Trace un événement de séance dans le journal technique. */
    tracer(evt, detail) { noter(evt, detail || {}); },
    microOuvert: () => Micro.fluxOuvert(),
    /** Le micro est-il ouvert alors qu'il ne devrait pas l'être ? */
    microIllegitime: () => Micro.fluxOuvert() && !MICRO_AUTORISE.has(etat),

    /**
     * Démarre une séance. Refuse s'il y en a déjà une. P0.8.
     *
     * @param {object} o.deverrouillage  rapport produit SYNCHRONEMENT
     *   dans le geste utilisateur, par le coordinateur audio. Sans
     *   lui, iOS refuse tout son : au moment où l'on arrive ici, la
     *   pile d'appels n'est plus considérée comme issue du toucher.
     */
    async demarrer({ deverrouillage = null } = {}) {
      if (occupe) { noter("demarrage_refuse", { cause: "session_deja_active" }); return { ok: false, cause: "session_deja_active" }; }
      occupe = true;
      annulation = false;
      jeton += 1;
      etat = ETAT.REPOS;
      aller(ETAT.PREPARATION);

      // Le déverrouillage a été DEMANDÉ dans le geste. On ne fait ici
      // que constater son résultat.
      const dev = deverrouillage
        ? await Coord.confirmerDeverrouillage(deverrouillage)
        : Coord.etatDeverrouillage();
      noter("deverrouillage", dev);

      await Voix.preparer();
      noter("preparation", { jeton, deverrouillage: dev.etat });

      if (dev.etat === Coord.DEVERROUILLAGE.ECHOUE) {
        aller(ETAT.ERREUR, { cause: "audio_verrouille" });
        occupe = false;
        return { ok: false, cause: "audio_verrouille", deverrouillage: dev };
      }
      return { ok: true, jeton, deverrouillage: dev };
    },

    /**
     * Le contexte audio de CAPTURE, réveillé juste avant d'écouter.
     * Il n'est plus réveillé au démarrage de la séance : le faire
     * consommait le geste utilisateur avant le premier son.
     */
    async preparerCapture() {
      const pret = await Micro.reveiller();
      noter("contexte_capture", { pret, etat: Micro.etatContexte() });
      return pret;
    },

    vivant: (j) => occupe && j === jeton && !annulation && etat !== ETAT.TERMINE && etat !== ETAT.INTERROMPU,

    /**
     * Pause réelle. Coupe voix, micro, détection.
     * Le motif est posé AVANT le silence, pour que l'opération en cours
     * sache pourquoi elle s'arrête et que la boucle ne compte pas
     * l'exercice comme terminé.
     */
    async pause() {
      if (!occupe) return false;
      motif = MOTIF.PAUSE;
      const ok = aller(ETAT.PAUSE, { cause: "demande_utilisateur" });
      await silence(MOTIF.PAUSE);
      return ok;
    },

    reprendre() {
      if (etat !== ETAT.PAUSE) return false;
      annulation = false;
      motif = MOTIF.AUCUN;
      return aller(ETAT.ATTENTE, { cause: "reprise" });
    },

    /**
     * Passer à l'exercice suivant.
     * Annule l'opération audio en cours et libère le micro, sans
     * changer d'état de séance : la boucle décidera de la suite.
     */
    async sauter() {
      if (!occupe) return false;
      motif = MOTIF.SUIVANT;
      await silence(MOTIF.SUIVANT);
      noter("saut_demande", { depuis: etat });
      return true;
    },

    /** Interruption externe : appel, Siri, arrière-plan. */
    async interrompre(raison) {
      if (!occupe) return false;
      motif = MOTIF.SYSTEME;
      const ok = aller(ETAT.INTERROMPU, { raison });
      await silence(raison);
      return ok;
    },

    /** Quitter. P0.6. Libère tout, de façon déterministe. */
    async terminer(raison = "fin") {
      annulation = true;
      motif = MOTIF.SORTIE;
      await silence(raison);
      SessionIOS.reinitialiser();
      if (etat !== ETAT.TERMINE) { etat = ETAT.TERMINE; noter("termine", { raison }); onEtat?.(etat); }
      occupe = false;
      jeton += 1;               // invalide toute boucle encore en vol
      etat = ETAT.REPOS;
      noter("liberation_complete", { microOuvert: Micro.fluxOuvert() });
      return true;
    },

    /* ---------- Opérations, chacune bornée par un état ---------- */

    /* Chaque énoncé rend compte de son DÉMARRAGE RÉEL.
       Ces trois fonctions retournaient `true` dès que la promesse de
       synthèse se résolvait, y compris quand rien n'avait été
       prononcé. C'est la source du « la séance avance en silence »
       observé sur iPhone. */

    /** Modèle prononcé. Passe en PLAYING_PROMPT. */
    async direModele(texte, langue = "lb", facteur = 1) {
      if (!aller(ETAT.MODELE)) return { ok: false, demarree: false, cause: `etat_${etat}` };
      const r = await Voix.dire(texte, langue, facteur);
      noter("modele", { demarree: r.demarree, terminee: r.terminee, cause: r.cause });
      return { ok: !!r.demarree, ...r };
    },

    /** Consigne parlée en français. Même état que le modèle. */
    async direConsigne(texte) {
      if (!aller(ETAT.MODELE)) return { ok: false, demarree: false, cause: `etat_${etat}` };
      const r = await Voix.dire(texte, "fr");
      noter("consigne", { demarree: r.demarree, terminee: r.terminee, cause: r.cause });
      return { ok: !!r.demarree, ...r };
    },

    /** Retour pédagogique. Passe en GIVING_FEEDBACK. */
    async direRetour(texte) {
      if (!aller(ETAT.RETOUR)) return { ok: false, demarree: false, cause: `etat_${etat}` };
      const r = await Voix.dire(texte, "fr");
      noter("retour", { demarree: r.demarree, terminee: r.terminee, cause: r.cause });
      return { ok: !!r.demarree, ...r };
    },

    /**
     * Répète le dernier énoncé, sans quitter l'état courant.
     * Refusée pendant l'écoute, l'enregistrement et le traitement :
     * jamais de voix pendant que le micro capte.
     */
    async repeter() {
      if (REPETITION_INTERDITE.has(etat)) {
        noter("repetition_ignoree", { depuis: etat, cause: "micro_actif_ou_resultat_imminent" });
        return { ok: false, cause: "operation_en_cours", etat };
      }
      await Voix.repeter();
      noter("repetition", { depuis: etat });
      return { ok: true, cause: "", etat };
    },

    /** Laisse le temps de répondre. Passe en WAITING_FOR_USER. */
    async attendreUtilisateur(ms = 0) {
      if (!aller(ETAT.ATTENTE)) return false;
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      return true;
    },

    /**
     * Capture une réponse orale, du début à la fin.
     *
     * C'est le point de passage obligatoire remplaçant l'appel direct
     * à capturer() que faisait engine.js. La machine traverse
     * réellement LISTENING, RECORDING puis PROCESSING, et referme le
     * micro avant de rendre la main.
     */
    async capturerReponse(opt = {}) {
      if (!aller(ETAT.ECOUTE)) {
        return { ok: false, errorKind: "etat", error: `Capture refusée depuis l'état ${etat}.`, blob: null, vad: null };
      }
      let r;
      try {
        aller(ETAT.ENREGISTREMENT);
        r = await capturer({ ...opt, annule: () => annulation || opt.annule?.() });
      } catch (err) {
        noter("capture_exception", { message: err?.message });
        aller(ETAT.ERREUR, { cause: "capture" });
        r = { ok: false, errorKind: "mic", error: err?.message || "Capture impossible.", blob: null, vad: null };
      } finally {
        // Le micro est refermé quel que soit le chemin de sortie, ET
        // le contexte audio est fermé. Sans cette seconde opération,
        // iOS garde la sortie routée vers l'écouteur interne et plus
        // rien n'est audible pour la suite de la séance.
        const rendu = await Micro.rendreAudioAuSysteme();
        noter("audio_rendu_apres_capture", rendu);
      }
      aller(ETAT.TRAITEMENT);
      return r;
    },

    entrerEcoute() { return aller(ETAT.ECOUTE); },
    entrerEnregistrement() { return aller(ETAT.ENREGISTREMENT); },
    entrerTraitement() { return aller(ETAT.TRAITEMENT); },

    /**
     * Rejoue la voix de l'utilisateur.
     * Le micro est libéré AVANT, sans quoi iOS peut router la sortie
     * vers l'écouteur au lieu du haut-parleur.
     */
    async rejouerVoix(blob) {
      if (!aller(ETAT.ECHO)) {
        noter("echo_refuse", { depuis: etat });
        return { etat: LECTURE.AUCUN_AUDIO, message: `Écho impossible depuis l'état ${etat}.`, demarree: false, dureeMs: 0 };
      }
      // Micro ET contexte audio rendus avant toute lecture. Un flux
      // encore ouvert, ou un contexte encore vivant, déroute la sortie
      // vers l'écouteur sur iOS.
      const rendu = await Micro.rendreAudioAuSysteme();
      noter("audio_rendu_avant_echo", rendu);
      let r;
      try {
        r = await lire(blob, { annule: () => annulation });
      } catch (err) {
        r = { etat: LECTURE.DEMARREE_INTERROMPUE, message: err?.message || "Lecture interrompue.",
              autorise: false, demarree: false, terminee: false, dureeMs: 0 };
      }
      noter("echo", { resultat: r.etat, autorise: r.autorise, demarree: r.demarree, terminee: r.terminee, dureeMs: r.dureeMs });
      return r;
    },

    /** Ferme le micro dès que l'enregistrement est fini. P0.4. */
    async libererMicro() {
      await Micro.liberer();
      noter("micro_libere", { encoreOuvert: Micro.fluxOuvert() });
    }
  };
}
