import test from "node:test";
import assert from "node:assert/strict";

import * as P from "../src/core/preuve.js";
import * as S from "../src/core/scheduler.js";

const vide = () => P.entreeVide();

const prouver = (e, dim, reussi, extra = {}) =>
  P.enregistrerPreuve(e, { dim, source: P.SOURCE.TRANSCRIPTION, reussi, ...extra }).entree;

/**
 * Prouve APRÈS l'échéance.
 * Depuis la V6, réussir en avance ne fait pas monter le palier. Pour
 * simuler un apprenant qui revient au bon moment, on ramène l'échéance
 * dans le passé avant d'écrire.
 */
function prouverAEcheance(e, dim, reussi, extra = {}) {
  const d = e.dims[dim];
  if (d && d.echeance) d.echeance = Date.now() - 1000;
  return prouver(e, dim, reussi, extra);
}

/* ===================================================================
   PREUVES
   =================================================================== */

test("une écoute ne fait monter aucune dimension", () => {
  let e = vide();
  for (let i = 0; i < 12; i++) e = P.exposer(e);
  for (const d of P.DIMENSIONS) assert.equal(P.niveau(e, d), 0, `${d} a monté sur de l'écoute`);
  assert.equal(e.signaux.nombreExpositions, 12);
});

test("une auto-évaluation ne fait monter aucune dimension", () => {
  let e = vide();
  for (let i = 0; i < 6; i++) e = P.noterAutoEvaluation(e, "easy");
  for (const d of P.DIMENSIONS) assert.equal(P.niveau(e, d), 0);
  assert.ok(e.signaux.confidenceDeclared > 0, "la confiance déclarée doit être conservée");
});

test("une mesure de rythme ne fait monter aucune dimension", () => {
  let e = vide();
  e = P.noterRythme(e, { attemptDetected: true, speechDurationMs: 900, rhythmSimilarity: 1, syllabicGroups: 2 });
  for (const d of P.DIMENSIONS) assert.equal(P.niveau(e, d), 0);
  assert.equal(e.signaux.nombreTentatives, 1);
});

test("seule une transcription écrit dans une dimension", () => {
  for (const source of [P.SOURCE.EXPOSITION, P.SOURCE.AUTO_EVALUATION, P.SOURCE.RYTHME_LOCAL, P.SOURCE.AUCUNE]) {
    const r = P.enregistrerPreuve(vide(), { dim: P.DIM.PRODUCTION, source, reussi: true });
    assert.equal(r.ecrit, false, `${source} ne doit pas pouvoir écrire`);
    assert.equal(r.raison, "source_non_probante");
  }
  const ok = P.enregistrerPreuve(vide(), { dim: P.DIM.PRODUCTION, source: P.SOURCE.TRANSCRIPTION, reussi: true });
  assert.equal(ok.ecrit, true);
});

test("la prononciation refuse toute écriture, même par transcription", () => {
  const r = P.enregistrerPreuve(vide(), {
    dim: P.DIM.PRONONCIATION, source: P.SOURCE.TRANSCRIPTION, reussi: true
  });
  assert.equal(r.ecrit, false);
  assert.equal(r.raison, "dimension_non_mesurable");
  assert.equal(P.niveau(r.entree, P.DIM.PRONONCIATION), 0);
});

test("la prononciation est déclarée non mesurée", () => {
  assert.equal(P.MESURABLE[P.DIM.PRONONCIATION], false);
  assert.equal(P.etatDimension(P.DIM.PRONONCIATION), P.ETAT_DIM.NON_MESUREE);
});

test("une réussite sans indice vaut plus qu'une réussite avec indice", () => {
  const sans = prouver(vide(), P.DIM.PRODUCTION, true, { avecIndice: false });
  const avec = prouver(vide(), P.DIM.PRODUCTION, true, { avecIndice: true });
  assert.ok(P.niveau(sans, P.DIM.PRODUCTION) > P.niveau(avec, P.DIM.PRODUCTION));
});

test("un échec fait redescendre, sans jamais passer sous zéro", () => {
  let e = vide();
  for (let i = 0; i < 8; i++) e = prouver(e, P.DIM.PRODUCTION, false);
  assert.equal(P.niveau(e, P.DIM.PRODUCTION), 0);
});

test("l'échéance est un instant absolu, pas un jour depuis minuit", () => {
  const avant = Date.now();
  const e = prouver(vide(), P.DIM.RAPPEL, true);
  const ech = e.dims[P.DIM.RAPPEL].echeance;
  assert.ok(ech > avant, "l'échéance doit être postérieure à l'écriture");
  // Première réussite : palier court, dans la séance elle-même.
  assert.ok(ech - avant <= 2 * P.PALIERS[1], "le premier palier doit rester court");
});

test("le premier palier est de dix minutes, pas d'un jour", () => {
  assert.equal(P.PALIERS[0], 10 * 60000);
  assert.equal(P.PALIERS[1], 86400000);
});

test("l'identifiant de tentative est conservé avec la preuve", () => {
  const e = prouver(vide(), P.DIM.PRODUCTION, true, { attemptId: "at-x-1" });
  assert.equal(e.dims[P.DIM.PRODUCTION].dernierAttempt, "at-x-1");
});

test("l'historique 5.1.0 n'est jamais promu en preuve", () => {
  const ancien = { comprehension: 6, production: 6, seen: 40, lastSeen: Date.now() };
  const e = P.normaliser(ancien);
  for (const d of P.DIMENSIONS) assert.equal(P.niveau(e, d), 0);
  assert.equal(P.niveauHistorique(e, P.DIM.COMPREHENSION), 6);
  assert.ok(P.aHistorique(e));
});

/* ===================================================================
   ORDONNANCEUR
   =================================================================== */

test("une phrase jamais rencontrée est neuve, pas due", () => {
  const e = vide();
  assert.equal(S.estNeuve(e), true);
  assert.equal(S.estDue(e), false);
});

test("une phrase seulement écoutée n'est ni neuve ni prouvée", () => {
  const e = P.exposer(vide());
  assert.equal(S.estNeuve(e), false);
  assert.equal(S.estExposeeSeulement(e), true);
  assert.equal(S.estSolide(e), false);
});

test("une réussite obtenue avec le modèle revient dans la même séance", () => {
  // Réussite avec indice : le palier reste court, dix minutes. C'est
  // exactement la reprise intra-séance qui fait tenir une phrase.
  const e = prouver(vide(), P.DIM.PRODUCTION, true, { avecIndice: true });
  assert.equal(S.estDue(e, Date.now()), false, "elle ne doit pas revenir immédiatement");
  assert.equal(S.estDue(e, Date.now() + 11 * 60000), true, "elle doit revenir après dix minutes");
});

test("une réussite sans aucune aide repousse la reprise au lendemain", () => {
  const e = prouver(vide(), P.DIM.PRODUCTION, true, { avecIndice: false });
  assert.equal(S.estDue(e, Date.now() + 60 * 60000), false, "pas due une heure après");
  assert.equal(S.estDue(e, Date.now() + 26 * 3600000), true, "due le lendemain");
});

test("un échec ramène la reprise au palier court", () => {
  let e = vide();
  for (let i = 0; i < 5; i++) e = prouverAEcheance(e, P.DIM.PRODUCTION, true);
  const loin = S.echeance(e);
  e = prouver(e, P.DIM.PRODUCTION, false);
  assert.ok(S.echeance(e) < loin, "après un échec, la phrase doit revenir plus tôt");
});

test("la facilité baisse plus vite qu'elle ne monte", () => {
  const gagnant = { sansIndice: 3, avecIndice: 0, echecs: 0 };
  const perdant = { sansIndice: 0, avecIndice: 0, echecs: 3 };
  assert.ok(S.facilite(gagnant) > S.FACILITE_INITIALE);
  assert.ok(S.facilite(perdant) < S.FACILITE_INITIALE);
  assert.ok(S.FACILITE_INITIALE - S.facilite(perdant) > S.facilite(gagnant) - S.FACILITE_INITIALE);
});

test("la facilité reste dans ses bornes", () => {
  assert.equal(S.facilite({ sansIndice: 999 }), S.FACILITE_MAX);
  assert.equal(S.facilite({ echecs: 999 }), S.FACILITE_MIN);
});

test("une phrase neuve n'admet que l'écoute et la répétition immédiate", () => {
  // Liste EXACTE, pas seulement quelques exclusions : une phrase
  // jamais entendue ne peut pas non plus partir en compréhension ni en
  // discrimination, exercices qui supposent déjà une trace.
  assert.deepEqual(S.typesAdmissibles(vide()), ["ecoute", "ecoute_lente", "repetition"]);
});

test("la solidité exige un étalement réel, même avec un palier élevé", () => {
  // Cas piégeux : palier atteint et réussites nombreuses, mais toutes
  // obtenues dans la même minute.
  const e = vide();
  for (const dim of [P.DIM.RAPPEL, P.DIM.PRODUCTION]) {
    const t = Date.now();
    e.dims[dim] = { n: 6, reussites: 5, echecs: 0, avecIndice: 0, sansIndice: 5,
                    premier: t - 30000, dernier: t, echeance: t + 86400000, dernierAttempt: "" };
  }
  assert.equal(S.estSolide(e), false, "trente secondes d'écart suffisent à déclarer solide");

  for (const dim of [P.DIM.RAPPEL, P.DIM.PRODUCTION]) {
    e.dims[dim].premier = Date.now() - 4 * 86400000;
  }
  assert.equal(S.estSolide(e), true);
});

test("la fluidité n'est proposée qu'une fois la production installée", () => {
  let e = vide();
  assert.ok(!S.typesAdmissibles(e).includes("fluidite"));
  for (let i = 0; i < 3; i++) e = prouverAEcheance(e, P.DIM.PRODUCTION, true);
  assert.ok(S.typesAdmissibles(e).includes("fluidite"));
});

test("réussir en avance ne repousse pas la prochaine échéance", () => {
  // Défaut corrigé : cinq réussites dans la même séance envoyaient la
  // phrase au palier de soixante jours, sans qu'elle ait jamais été
  // retrouvée après un oubli.
  let e = prouver(vide(), P.DIM.PRODUCTION, true);
  const apresPremiere = e.dims[P.DIM.PRODUCTION].echeance;
  const niveauPremiere = P.niveau(e, P.DIM.PRODUCTION);
  for (let i = 0; i < 6; i++) e = prouver(e, P.DIM.PRODUCTION, true);
  assert.equal(e.dims[P.DIM.PRODUCTION].echeance, apresPremiere, "l'échéance a été repoussée");
  assert.equal(P.niveau(e, P.DIM.PRODUCTION), niveauPremiere, "le palier a monté sans reprise à échéance");
  // Les réussites sont bien comptées, elles ne sont pas perdues.
  assert.equal(e.dims[P.DIM.PRODUCTION].reussites, 7);
});

test("un échec compte même quand la phrase n'était pas encore due", () => {
  let e = prouver(vide(), P.DIM.PRODUCTION, true);
  const avant = P.niveau(e, P.DIM.PRODUCTION);
  e = prouver(e, P.DIM.PRODUCTION, false);
  assert.ok(P.niveau(e, P.DIM.PRODUCTION) < avant, "l'oubli doit toujours compter");
});

test("la dimension suivante respecte l'ordre naturel", () => {
  let e = vide();
  assert.equal(S.dimensionSuivante(e), P.DIM.COMPREHENSION);
  e = prouver(prouver(e, P.DIM.COMPREHENSION, true), P.DIM.COMPREHENSION, true);
  assert.equal(S.dimensionSuivante(e), P.DIM.RAPPEL);
});

test("la prononciation n'apparaît jamais dans l'ordre des dimensions", () => {
  assert.ok(!S.ORDRE_DIMENSIONS.includes(P.DIM.PRONONCIATION));
});

test("une phrase fragile et due est la plus prioritaire", () => {
  let fragile = prouver(vide(), P.DIM.RAPPEL, true);
  fragile = prouver(fragile, P.DIM.RAPPEL, false);
  const tard = Date.now() + 20 * 60000;
  const neuve = vide();
  assert.ok(S.priorite(fragile, { util: 3 }, tard) < S.priorite(neuve, { util: 5 }, tard));
});

test("le tableau de bord compte des preuves, pas des leçons", () => {
  const phrases = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const prog = { a: vide(), b: P.exposer(vide()), c: vide() };
  for (let i = 0; i < 2; i++) prog.c = prouver(prog.c, P.DIM.PRODUCTION, true);
  const tb = S.tableauDeBord(phrases, (id) => prog[id]);
  assert.equal(tb.total, 3);
  assert.equal(tb.rencontrees, 2);      // b exposée, c prouvée
  assert.equal(tb.produites, 1);        // c seulement
  assert.equal(tb.comprises, 0);        // aucune preuve de compréhension
});

test("des réussites groupées dans la même minute ne rendent pas une phrase solide", () => {
  // Le défaut à empêcher : enchaîner cinq réussites en une séance et
  // voir la phrase déclarée « tenue dans le temps ».
  let e = vide();
  for (let i = 0; i < 5; i++) {
    e = prouver(e, P.DIM.RAPPEL, true);
    e = prouver(e, P.DIM.PRODUCTION, true);
  }
  assert.equal(S.estSolide(e), false, "aucun délai ne s'est écoulé entre les réussites");
});

test("une phrase est solide quand elle a été retrouvée après un vrai délai", () => {
  let e = vide();
  for (let i = 0; i < 3; i++) {
    e = prouverAEcheance(e, P.DIM.RAPPEL, true);
    e = prouverAEcheance(e, P.DIM.PRODUCTION, true);
  }
  // On recule artificiellement la première réussite de trois jours.
  for (const d of [P.DIM.RAPPEL, P.DIM.PRODUCTION]) {
    e.dims[d].premier = Date.now() - 3 * 86400000;
  }
  assert.equal(S.estSolide(e), true);
});

test("le palier seul ne suffit pas à déclarer une phrase solide", () => {
  let e = vide();
  e = prouverAEcheance(e, P.DIM.RAPPEL, true);
  e = prouverAEcheance(e, P.DIM.RAPPEL, true);
  e = prouverAEcheance(e, P.DIM.PRODUCTION, true);
  e = prouverAEcheance(e, P.DIM.PRODUCTION, true);
  for (const d of [P.DIM.RAPPEL, P.DIM.PRODUCTION]) e.dims[d].premier = Date.now() - 5 * 86400000;
  // Palier atteint et délai réel, mais seulement deux réussites.
  assert.equal(S.estSolide(e), false);
});
