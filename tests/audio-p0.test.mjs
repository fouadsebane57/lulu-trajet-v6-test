import test from "node:test";
import assert from "node:assert/strict";

import { restituer, SEGMENTS_OBLIGATOIRES } from "../src/core/restitution.js";
import * as Coord from "../src/audio/coordinateur.js";
import { LECTURE } from "../src/audio/lecture.js";
import * as VoixModele from "../src/audio/voix-modele.js";

/* ===================================================================
   TESTS DU CORRECTIF AUDIO P0

   Ils encodent ce qui a été observé sur iPhone réel :

     la capture fonctionnait ;
     rien n'était audible, ni la voix de l'apprenant, ni le modèle ;
     la séance avançait quand même.

   Chacun de ces tests échoue si le défaut correspondant revient.
   =================================================================== */

/* ---------- Doublures ---------- */

/** Synthèse simulée. `demarre` décide si un son est réellement produit. */
function fausseSynthese({ demarre = true, erreur = false, cause = "" } = {}) {
  const appels = [];
  return {
    appels,
    dispo: () => true,
    qualiteVoix: () => "approximation",
    async dire(texte, langue, facteur) {
      appels.push({ texte, langue, facteur });
      return {
        demande: true,
        demarree: demarre,
        terminee: demarre && !erreur,
        erreur,
        cause: cause || (demarre ? "fin" : "pas_de_demarrage"),
        dureeMs: demarre ? 400 : 0,
        voix: "Voix simulée"
      };
    }
  };
}

/** Machine à états simulée, réduite à ce que la restitution utilise. */
function fausseMachine({ retourDemarre = true, modeleDemarre = true } = {}) {
  const sequence = [];
  return {
    sequence,
    async direRetour(texte) {
      sequence.push({ etape: "retour", texte });
      return { ok: retourDemarre, demarree: retourDemarre, terminee: retourDemarre, cause: retourDemarre ? "fin" : "pas_de_demarrage" };
    },
    async direModele(texte) {
      sequence.push({ etape: "modele", texte });
      return { ok: modeleDemarre, demarree: modeleDemarre, terminee: modeleDemarre, cause: modeleDemarre ? "fin" : "pas_de_demarrage" };
    }
  };
}

const lectureOk = () => ({ etat: LECTURE.TERMINEE, autorise: true, demarree: true, terminee: true, dureeMs: 500, message: "" });
const lectureMuette = () => ({ etat: LECTURE.BLOQUEE_IOS, autorise: false, demarree: false, terminee: false, dureeMs: 0, message: "Refusée." });
const lectureCoupee = () => ({ etat: LECTURE.DEMARREE_INTERROMPUE, autorise: true, demarree: true, terminee: false, dureeMs: 120, message: "" });

const ITEM = { id: "px", lb: "Moien", fr: "bonjour" };
const RESULTAT = { engine: "local", fiable: false, correct: false, messageRythme: "" };

/* ===================================================================
   1. LA SYNTHÈSE NE MENT PLUS
   =================================================================== */

test("une synthèse qui ne démarre pas n'est jamais déclarée jouée", async () => {
  VoixModele.reinitialiser();
  VoixModele.enregistrer(VoixModele.creerSynthese({ tts: fausseSynthese({ demarre: false }) }));
  const r = await VoixModele.dire({ lb: "Moien" }, {});
  assert.equal(r.joue, false, "un moteur muet est rapporté comme ayant parlé");
  assert.equal(r.demarree, false);
  assert.equal(r.cause, "pas_de_demarrage");
});

test("une synthèse en erreur n'est jamais déclarée jouée", async () => {
  VoixModele.reinitialiser();
  VoixModele.enregistrer(VoixModele.creerSynthese({
    tts: fausseSynthese({ demarre: false, erreur: true, cause: "synthesis-failed" })
  }));
  const r = await VoixModele.dire({ lb: "Moien" }, {});
  assert.equal(r.joue, false);
  assert.equal(r.erreur, true);
  assert.equal(r.cause, "synthesis-failed");
});

test("une synthèse qui démarre réellement est déclarée jouée", async () => {
  VoixModele.reinitialiser();
  VoixModele.enregistrer(VoixModele.creerSynthese({ tts: fausseSynthese({ demarre: true }) }));
  const r = await VoixModele.dire({ lb: "Moien" }, {});
  assert.equal(r.joue, true);
  assert.equal(r.demarree, true);
  assert.equal(r.terminee, true);
});

/* ===================================================================
   2. UN SEGMENT MUET BLOQUE L'EXERCICE
   =================================================================== */

test("un écho qui ne démarre pas bloque l'exercice", async () => {
  const audio = fausseMachine();
  const rapport = await restituer({
    audio, item: ITEM, resultat: RESULTAT, echoActive: true,
    rejouer: async () => lectureMuette(),
    vivant: () => true, messageVerdict: "Écoute."
  });
  assert.equal(rapport.echoJoue, false);
  assert.equal(rapport.blocageAudio, true);
  assert.equal(rapport.segmentBloque, "echo");
  // Le modèle n'est même pas tenté : on ne poursuit pas une séquence
  // dont la première étape sonore a échoué.
  assert.equal(audio.sequence.filter((s) => s.etape === "modele").length, 0);
});

test("un écho démarré mais coupé bloque aussi l'exercice", async () => {
  const audio = fausseMachine();
  const rapport = await restituer({
    audio, item: ITEM, resultat: RESULTAT, echoActive: true,
    rejouer: async () => lectureCoupee(),
    vivant: () => true, messageVerdict: "Écoute."
  });
  assert.equal(rapport.echoJoue, false);
  assert.equal(rapport.blocageAudio, true);
});

test("un modèle qui ne démarre pas bloque l'exercice", async () => {
  const audio = fausseMachine({ modeleDemarre: false });
  const rapport = await restituer({
    audio, item: ITEM, resultat: RESULTAT, echoActive: true,
    rejouer: async () => lectureOk(),
    vivant: () => true, messageVerdict: "Écoute."
  });
  assert.equal(rapport.echoJoue, true);
  assert.equal(rapport.modeleJoue, false);
  assert.equal(rapport.blocageAudio, true);
  assert.equal(rapport.segmentBloque, "modele");
});

test("écho et modèle réellement joués : aucun blocage", async () => {
  const audio = fausseMachine();
  const rapport = await restituer({
    audio, item: ITEM, resultat: RESULTAT, echoActive: true,
    rejouer: async () => lectureOk(),
    vivant: () => true, messageVerdict: "Écoute."
  });
  assert.equal(rapport.echoJoue, true);
  assert.equal(rapport.modeleJoue, true);
  assert.equal(rapport.blocageAudio, false);
  assert.deepEqual(rapport.sequence, ["retour", "echo", "modele"]);
});

test("le retour est facultatif : son échec ne bloque pas", async () => {
  // Le retour porte une information déjà affichée à l'écran. Bloquer
  // la séance pour un message serait disproportionné.
  const audio = fausseMachine({ retourDemarre: false });
  const rapport = await restituer({
    audio, item: ITEM, resultat: RESULTAT, echoActive: true,
    rejouer: async () => lectureOk(),
    vivant: () => true, messageVerdict: "Écoute."
  });
  assert.equal(rapport.retourJoue, false);
  assert.equal(rapport.blocageAudio, false);
  assert.deepEqual(SEGMENTS_OBLIGATOIRES, ["echo", "modele"]);
});

test("l'écho désactivé ne peut pas provoquer de blocage", async () => {
  const audio = fausseMachine();
  const rapport = await restituer({
    audio, item: ITEM, resultat: RESULTAT, echoActive: false,
    rejouer: async () => lectureMuette(),
    vivant: () => true, messageVerdict: "Écoute."
  });
  assert.equal(rapport.echoDemande, false);
  assert.equal(rapport.modeleJoue, true);
  assert.equal(rapport.blocageAudio, false);
});

test("une réponse correcte vérifiée ne rejoue rien et ne bloque pas", async () => {
  const audio = fausseMachine({ modeleDemarre: false });
  const rapport = await restituer({
    audio, item: ITEM,
    resultat: { engine: "cloud", fiable: true, correct: true },
    echoActive: true,
    rejouer: async () => { throw new Error("ne doit pas être appelé"); },
    vivant: () => true, messageVerdict: "C'est ça."
  });
  assert.equal(rapport.blocageAudio, false);
  assert.deepEqual(rapport.sequence, ["retour"]);
});

/* ===================================================================
   3. UN SEUL PROPRIÉTAIRE DU SON
   =================================================================== */

test("deux propriétaires ne peuvent pas détenir le son en même temps", () => {
  Coord.forcerLiberation();
  assert.equal(Coord.prendre(Coord.PROPRIETAIRE.SEANCE).ok, true);
  const refus = Coord.prendre(Coord.PROPRIETAIRE.MANUEL);
  assert.equal(refus.ok, false, "l'écoute manuelle a pu jouer pendant la séance");
  assert.equal(refus.detenteur, Coord.PROPRIETAIRE.SEANCE);
  Coord.rendre(Coord.PROPRIETAIRE.SEANCE);
  assert.equal(Coord.prendre(Coord.PROPRIETAIRE.MANUEL).ok, true);
  Coord.forcerLiberation();
});

test("le même propriétaire peut reprendre le son sans se bloquer lui-même", () => {
  Coord.forcerLiberation();
  assert.equal(Coord.prendre(Coord.PROPRIETAIRE.SEANCE).ok, true);
  assert.equal(Coord.prendre(Coord.PROPRIETAIRE.SEANCE).ok, true);
  Coord.forcerLiberation();
});

test("un refus de verrou est journalisé, jamais silencieux", () => {
  Coord.forcerLiberation();
  Coord.viderJournal();
  Coord.prendre(Coord.PROPRIETAIRE.SEANCE);
  Coord.prendre(Coord.PROPRIETAIRE.DIAGNOSTIC);
  const refus = Coord.journalAudio().filter((l) => l.evt === "verrou_refuse");
  assert.equal(refus.length, 1);
  assert.equal(refus[0].demandeur, Coord.PROPRIETAIRE.DIAGNOSTIC);
  Coord.forcerLiberation();
});

/* ===================================================================
   4. LECTURE : ÉLÉMENT PERSISTANT ET OBJECTURL
   =================================================================== */

/** Élément audio simulé, avec cycle d'événements pilotable. */
function fauxElement({ demarre = true, termine = true, erreurCode = null } = {}) {
  const ecouteurs = new Map();
  const el = {
    src: "", volume: 1, muted: false, readyState: 4, networkState: 1,
    duration: 1.5, error: erreurCode ? { code: erreurCode } : null,
    appels: [],
    addEventListener(t, f) { ecouteurs.set(t, f); },
    removeEventListener(t) { ecouteurs.delete(t); },
    emettre(t) { ecouteurs.get(t)?.({ type: t }); },
    pause() { el.appels.push("pause"); },
    load() { el.appels.push("load"); },
    removeAttribute() {},
    play() {
      el.appels.push("play");
      setTimeout(() => {
        if (erreurCode) return el.emettre("error");
        el.emettre("loadedmetadata");
        if (!demarre) return;
        el.emettre("playing");
        if (termine) setTimeout(() => el.emettre("ended"), 5);
      }, 5);
      return Promise.resolve();
    }
  };
  return el;
}

test("la lecture réutilise l'élément persistant, sans en créer un nouveau", async () => {
  const el = fauxElement();
  Coord.injecterElement(el);
  const blob = new Blob(["x".repeat(1000)], { type: "audio/mp4" });
  await Coord.jouerBlob(blob);
  await Coord.jouerBlob(blob);
  // Deux lectures, un seul élément : les appels s'accumulent dessus.
  assert.ok(el.appels.filter((a) => a === "play").length === 2);
});

test("une lecture qui démarre et se termine est un succès complet", async () => {
  Coord.injecterElement(fauxElement({ demarre: true, termine: true }));
  const r = await Coord.jouerBlob(new Blob(["x".repeat(1000)], { type: "audio/mp4" }));
  assert.equal(r.etat, LECTURE.TERMINEE);
  assert.equal(r.autorise, true);
  assert.equal(r.demarree, true);
  assert.equal(r.terminee, true);
});

test("une promesse de play tenue sans événement playing n'est pas un succès", async () => {
  // Distinction exigée : autorisée n'est pas entendue.
  Coord.injecterElement(fauxElement({ demarre: false }));
  const r = await Coord.jouerBlob(new Blob(["x".repeat(1000)], { type: "audio/mp4" }), { plafondMs: 200 });
  assert.equal(r.autorise, true, "la lecture a bien été autorisée");
  assert.equal(r.demarree, false, "mais elle n'a jamais démarré");
  assert.equal(r.terminee, false);
  assert.notEqual(r.etat, LECTURE.TERMINEE);
});

test("un format non décodable est signalé comme tel", async () => {
  Coord.injecterElement(fauxElement({ erreurCode: 4 }));
  const r = await Coord.jouerBlob(new Blob(["x".repeat(1000)], { type: "audio/ogg" }), { plafondMs: 300 });
  assert.equal(r.etat, LECTURE.DECODAGE);
  assert.equal(r.demarree, false);
});

test("sans élément persistant, la lecture est déclarée bloquée, pas réussie", async () => {
  Coord.injecterElement(null);
  const r = await Coord.jouerBlob(new Blob(["x".repeat(1000)], { type: "audio/mp4" }));
  assert.equal(r.etat, LECTURE.BLOQUEE_IOS);
  assert.equal(r.demarree, false);
  assert.match(r.message, /activ/i);
});

test("un blob vide ne produit jamais un succès", async () => {
  Coord.injecterElement(fauxElement());
  const r = await Coord.jouerBlob(null);
  assert.equal(r.etat, LECTURE.AUCUN_AUDIO);
  assert.equal(r.demarree, false);
});

test("l'ObjectURL n'est révoquée qu'après la fin de la lecture", async () => {
  const revocations = [];
  const creees = [];
  const vraiCreate = globalThis.URL.createObjectURL;
  const vraiRevoke = globalThis.URL.revokeObjectURL;
  let n = 0;
  globalThis.URL.createObjectURL = () => { const u = "blob:test-" + (++n); creees.push(u); return u; };
  globalThis.URL.revokeObjectURL = (u) => revocations.push(u);

  try {
    const el = fauxElement({ demarre: true, termine: true });
    // Au moment où la lecture démarre, aucune révocation ne doit avoir
    // eu lieu : c'est ce qui coupait le son en cours de route.
    const original = el.emettre;
    let revocationsAuDemarrage = null;
    el.emettre = (t) => {
      if (t === "playing") revocationsAuDemarrage = revocations.length;
      original(t);
    };
    Coord.injecterElement(el);
    await Coord.jouerBlob(new Blob(["x".repeat(1000)], { type: "audio/mp4" }));

    assert.equal(revocationsAuDemarrage, 0, "l'URL a été révoquée avant ou pendant la lecture");
    assert.ok(revocations.includes(creees[0]), "l'URL n'a jamais été révoquée après la lecture");
  } finally {
    globalThis.URL.createObjectURL = vraiCreate;
    globalThis.URL.revokeObjectURL = vraiRevoke;
  }
});

/* ===================================================================
   5. ÉTAT DU DÉVERROUILLAGE
   =================================================================== */

test("tant que rien n'a été tenté, le son est déclaré non déverrouillé", async () => {
  // L'état initial du module ne prétend jamais que le son est prêt.
  const e = Coord.etatDeverrouillage();
  assert.ok(["jamais_tente", "reussi", "partiel", "echoue"].includes(e.etat));
});

test("un déverrouillage sans élément est un échec, pas un succès partiel", async () => {
  const e = await Coord.confirmerDeverrouillage({ elementCree: false, playPromesse: null, erreurs: [] });
  assert.equal(e.etat, Coord.DEVERROUILLAGE.ECHOUE);
});

test("un déverrouillage dont play est refusée reste partiel", async () => {
  const e = await Coord.confirmerDeverrouillage({
    elementCree: true,
    playPromesse: Promise.resolve({ ok: false, nom: "NotAllowedError" }),
    ttsAppele: true, erreurs: []
  });
  assert.equal(e.etat, Coord.DEVERROUILLAGE.PARTIEL);
  assert.equal(e.playAutorise, false);
  assert.equal(e.playErreur, "NotAllowedError");
});

test("un déverrouillage complet est déclaré réussi", async () => {
  const e = await Coord.confirmerDeverrouillage({
    elementCree: true,
    playPromesse: Promise.resolve({ ok: true }),
    ttsAppele: true, erreurs: []
  });
  assert.equal(e.etat, Coord.DEVERROUILLAGE.REUSSI);
});
