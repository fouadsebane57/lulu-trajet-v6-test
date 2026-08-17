import test from "node:test";
import assert from "node:assert/strict";

import * as Ex from "../src/content/exercices.js";
import * as C from "../src/content/index.js";
import { DIM, MESURABLE } from "../src/core/preuve.js";

test("le catalogue atteint la cible d'exercices", () => {
  const n = Ex.total();
  assert.ok(n >= 1500, `exercices : ${n}, cible 1500 minimum`);
});

test("chaque exercice porte un identifiant unique", () => {
  const vus = new Set();
  for (const e of Ex.catalogue()) {
    assert.ok(e.id, "exercice sans identifiant");
    assert.ok(!vus.has(e.id), `identifiant d'exercice dupliqué : ${e.id}`);
    vus.add(e.id);
  }
});

test("l'identifiant d'un exercice ne dépend d'aucune position", () => {
  // Il doit être reconstructible à partir de la phrase et du type seuls.
  const p = C.phrases()[7];
  assert.equal(Ex.idExercice(p.id, "production"), `ex:${p.id}:production`);
  const e = Ex.catalogue().find((x) => x.idPhrase === p.id && x.type === "production");
  assert.equal(e.id, Ex.idExercice(p.id, "production"));
});

test("chaque exercice pointe vers une phrase ou un dialogue qui existe", () => {
  for (const e of Ex.catalogue()) {
    if (e.idPhrase) assert.ok(C.parId(e.idPhrase), `phrase inexistante : ${e.idPhrase}`);
    else if (e.idDialogue) assert.ok(C.dialogueParId(e.idDialogue), `dialogue inexistant : ${e.idDialogue}`);
    else assert.fail(`exercice orphelin : ${e.id}`);
  }
});

test("aucun exercice ne référence une phrase voisine inexistante", () => {
  for (const e of Ex.catalogue()) {
    if (!e.idAutre) continue;
    assert.ok(C.parId(e.idAutre), `voisin inexistant : ${e.idAutre} dans ${e.id}`);
    assert.notEqual(e.idAutre, e.idPhrase, `une phrase est son propre voisin : ${e.id}`);
  }
});

test("chaque type d'exercice déclare une dimension mesurable, ou aucune", () => {
  for (const t of Ex.LISTE_TYPES) {
    if (t.dim === null) continue;
    assert.ok(MESURABLE[t.dim], `le type ${t.id} vise une dimension non mesurable : ${t.dim}`);
  }
});

test("aucun type d'exercice ne vise la prononciation", () => {
  // Verrou principal de la version. Aucun exercice ne doit pouvoir
  // écrire dans une dimension qu'aucun instrument ne sait mesurer.
  for (const t of Ex.LISTE_TYPES) {
    assert.notEqual(t.dim, DIM.PRONONCIATION, `le type ${t.id} prétend mesurer la prononciation`);
  }
});

test("les exercices d'écoute ne prouvent rien", () => {
  assert.equal(Ex.TYPES.ECOUTE.dim, null);
  assert.equal(Ex.TYPES.ECOUTE_LENTE.dim, null);
  assert.equal(Ex.TYPES.ECOUTE_DIALOGUE.dim, null);
  const ecoutes = Ex.catalogue().filter((e) => e.type === "ecoute");
  for (const e of ecoutes) assert.equal(e.dim, null);
});

test("les exercices oraux demandent réellement de parler", () => {
  const oraux = ["repetition", "rappel", "production", "fluidite", "variation", "dialogue", "test_differe"];
  for (const id of oraux) assert.equal(Ex.typeDe(id).oral, true, `${id} devrait être oral`);
});

test("aucun exercice n'exige de regarder l'écran", () => {
  // Contrainte du mode trajet : tous les types doivent pouvoir se
  // dérouler à l'oreille et à la voix seules.
  for (const t of Ex.LISTE_TYPES) assert.equal(t.ecran, false, `${t.id} exige l'écran`);
  assert.equal(Ex.typesTrajet().length, Ex.LISTE_TYPES.length);
});

test("chaque phrase produit au moins huit exercices distincts", () => {
  for (const p of C.phrases().slice(0, 60)) {
    const liste = Ex.exercicesDePhrase(p.id);
    assert.ok(liste.length >= 8, `${p.id} ne produit que ${liste.length} exercices`);
    const types = new Set(liste.map((e) => e.type));
    assert.equal(types.size, liste.length, `types dupliqués pour ${p.id}`);
  }
});

test("la répartition par type est exacte et couvre toute la taxonomie", () => {
  const r = Ex.repartition();
  const somme = Object.values(r).reduce((a, b) => a + b, 0);
  assert.equal(somme, Ex.total());
  // Chaque type déclaré doit être réellement produit, sinon la
  // taxonomie annonce plus que ce qui existe.
  for (const t of Ex.LISTE_TYPES) {
    assert.ok(r[t.id] > 0, `type déclaré mais jamais produit : ${t.id}`);
  }
});

test("un dialogue produit une écoute et au moins un tour de parole", () => {
  for (const d of C.DIALOGUES()) {
    const liste = Ex.exercicesDeDialogue(d);
    assert.ok(liste.some((e) => e.type === "ecoute_dialogue"), `écoute manquante : ${d.id}`);
    assert.ok(liste.some((e) => e.type === "dialogue"), `tour de parole manquant : ${d.id}`);
  }
});

test("le catalogue est stable entre deux appels", () => {
  const a = Ex.catalogue().map((e) => e.id).join("|");
  const b = Ex.catalogue().map((e) => e.id).join("|");
  assert.equal(a, b);
});

test("réinitialiser le cache reconstruit un catalogue identique", () => {
  const avant = Ex.catalogue().map((e) => e.id);
  Ex.reinitialiserCache();
  const apres = Ex.catalogue().map((e) => e.id);
  assert.deepEqual(apres, avant);
});
