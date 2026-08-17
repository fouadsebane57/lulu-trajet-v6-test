import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import * as C from "../src/content/index.js";

const RACINE = path.join(import.meta.dirname, "..");

/* ===================================================================
   INTÉGRITÉ DE BASE
   =================================================================== */

test("chaque phrase porte un identifiant non vide et unique", () => {
  const vus = new Set();
  for (const p of C.phrases()) {
    assert.ok(p.id && typeof p.id === "string", `identifiant manquant sur ${p.lb}`);
    assert.ok(!vus.has(p.id), `identifiant dupliqué : ${p.id}`);
    vus.add(p.id);
  }
});

test("aucune phrase vide, aucune traduction vide", () => {
  for (const p of C.phrases()) {
    assert.ok(String(p.lb).trim().length > 0, `luxembourgeois vide : ${p.id}`);
    assert.ok(String(p.fr).trim().length > 0, `traduction vide : ${p.id}`);
  }
});

test("chaque phrase porte un statut de vérification connu", () => {
  const connus = new Set(["unverified", "reviewing", "verified"]);
  for (const p of C.phrases()) {
    assert.ok(connus.has(p.st), `statut inconnu sur ${p.id} : ${p.st}`);
  }
});

test("aucune phrase n'est marquée vérifiée sans source", () => {
  for (const p of C.phrases()) {
    if (p.st === "verified") {
      assert.ok(String(p.src || "").trim().length > 0,
        `phrase vérifiée sans source : ${p.id}`);
    }
  }
});

test("aucune phrase n'est vérifiée automatiquement dans ce lot", () => {
  // Le passage en vérifié est un geste humain. Un fichier généré qui
  // contiendrait déjà des vérifiées trahirait une promotion automatique.
  const verifiees = C.phrases().filter((p) => p.st === "verified");
  assert.equal(verifiees.length, 0);
});

test("chaque phrase appartient à un paquet qui existe", () => {
  const ids = new Set([...C.PAQUETS().map((p) => p.id), ...C.MICRO_MODULES().map((m) => m.id)]);
  for (const p of C.phrases()) {
    assert.ok(ids.has(p.paquet), `paquet inconnu : ${p.paquet} (phrase ${p.id})`);
  }
});

test("chaque paquet appartient à un niveau qui existe", () => {
  const niveaux = new Set(C.NIVEAUX().map((n) => n.n));
  for (const pk of C.PAQUETS()) assert.ok(niveaux.has(pk.n), `niveau inconnu : ${pk.id}`);
  for (const m of C.MICRO_MODULES()) assert.ok(niveaux.has(m.n), `niveau inconnu : ${m.id}`);
});

test("aucun paquet n'est vide", () => {
  for (const pk of [...C.PAQUETS(), ...C.MICRO_MODULES()]) {
    assert.ok(C.phrasesDuPaquet(pk.id).length > 0, `paquet vide : ${pk.id}`);
  }
});

/* ===================================================================
   LE PARCOURS COMMENCE PAR PARLER, PAS PAR COMPTER
   =================================================================== */

test("le niveau 1 ne contient aucun paquet de chiffres", () => {
  const n1 = C.paquetsDuNiveau(1);
  assert.ok(n1.length > 0);
  for (const pk of n1) {
    assert.ok(!/chiffre|nombre|alphabet/i.test(pk.t),
      `le niveau 1 ne doit pas commencer par ${pk.t}`);
  }
});

test("les premiers paquets sont des situations de parole", () => {
  const attendus = ["pk-saluer", "pk-politesse", "pk-secours"];
  const debut = C.paquetsDuNiveau(1).slice(0, 3).map((p) => p.id);
  for (const a of attendus) assert.ok(debut.includes(a), `${a} devrait ouvrir le parcours`);
});

test("les chiffres et l'alphabet sont des micro-modules déclenchés", () => {
  for (const m of C.MICRO_MODULES()) {
    assert.ok(m.declencheur, `micro-module sans déclencheur : ${m.id}`);
    const cible = C.paquet(m.declencheur);
    assert.ok(cible, `déclencheur inconnu : ${m.declencheur}`);
  }
});

test("un micro-module de chiffres est bien déclenché par un besoin réel", () => {
  const chiffres = C.MICRO_MODULES().filter((m) => m.id.startsWith("mi-chiffres"));
  assert.ok(chiffres.length >= 4);
  for (const m of chiffres) assert.equal(m.declencheur, "pk-prix-heure");
});

/* ===================================================================
   DÉRIVATIONS

   Règle : une phrase dérivée est une recombinaison de fragments qui
   existent déjà à l'identique. Ce test refait la vérification sur le
   contenu livré, indépendamment du script de construction.
   =================================================================== */

test("chaque phrase dérivée déclare ses sources", () => {
  for (const p of C.phrases()) {
    if (!p.derive) continue;
    assert.ok(Array.isArray(p.de) && p.de.length > 0, `dérivation sans source : ${p.id} ${p.lb}`);
    for (const src of p.de) {
      assert.ok(C.parId(src), `source de dérivation inconnue : ${src} (${p.id})`);
    }
  }
});

test("aucune phrase dérivée n'est marquée autrement que non vérifiée", () => {
  for (const p of C.phrases()) {
    if (p.derive) assert.equal(p.st, "unverified", `dérivée promue : ${p.id}`);
  }
});

test("les fragments d'une phrase dérivée apparaissent dans le corpus attesté", () => {
  const norme = (s) => String(s).normalize("NFC").toLowerCase()
    .replace(/[.,;:!?…«»"'’]/g, " ").replace(/\s+/g, " ").trim();
  const attestees = C.phrases().filter((p) => !p.derive).map((p) => norme(p.lb));
  const dansCorpus = (f) => {
    const x = norme(f);
    return attestees.some((t) => t === x || t.startsWith(x + " ") || t.endsWith(" " + x) || t.includes(" " + x + " "));
  };

  for (const p of C.phrases()) {
    if (!p.derive) continue;
    const mots = norme(p.lb).split(" ");
    // Au moins une découpe cadre/complément doit être entièrement attestée.
    let trouve = false;
    for (let k = 1; k < mots.length && !trouve; k++) {
      if (dansCorpus(mots.slice(0, k).join(" ")) && dansCorpus(mots.slice(k).join(" "))) trouve = true;
    }
    assert.ok(trouve, `dérivation non attestée : « ${p.lb} » (${p.id})`);
  }
});

/* ===================================================================
   RIEN N'A ÉTÉ PERDU DEPUIS LE CORPUS SOURCE
   =================================================================== */

test("les 248 expressions distinctes du corpus source sont toutes reprises", () => {
  const source = path.join(RACINE, "scripts", "corpus-gate25.js");
  if (!fs.existsSync(source)) return;    // corpus non livré, test sans objet
  const bac = { window: {} };
  vm.createContext(bac);
  vm.runInContext(fs.readFileSync(source, "utf8") + "\n;globalThis.__O = { COURS };", bac);
  const ids = new Set();
  for (const l of bac.__O.COURS) for (const i of l.i) ids.add(i.id);

  const repris = new Set(C.phrases().map((p) => p.id));
  const perdus = [...ids].filter((id) => !repris.has(id));
  assert.deepEqual(perdus, [], `expressions perdues : ${perdus.join(", ")}`);
  assert.equal(ids.size, 248);
});

/* ===================================================================
   DIALOGUES
   =================================================================== */

test("chaque dialogue a un identifiant, un niveau et au moins deux répliques", () => {
  const vus = new Set();
  for (const d of C.DIALOGUES()) {
    assert.ok(d.id && !vus.has(d.id), `identifiant de dialogue dupliqué : ${d.id}`);
    vus.add(d.id);
    assert.ok(d.l.length >= 2, `dialogue trop court : ${d.id}`);
    assert.ok(C.NIVEAUX().some((n) => n.n === d.niveau), `niveau inconnu : ${d.id}`);
    for (const r of d.l) {
      assert.ok(["A", "B"].includes(r.q), `rôle inconnu dans ${d.id}`);
      assert.ok(r.lb.trim() && r.fr.trim(), `réplique vide dans ${d.id}`);
    }
  }
});

test("chaque dialogue contient au moins une réplique tenue par l'utilisateur", () => {
  for (const d of C.DIALOGUES()) {
    assert.ok(d.l.some((r) => r.q === "B"), `aucun tour pour l'utilisateur : ${d.id}`);
  }
});

/* ===================================================================
   VOLUME LIVRÉ
   =================================================================== */

test("le contenu livré atteint la cible annoncée", () => {
  const c = C.chiffres();
  assert.ok(c.phrases >= 300, `phrases : ${c.phrases}, cible 300 minimum`);
  assert.ok(c.dialogues >= 10, `dialogues : ${c.dialogues}`);
  assert.equal(c.niveaux, 5);
});

test("les compteurs affichés correspondent au contenu réel", () => {
  const c = C.chiffres();
  assert.equal(c.phrases, C.phrases().length);
  assert.equal(c.reprises + c.derivees, c.phrases);
  assert.equal(c.statuts.unverified + c.statuts.reviewing + c.statuts.verified, c.phrases);
});
