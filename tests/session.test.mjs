import test from "node:test";
import assert from "node:assert/strict";

import * as Sess from "../src/core/session.js";
import * as P from "../src/core/preuve.js";
import * as C from "../src/content/index.js";
import { compterAdjacencesAccidentelles } from "../src/core/file.js";

const phrases = () => C.phrases().filter((p) => p.niveau <= 2);
const vierge = () => P.entreeVide();

function seance(o = {}) {
  return Sess.creerSeance({
    mode: o.mode || Sess.MODES.TRAJET,
    dureeMinutes: o.minutes ?? 20,
    phrases: o.phrases || phrases(),
    dialogues: o.dialogues ?? C.dialoguesDuNiveau(2),
    progressionDe: o.progressionDe || (() => vierge()),
    seed: o.seed ?? 42,
    maintenant: o.maintenant
  });
}

/* ===================================================================
   CONSTRUCTION DE LA FILE
   =================================================================== */

test("une séance produit une file non vide", () => {
  const s = seance();
  assert.ok(s.file.length > 0);
  assert.ok(s.recyclage.length >= 0);
});

test("la même graine produit exactement la même file", () => {
  const a = seance({ seed: 7 }).file.map((e) => `${e.type}:${e.itemId}`);
  const b = seance({ seed: 7 }).file.map((e) => `${e.type}:${e.itemId}`);
  assert.deepEqual(a, b);
});

test("deux graines différentes produisent des files différentes", () => {
  const a = seance({ seed: 1 }).file.map((e) => `${e.type}:${e.itemId}`).join("|");
  const b = seance({ seed: 99 }).file.map((e) => `${e.type}:${e.itemId}`).join("|");
  assert.notEqual(a, b);
});

test("aucune répétition immédiate accidentelle dans la file", () => {
  for (const seed of [1, 2, 3, 17, 42, 99, 250]) {
    const s = seance({ seed });
    assert.equal(compterAdjacencesAccidentelles(s.file), 0, `graine ${seed}`);
  }
});

test("la séquence de découverte reste soudée", () => {
  // Écoute, écoute lente, répétition : les trois doivent se suivre.
  const s = seance({ seed: 5 });
  for (let i = 0; i < s.file.length; i++) {
    if (s.file[i].raison !== "decouverte" || s.file[i].adjacenceVoulue) continue;
    const suite = s.file.slice(i, i + 3);
    if (suite.length < 3) continue;
    assert.equal(suite[0].type, "ecoute");
    assert.equal(suite[1].type, "ecoute_lente");
    assert.equal(suite[2].type, "repetition");
    for (const c of suite) assert.equal(c.itemId, suite[0].itemId);
    break;
  }
});

test("aucune séquence de découverte n'est coupée en deux", () => {
  // Défaut corrigé : l'insertion du dialogue en milieu de séance
  // pouvait tomber entre l'écoute et la répétition d'une phrase neuve.
  for (const seed of [1, 5, 13, 42, 77, 2026]) {
    const s = seance({ seed, minutes: 20 });
    for (let i = 0; i < s.file.length; i++) {
      if (!s.file[i].adjacenceVoulue) continue;
      assert.equal(s.file[i - 1]?.itemId, s.file[i].itemId,
        `séquence soudée rompue à la position ${i}, graine ${seed}`);
    }
  }
});

test("chaque phrase découverte reçoit ses trois exercices d'affilée", () => {
  for (const seed of [3, 11, 2026]) {
    const s = seance({ seed, minutes: 20 });
    const groupes = new Map();
    s.file.forEach((c, i) => {
      if (c.raison !== "decouverte" && c.raison !== "ancrage") return;
      if (!groupes.has(c.itemId)) groupes.set(c.itemId, []);
      groupes.get(c.itemId).push(i);
    });
    for (const [id, positions] of groupes) {
      if (positions.length < 2) continue;
      const contigu = positions.every((p, k) => k === 0 || p === positions[k - 1] + 1);
      assert.ok(contigu, `découverte dispersée pour ${id}, graine ${seed} : ${positions.join(",")}`);
    }
  }
});

test("le diagnostic de file ne cache aucune fusion", () => {
  const s = seance({ seed: 11 });
  const d = s.diagnosticFile;
  assert.equal(d.brutes - d.fusionnees, d.occurrences);
  assert.equal(d.adjacencesAccidentelles, 0);
});

/* ===================================================================
   DOSAGE DES NOUVEAUTÉS
   =================================================================== */

test("le plafond de nouveautés dépend de la durée", () => {
  assert.equal(Sess.maxNouvelles(10), 3);
  assert.equal(Sess.maxNouvelles(20), 5);
  assert.equal(Sess.maxNouvelles(60), 9);
});

test("une séance courte n'ouvre pas plus de trois phrases neuves", () => {
  const s = seance({ minutes: 10 });
  const neuves = new Set(s.file.filter((e) => e.raison === "decouverte").map((e) => e.itemId));
  assert.ok(neuves.size <= 3, `${neuves.size} phrases ouvertes`);
});

test("une séance longue n'ouvre pas plus de neuf phrases neuves", () => {
  const s = seance({ minutes: 60 });
  const neuves = new Set(s.file.filter((e) => e.raison === "decouverte").map((e) => e.itemId));
  assert.ok(neuves.size <= 9, `${neuves.size} phrases ouvertes`);
});

test("la révision passe avant la découverte quand des phrases sont dues", () => {
  const liste = phrases();
  const dues = {};
  for (const p of liste.slice(0, 10)) {
    let e = P.entreeVide();
    e = P.enregistrerPreuve(e, { dim: P.DIM.PRODUCTION, source: P.SOURCE.TRANSCRIPTION, reussi: true }).entree;
    e.dims.production.echeance = Date.now() - 86400000;   // en retard
    dues[p.id] = e;
  }
  const s = seance({ phrases: liste, progressionDe: (id) => dues[id] || vierge() });
  const premiers = s.file.slice(0, 2);
  for (const c of premiers) assert.notEqual(c.raison, "decouverte");
});

/* ===================================================================
   TYPES D'EXERCICE ADMISSIBLES
   =================================================================== */

test("une phrase jamais rencontrée n'apparaît jamais en rappel actif", () => {
  const s = seance({ seed: 3 });
  const interdits = new Set(["rappel", "production", "fluidite", "variation", "test_differe"]);
  for (const c of s.file) {
    if (c.raison !== "decouverte") continue;
    assert.ok(!interdits.has(c.type), `phrase neuve en ${c.type}`);
  }
});

test("une phrase neuve commence toujours par une écoute", () => {
  const s = seance({ seed: 8 });
  const premiers = new Map();
  for (const c of s.file) {
    if (!c.itemId || premiers.has(c.itemId)) continue;
    premiers.set(c.itemId, c);
  }
  for (const [, c] of premiers) {
    if (c.raison !== "decouverte") continue;
    assert.equal(c.type, "ecoute");
  }
});

/* ===================================================================
   FLUX TEMPOREL
   =================================================================== */

test("la séance se clôt sur le temps, pas sur un compteur d'exercices", () => {
  const s = seance({ minutes: 10 });
  Sess.demarrer(s, 0);
  assert.ok(Sess.prochain(s, 0), "un exercice au départ");
  assert.equal(Sess.prochain(s, 10 * 60000), null, "plus rien à la fin du temps");
});

test("le temps restant ne devient jamais négatif", () => {
  const s = seance({ minutes: 5 });
  Sess.demarrer(s, 0);
  assert.equal(Sess.restantMs(s, 999999999), 0);
  assert.equal(Sess.progressionTemps(s, 999999999), 1);
});

test("un exercice trop long pour le temps restant est remplacé, pas coupé", () => {
  const s = seance({ minutes: 20 });
  Sess.demarrer(s, 0);
  s.estimations.dialogue = 60000;
  s.estimations.ecoute = 5000;
  // Il reste 25 secondes utiles.
  const ex = Sess.prochain(s, 20 * 60000 - 45000);
  if (ex) assert.ok((s.estimations[ex.type] || 15000) <= 25000);
});

test("l'estimation s'ajuste sur la durée réellement observée", () => {
  const s = seance();
  Sess.demarrer(s, 0);
  const ex = Sess.prochain(s, 0);
  const avant = s.estimations[ex.type];
  Sess.terminerExercice(s, ex, avant + 20000);
  assert.ok(s.estimations[ex.type] > avant);
});

test("terminer un exercice avance l'index d'exactement un cran", () => {
  const s = seance();
  Sess.demarrer(s, 0);
  const ex = Sess.prochain(s, 0);
  const avant = s.index;
  Sess.terminerExercice(s, ex, 12000);
  assert.equal(s.index, avant + 1);
});

test("sauter une découverte saute aussi les occurrences soudées", () => {
  const s = seance({ seed: 5 });
  Sess.demarrer(s, 0);
  const i = s.file.findIndex((c, k) => c.raison === "decouverte" && !c.adjacenceVoulue
    && s.file[k + 1]?.adjacenceVoulue && s.file[k + 1].itemId === c.itemId);
  if (i < 0) return;
  s.index = i;
  const ex = s.file[i];
  Sess.sauterExercice(s, ex);
  // Aucune occurrence de la même phrase ne doit rester en tête de file.
  assert.notEqual(s.file[s.index]?.itemId, ex.itemId);
});

test("un exercice sauté ne fausse pas l'estimation de durée", () => {
  const s = seance();
  Sess.demarrer(s, 0);
  const ex = Sess.prochain(s, 0);
  const avant = s.estimations[ex.type];
  Sess.sauterExercice(s, ex);
  assert.equal(s.estimations[ex.type], avant);
});

test("le recyclage ne contient aucune phrase absente de la séance", () => {
  // Une phrase ne peut être recyclée que si elle était déjà connue, ou
  // si elle a été ouverte dans cette séance. Jamais une phrase neuve
  // sortie de nulle part à la dernière minute.
  const liste = phrases();
  const prog = {};
  for (const p of liste.slice(0, 5)) prog[p.id] = P.exposer(P.entreeVide());
  const s = seance({ phrases: liste, progressionDe: (id) => prog[id] || vierge() });
  const connus = new Set(Object.keys(prog));
  const dansLaFile = new Set(s.file.filter((c) => c.it).map((c) => c.it.id));
  for (const p of s.recyclage) {
    assert.ok(connus.has(p.id) || dansLaFile.has(p.id),
      `phrase recyclée sans avoir été travaillée : ${p.id}`);
  }
});

test("une toute première séance a de quoi tenir ses vingt minutes", () => {
  // Défaut corrigé : sans réserve, une première séance s'arrêtait au
  // bout de quatre minutes, faute de contenu déjà rencontré.
  const s = seance({ minutes: 20, progressionDe: () => vierge() });
  assert.ok(s.recyclage.length > 0, "aucune réserve pour la fin de séance");
  Sess.demarrer(s, 0);
  assert.ok(Sess.prochain(s, 15 * 60000), "plus rien à faire après quinze minutes");
});

test("le recyclage ne répète jamais la phrase qui vient d'être jouée", () => {
  const liste = phrases();
  const prog = {};
  for (const p of liste.slice(0, 6)) prog[p.id] = P.exposer(P.entreeVide());
  const s = seance({ phrases: liste, minutes: 60, progressionDe: (id) => prog[id] || vierge() });
  Sess.demarrer(s, 0);
  s.index = s.file.length;              // file épuisée, on passe au recyclage
  const a = Sess.prochain(s, 1000);
  s.dernierId = a.it.id;
  const b = Sess.prochain(s, 2000);
  if (s.recyclage.length > 1) assert.notEqual(b.it.id, a.it.id);
});

/* ===================================================================
   MODES
   =================================================================== */

test("le mode révision n'ouvre aucune phrase neuve", () => {
  const liste = phrases();
  const prog = {};
  for (const p of liste.slice(0, 8)) {
    let e = P.enregistrerPreuve(P.entreeVide(), { dim: P.DIM.PRODUCTION, source: P.SOURCE.TRANSCRIPTION, reussi: true }).entree;
    e.dims.production.echeance = Date.now() - 3600000;
    prog[p.id] = e;
  }
  const s = seance({ mode: Sess.MODES.REVISION, phrases: liste, progressionDe: (id) => prog[id] || vierge() });
  for (const c of s.file) assert.notEqual(c.raison, "decouverte");
});

test("le mode dialogue ne propose que des dialogues", () => {
  const s = seance({ mode: Sess.MODES.DIALOGUE });
  assert.ok(s.file.length > 0);
  for (const c of s.file) assert.ok(["ecoute_dialogue", "dialogue"].includes(c.type), c.type);
});

test("le bilan n'invente aucun pourcentage sans mesure probante", () => {
  const s = seance();
  Sess.demarrer(s, 0);
  s.tentatives = 9;
  s.probantes = 0;
  const b = Sess.bilan(s, 60000);
  assert.equal(b.precision, null);
  s.probantes = 4; s.reussites = 3;
  assert.equal(Sess.bilan(s, 60000).precision, 75);
});
