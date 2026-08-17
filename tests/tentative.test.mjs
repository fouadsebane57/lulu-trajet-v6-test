import test from "node:test";
import assert from "node:assert/strict";

import * as T from "../src/audio/tentative.js";

const blob = (taille = 128, type = "audio/webm") => ({ size: taille, type });

test.beforeEach(() => T.reinitialiser());

/* ===================================================================
   LE DÉFAUT QUE CE MODULE EXISTE POUR EMPÊCHER

   Une variable unique « dernier enregistrement » rejouait la tentative
   suivante si la capture avait déjà repris, ou un blob vide si la
   capture avait échoué. Ces trois tests verrouillent le contraire.
   =================================================================== */

test("l'écho rejoue la tentative demandée, pas la plus récente", () => {
  const a = T.enregistrer({ idPhrase: "p1", idExercice: "e1", blob: blob(100) });
  const b = T.enregistrer({ idPhrase: "p2", idExercice: "e2", blob: blob(200) });
  assert.equal(T.blobDe(a.attemptId).size, 100);
  assert.equal(T.blobDe(b.attemptId).size, 200);
});

test("une tentative sans audio ne renvoie jamais le blob d'une autre", () => {
  const bon = T.enregistrer({ idPhrase: "p1", blob: blob(300) });
  const vide = T.enregistrer({ idPhrase: "p1", blob: null });
  assert.equal(T.blobDe(vide.attemptId), null);
  assert.equal(T.blobDe(bon.attemptId).size, 300);
});

test("un blob de taille nulle est traité comme absent", () => {
  const t = T.enregistrer({ idPhrase: "p1", blob: blob(0) });
  assert.equal(T.blobDe(t.attemptId), null);
  assert.equal(t.etat, T.ETAT.VIDE);
});

test("un identifiant inconnu ne renvoie rien plutôt qu'un blob approchant", () => {
  T.enregistrer({ idPhrase: "p1", blob: blob(400) });
  assert.equal(T.blobDe("at-inexistant"), null);
});

test("chaque tentative reçoit un identifiant unique", () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) {
    const t = T.enregistrer({ idSession: "s1", idExercice: "ex:a:production", blob: blob() });
    assert.ok(!ids.has(t.attemptId));
    ids.add(t.attemptId);
  }
});

test("une tentative porte tout ce qu'il faut pour la retrouver", () => {
  const t = T.enregistrer({
    idSession: "s9", idPhrase: "px", idExercice: "ex:px:rappel",
    blob: blob(555, "audio/mp4"), dureeMs: 1400, plateforme: "web"
  });
  assert.equal(t.idSession, "s9");
  assert.equal(t.idPhrase, "px");
  assert.equal(t.idExercice, "ex:px:rappel");
  assert.equal(t.mimeType, "audio/mp4");
  assert.equal(t.octets, 555);
  assert.equal(t.dureeMs, 1400);
  assert.ok(t.horodatage > 0);
  assert.equal(t.etat, T.ETAT.CAPTUREE);
});

test("un échec micro est distingué d'un silence", () => {
  const panne = T.enregistrer({ blob: null, errorKind: "mic" });
  const silence = T.enregistrer({ blob: null, errorKind: "none" });
  assert.equal(panne.etat, T.ETAT.ECHEC);
  assert.equal(silence.etat, T.ETAT.VIDE);
});

/* ===================================================================
   CONFIDENTIALITÉ
   =================================================================== */

test("aucun enregistrement n'est conservé sans consentement", async () => {
  const t = T.enregistrer({ idPhrase: "p1", blob: blob() });
  const r = await T.epingler(t.attemptId);
  assert.equal(r.ok, false);
  assert.equal(r.raison, "consentement_absent");
  assert.equal(T.tentative(t.attemptId).epinglee, false);
});

test("le consentement est faux par défaut", () => {
  assert.equal(T.consentementDonne(), false);
  assert.equal(T.inventaire().consentement, false);
});

test("avec consentement, une tentative peut être épinglée", async () => {
  await T.definirConsentement(true);
  const t = T.enregistrer({ idPhrase: "p1", blob: blob() });
  const r = await T.epingler(t.attemptId);
  assert.equal(r.ok, true);
  assert.equal(T.tentative(t.attemptId).epinglee, true);
});

test("retirer le consentement efface immédiatement tout ce qui existait", async () => {
  await T.definirConsentement(true);
  const t = T.enregistrer({ idPhrase: "p1", blob: blob() });
  await T.epingler(t.attemptId);
  await T.definirConsentement(false);
  assert.equal(T.tentative(t.attemptId), null);
  assert.equal(T.inventaire().enMemoire, 0);
});

test("épingler une tentative sans audio est refusé", async () => {
  await T.definirConsentement(true);
  const t = T.enregistrer({ idPhrase: "p1", blob: null });
  const r = await T.epingler(t.attemptId);
  assert.equal(r.ok, false);
  assert.equal(r.raison, "aucun_audio");
});

test("l'inventaire dit exactement ce qui est conservé", async () => {
  await T.definirConsentement(true);
  const a = T.enregistrer({ idPhrase: "p1", blob: blob(1000) });
  T.enregistrer({ idPhrase: "p2", blob: blob(2000) });
  await T.epingler(a.attemptId);
  const inv = T.inventaire();
  assert.equal(inv.enMemoire, 2);
  assert.equal(inv.epinglees, 1);
  assert.equal(inv.octets, 3000);
  assert.equal(inv.liste.length, 2);
  // Les métadonnées ne transportent jamais l'audio lui-même.
  for (const m of inv.liste) assert.equal(m.blob, undefined);
});

test("supprimer une tentative la retire vraiment", async () => {
  const t = T.enregistrer({ idPhrase: "p1", blob: blob() });
  await T.supprimer(t.attemptId);
  assert.equal(T.tentative(t.attemptId), null);
  assert.equal(T.blobDe(t.attemptId), null);
});

test("tout supprimer ne laisse rien, même les épinglées", async () => {
  await T.definirConsentement(true);
  for (let i = 0; i < 5; i++) {
    const t = T.enregistrer({ idPhrase: "p" + i, blob: blob() });
    await T.epingler(t.attemptId);
  }
  const n = await T.toutSupprimer();
  assert.equal(n, 5);
  assert.equal(T.inventaire().enMemoire, 0);
});

test("un adaptateur de stockage reçoit bien les demandes d'écriture et d'effacement", async () => {
  const ecrits = [];
  const effaces = [];
  T.brancherStockage({
    async ecrireAudio(id) { ecrits.push(id); },
    async supprimerAudio(id) { effaces.push(id); }
  });
  await T.definirConsentement(true);
  const t = T.enregistrer({ idPhrase: "p1", blob: blob() });
  await T.epingler(t.attemptId);
  assert.deepEqual(ecrits, [t.attemptId]);
  await T.supprimer(t.attemptId);
  assert.deepEqual(effaces, [t.attemptId]);
});

/* ===================================================================
   MÉMOIRE BORNÉE
   =================================================================== */

test("la mémoire est purgée sans jamais jeter une tentative épinglée", async () => {
  await T.definirConsentement(true);
  const garde = T.enregistrer({ idPhrase: "garde", blob: blob() });
  await T.epingler(garde.attemptId);
  for (let i = 0; i < T.MAX_EN_MEMOIRE + 20; i++) T.enregistrer({ idPhrase: "jetable", blob: blob() });
  assert.ok(T.inventaire().enMemoire <= T.MAX_EN_MEMOIRE + 1);
  assert.ok(T.tentative(garde.attemptId), "la tentative épinglée a été perdue");
});

test("l'historique d'une phrase est trié du plus récent au plus ancien", async () => {
  const a = T.enregistrer({ idPhrase: "px", blob: blob() });
  await new Promise((r) => setTimeout(r, 5));
  const b = T.enregistrer({ idPhrase: "px", blob: blob() });
  const h = T.historiqueDe("px");
  assert.equal(h.length, 2);
  assert.equal(h[0].attemptId, b.attemptId);
  assert.equal(h[1].attemptId, a.attemptId);
});

test("annoter une tentative n'écrase pas son audio", () => {
  const t = T.enregistrer({ idPhrase: "p1", blob: blob(777) });
  T.annoter(t.attemptId, { transcription: "Moien", provider: "luxasr", verdict: "correct" });
  assert.equal(T.blobDe(t.attemptId).size, 777);
  assert.equal(T.tentative(t.attemptId).transcription, "Moien");
  assert.equal(T.tentative(t.attemptId).provider, "luxasr");
});
