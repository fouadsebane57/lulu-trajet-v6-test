import test from "node:test";
import assert from "node:assert/strict";

import * as Profil from "../src/core/profil.js";
import { NATURE } from "../src/speech/engine.js";

const resultat = (nature, { id = "p1", fiable = true, ms = 4000, paquet = "pk-saluer" } = {}) => ({
  nature, fiable, totalMs: ms, providerId: "lux",
  phrase: { id, paquet }
});

/* ===================================================================
   PRINCIPE CENTRAL

   Une absence de preuve n'est pas une erreur de l'apprenant.
   Chaque nature va dans son propre compteur.
   =================================================================== */

test("un échec confirmé compte comme difficulté", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < 3; i++) p = Profil.noter(p, resultat(NATURE.ERREUR_UTILISATEUR));
  assert.equal(p.parPhrase.p1.echecs, 3);
  assert.equal(Profil.phrasesDifficiles(p).length, 1);
});

test("une incertitude moteur ne devient jamais une difficulté", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < 10; i++) p = Profil.noter(p, resultat(NATURE.INCERTITUDE_MOTEUR, { fiable: false }));
  assert.equal(p.parPhrase.p1.echecs, 0);
  assert.equal(p.parPhrase.p1.incertitudes, 10);
  assert.deepEqual(Profil.phrasesDifficiles(p), []);
});

test("une panne technique ne devient jamais une difficulté", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < 8; i++) p = Profil.noter(p, resultat(NATURE.PANNE_TECHNIQUE, { fiable: false }));
  assert.equal(p.parPhrase.p1.pannes, 8);
  assert.equal(p.parPhrase.p1.echecs, 0);
  assert.deepEqual(Profil.phrasesDifficiles(p), []);
});

test("un échec non fiable n'est pas compté comme échec", () => {
  // Cas concret : moteur allemand qui se trompe. Le verdict arrive en
  // ERREUR_UTILISATEUR seulement s'il est fiable ; sinon rien.
  let p = Profil.profilVide();
  p = Profil.noter(p, resultat(NATURE.ERREUR_UTILISATEUR, { fiable: false }));
  assert.equal(p.parPhrase.p1.echecs, 0);
});

test("une réussite non fiable ne fait pas non plus progresser le profil", () => {
  let p = Profil.profilVide();
  p = Profil.noter(p, resultat(NATURE.REUSSITE, { fiable: false }));
  assert.equal(p.parPhrase.p1.reussites, 0);
});

test("la difficulté est un rapport, pas un compteur brut", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < 20; i++) p = Profil.noter(p, resultat(NATURE.REUSSITE));
  for (let i = 0; i < 2; i++) p = Profil.noter(p, resultat(NATURE.ERREUR_UTILISATEUR));
  // Deux échecs sur vingt-deux tentatives : ce n'est pas une difficulté.
  assert.deepEqual(Profil.phrasesDifficiles(p), []);
});

test("les phrases non reconnues sont exposées à part, comme un fait sur l'outil", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < 5; i++) p = Profil.noter(p, resultat(NATURE.INCERTITUDE_MOTEUR, { fiable: false }));
  const nr = Profil.phrasesNonReconnues(p);
  assert.equal(nr.length, 1);
  assert.equal(nr[0].incertitudes, 5);
});

test("l'oubli est détecté : réussie puis ratée plus tard", async () => {
  let p = Profil.profilVide();
  p = Profil.noter(p, resultat(NATURE.REUSSITE));
  await new Promise((r) => setTimeout(r, 5));
  p = Profil.noter(p, resultat(NATURE.ERREUR_UTILISATEUR));
  const o = Profil.phrasesOubliees(p);
  assert.equal(o.length, 1);
  assert.equal(o[0].id, "p1");
});

test("la lenteur se mesure par rapport à sa propre moyenne", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < 10; i++) p = Profil.noter(p, resultat(NATURE.REUSSITE, { id: "rapide", ms: 3000 }));
  for (let i = 0; i < 3; i++) p = Profil.noter(p, resultat(NATURE.REUSSITE, { id: "lente", ms: 14000 }));
  const l = Profil.phrasesLentes(p);
  assert.ok(l.some((x) => x.id === "lente"));
  assert.ok(!l.some((x) => x.id === "rapide"));
});

test("les paquets fragiles s'agrègent depuis les phrases", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < 4; i++) p = Profil.noter(p, resultat(NATURE.ERREUR_UTILISATEUR, { id: "a" }));
  for (let i = 0; i < 4; i++) p = Profil.noter(p, resultat(NATURE.REUSSITE, { id: "b" }));
  const f = Profil.paquetsFragiles(p, () => "pk-saluer");
  assert.equal(f.length, 1);
  assert.equal(f[0].echecs, 4);
  assert.equal(f[0].reussites, 4);
});

test("la liste des sons difficiles reste vide et explique pourquoi", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < 30; i++) p = Profil.noter(p, resultat(NATURE.ERREUR_UTILISATEUR, { id: "p" + i }));
  const r = Profil.resume(p, () => "pk-saluer");
  assert.deepEqual(r.sonsDifficiles, [], "le profil prétend connaître les sons");
  assert.match(r.raisonSonsVides, /aucun outil/i);
});

test("le journal d'événements reste borné", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < Profil.MAX_EVENEMENTS + 120; i++) p = Profil.noter(p, resultat(NATURE.REUSSITE));
  assert.equal(p.evenements.length, Profil.MAX_EVENEMENTS);
});

test("un profil corrompu est normalisé sans planter", () => {
  const p = Profil.normaliser({ evenements: "pas un tableau", parPhrase: { x: null }, latences: 42 });
  assert.deepEqual(p.evenements, []);
  assert.deepEqual(p.latences, []);
  assert.ok(p.parPhrase.x);
});

test("le profil oriente la priorité sans jamais décider seul", () => {
  let p = Profil.profilVide();
  for (let i = 0; i < 3; i++) p = Profil.noter(p, resultat(NATURE.ERREUR_UTILISATEUR, { id: "dure" }));
  for (let i = 0; i < 5; i++) p = Profil.noter(p, resultat(NATURE.REUSSITE, { id: "facile" }));
  assert.equal(Profil.ajustementPriorite(p, "dure"), -1);
  assert.equal(Profil.ajustementPriorite(p, "facile"), 1);
  assert.equal(Profil.ajustementPriorite(p, "inconnue"), 0);
  // L'amplitude reste volontairement d'un seul cran.
  for (const id of ["dure", "facile", "inconnue"]) {
    assert.ok(Math.abs(Profil.ajustementPriorite(p, id)) <= 1);
  }
});
