import test from "node:test";
import assert from "node:assert/strict";

import * as Sess from "../src/core/session.js";
import * as C from "../src/content/index.js";
import * as P from "../src/core/preuve.js";
import { restituer } from "../src/core/restitution.js";
import { LECTURE } from "../src/audio/lecture.js";

/* ===================================================================
   INTÉGRATION AUDIO ET SÉANCE

   Ces tests rejouent la décision réelle prise après une réponse orale :
   l'exercice est-il consommé, ou non ?

   Ils reproduisent la boucle de app.js sans DOM, avec la MÊME règle :
   un rapport de restitution qui signale un blocage audio interdit
   d'appeler `terminerExercice`.

   Le défaut qu'ils empêchent est celui observé sur iPhone : aucun son,
   et pourtant la séance défile.
   =================================================================== */

const ITEM = { id: "px", lb: "Moien", fr: "bonjour", ph: "", alt: [], paquet: "pk-saluer" };
const RESULTAT = { engine: "local", fiable: false, correct: false, messageRythme: "" };

function machine({ modeleDemarre = true } = {}) {
  return {
    async direRetour() { return { ok: true, demarree: true, terminee: true }; },
    async direModele() {
      return { ok: modeleDemarre, demarree: modeleDemarre, terminee: modeleDemarre,
               cause: modeleDemarre ? "fin" : "pas_de_demarrage" };
    }
  };
}

const echoOk = async () => ({ etat: LECTURE.TERMINEE, autorise: true, demarree: true, terminee: true, dureeMs: 400 });
const echoMuet = async () => ({ etat: LECTURE.BLOQUEE_IOS, autorise: false, demarree: false, terminee: false, dureeMs: 0, message: "Refusée." });

/**
 * Reproduit la décision de la boucle de séance.
 * Retourne ce qui a été fait de l'exercice.
 */
async function tour(seance, exercice, { modeleDemarre, echo }) {
  const rapport = await restituer({
    audio: machine({ modeleDemarre }),
    item: ITEM,
    resultat: RESULTAT,
    echoActive: true,
    rejouer: echo,
    vivant: () => true,
    messageVerdict: "Écoute."
  });

  if (rapport.blocageAudio) {
    // Règle du correctif : on ne consomme rien.
    return { consomme: false, rapport };
  }
  Sess.terminerExercice(seance, exercice, 12000);
  return { consomme: true, rapport };
}

function seanceDeTest() {
  const s = Sess.creerSeance({
    mode: Sess.MODES.TRAJET,
    dureeMinutes: 20,
    phrases: C.phrases().filter((p) => p.niveau <= 1),
    dialogues: [],
    progressionDe: () => P.entreeVide(),
    seed: 2026,
    maintenant: Date.now()
  });
  Sess.demarrer(s, 0);
  return s;
}

/* =================================================================== */

test("écho muet : l'exercice reste courant, l'index ne bouge pas", async () => {
  const s = seanceDeTest();
  const ex = Sess.prochain(s, 0);
  const avant = s.index;

  const r = await tour(s, ex, { modeleDemarre: true, echo: echoMuet });

  assert.equal(r.consomme, false, "l'exercice a été consommé malgré un écho muet");
  assert.equal(s.index, avant, "l'index a avancé sans son");
  assert.equal(r.rapport.segmentBloque, "echo");
  // Le même exercice est encore proposé.
  assert.equal(Sess.prochain(s, 1000), ex);
});

test("modèle muet après un écho réussi : l'exercice reste courant", async () => {
  const s = seanceDeTest();
  const ex = Sess.prochain(s, 0);
  const avant = s.index;

  const r = await tour(s, ex, { modeleDemarre: false, echo: echoOk });

  assert.equal(r.consomme, false, "l'exercice a été consommé malgré un modèle muet");
  assert.equal(s.index, avant);
  assert.equal(r.rapport.segmentBloque, "modele");
  assert.equal(r.rapport.echoJoue, true, "l'écho avait pourtant bien joué");
});

test("écho et modèle réellement joués : l'exercice avance", async () => {
  const s = seanceDeTest();
  const ex = Sess.prochain(s, 0);
  const avant = s.index;

  const r = await tour(s, ex, { modeleDemarre: true, echo: echoOk });

  assert.equal(r.consomme, true);
  assert.equal(s.index, avant + 1);
  assert.equal(r.rapport.blocageAudio, false);
});

test("après un blocage puis une réactivation, le même exercice est rejoué et consommé", async () => {
  const s = seanceDeTest();
  const ex = Sess.prochain(s, 0);
  const depart = s.index;

  // Première tentative : le son est bloqué.
  const bloque = await tour(s, ex, { modeleDemarre: true, echo: echoMuet });
  assert.equal(bloque.consomme, false);
  assert.equal(s.index, depart);

  // L'utilisateur réactive le son. Le même exercice repart.
  const memeExercice = Sess.prochain(s, 1000);
  assert.equal(memeExercice, ex, "un autre exercice a été proposé après le blocage");

  const reussi = await tour(s, memeExercice, { modeleDemarre: true, echo: echoOk });
  assert.equal(reussi.consomme, true);
  assert.equal(s.index, depart + 1);
});

test("un blocage répété ne fait jamais progresser la séance en secret", async () => {
  const s = seanceDeTest();
  const depart = s.index;
  const historiqueDepart = s.historique.length;

  for (let i = 0; i < 5; i++) {
    const ex = Sess.prochain(s, i * 1000);
    const r = await tour(s, ex, { modeleDemarre: false, echo: echoOk });
    assert.equal(r.consomme, false);
  }

  assert.equal(s.index, depart, "l'index a bougé pendant les blocages");
  assert.equal(s.historique.length, historiqueDepart, "des exercices ont été journalisés sans son");
  assert.equal(s.nouvellesIntroduites, 0, "des phrases ont été comptées comme ouvertes sans son");
});

test("un blocage ne fausse pas l'estimation de durée des exercices", async () => {
  const s = seanceDeTest();
  const ex = Sess.prochain(s, 0);
  const avant = s.estimations[ex.type];
  await tour(s, ex, { modeleDemarre: false, echo: echoOk });
  assert.equal(s.estimations[ex.type], avant);
});

test("le bilan ne compte pas les exercices bloqués", async () => {
  const s = seanceDeTest();
  for (let i = 0; i < 3; i++) {
    const ex = Sess.prochain(s, i * 1000);
    await tour(s, ex, { modeleDemarre: false, echo: echoOk });
  }
  const b = Sess.bilan(s, 60000);
  assert.equal(b.exercices, 0, "des exercices muets ont été comptés dans le bilan");
});
