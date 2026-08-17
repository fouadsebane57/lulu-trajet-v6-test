import test from "node:test";
import assert from "node:assert/strict";

import * as S from "../src/core/state.js";
import * as P from "../src/core/preuve.js";
import * as Plateforme from "../src/platform/index.js";

function memoire(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    async lire(c) { return m.has(c) ? m.get(c) : null; },
    async ecrire(c, v) { m.set(c, v); return true; },
    async supprimer(c) { m.delete(c); return true; },
    async lister(p = "") { return [...m.keys()].filter((k) => k.startsWith(p)); }
  };
}

test.beforeEach(() => S.reinitialiserModule());

/* ===================================================================
   MIGRATION

   Règle héritée et maintenue : une progression ancienne, obtenue par
   de l'écoute et de l'auto-évaluation, n'est PAS une preuve. Elle est
   conservée comme historique et n'ouvre aucun droit.
   =================================================================== */

test("sans état antérieur, on démarre proprement", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  assert.equal(S.state().schema, S.SCHEMA);
  assert.deepEqual(S.state().progress, {});
  assert.equal(S.rapportMigration().trouve, "");
});

test("un état 5.1.0 est repris comme historique, jamais comme preuve", async () => {
  const ancien = {
    progress: {
      a1: { comprehension: 6, production: 5, seen: 30, lastSeen: Date.now() },
      b2: { comprehension: 3, production: 3, seen: 12, lastSeen: Date.now() }
    },
    journal: { sessions: 40, minutes: 900 },
    settings: { duree: 40, echo: false, voiceRate: 0.7 }
  };
  S.brancherStockage(memoire({ "lulu:v5": JSON.stringify(ancien) }));
  await S.charger();

  const r = S.rapportMigration();
  assert.equal(r.trouve, "lulu:v5");
  assert.equal(r.expressions, 2);
  assert.equal(r.ok, true);
  assert.deepEqual(r.refus, []);

  for (const id of ["a1", "b2"]) {
    const e = S.progressionDe(id);
    for (const d of P.DIMENSIONS) {
      assert.equal(P.niveau(e, d), 0, `${id}.${d} promu en preuve`);
    }
    assert.ok(P.aHistorique(e), `${id} a perdu son historique`);
  }
  assert.equal(P.niveauHistorique(S.progressionDe("a1"), P.DIM.COMPREHENSION), 6);
});

test("un état antérieur déjà dimensionné repart malgré tout de zéro", async () => {
  // Cas le plus dangereux : l'ancien état a la MÊME forme que le
  // nouveau, dimensions comprises. Le recopier tel quel importerait
  // des preuves obtenues sous d'autres règles de mesure.
  const t = Date.now();
  const ancien = {
    progress: {
      z1: {
        schema: 6,
        dims: {
          comprehension: { n: 6, reussites: 6, echecs: 0, avecIndice: 0, sansIndice: 6, premier: t, dernier: t, echeance: t },
          production: { n: 6, reussites: 6, echecs: 0, avecIndice: 0, sansIndice: 6, premier: t, dernier: t, echeance: t }
        },
        signaux: { nombreExpositions: 12 },
        latences: []
      }
    }
  };
  S.brancherStockage(memoire({ "lulu:v6-gate": JSON.stringify(ancien) }));
  await S.charger();

  const e = S.progressionDe("z1");
  for (const d of P.DIMENSIONS) {
    assert.equal(P.niveau(e, d), 0, `${d} importé tel quel depuis l'ancien état`);
  }
  assert.equal(S.rapportMigration().ok, true);
});

test("les réglages de l'ancienne version sont repris", async () => {
  S.brancherStockage(memoire({
    "lulu:v5": JSON.stringify({ progress: { x: { n: 2 } }, settings: { duree: 40, echo: false, voiceRate: 0.7 } })
  }));
  await S.charger();
  assert.equal(S.state().reglages.duree, 40);
  assert.equal(S.state().reglages.echo, false);
  assert.equal(S.state().reglages.vitesseVoix, 0.7);
});

test("une sauvegarde de l'ancien état est écrite avant toute migration", async () => {
  const st = memoire({ "lulu:v5": JSON.stringify({ progress: { x: { n: 3 } } }) });
  S.brancherStockage(st);
  await S.charger();
  const brut = await st.lire(S.CLE_SAUVEGARDE);
  assert.ok(brut, "aucune sauvegarde écrite");
  assert.equal(JSON.parse(brut).cle, "lulu:v5");
});

test("le retour arrière restaure l'état d'avant migration", async () => {
  const st = memoire({ "lulu:v5": JSON.stringify({ progress: { x: { n: 3 } } }) });
  S.brancherStockage(st);
  await S.charger();
  const r = await S.restaurerAvantMigration();
  assert.equal(r.ok, true);
  assert.equal(await st.lire(S.CLE_V6), null);
  assert.ok(await st.lire("lulu:v5"));
});

test("un état V6 existant est relu sans repasser par la migration", async () => {
  const st = memoire();
  S.brancherStockage(st);
  await S.charger();
  S.enregistrerPreuve("z9", { dim: P.DIM.PRODUCTION, source: P.SOURCE.TRANSCRIPTION, reussi: true });
  await S.sauver({ immediat: true });

  S.reinitialiserModule();
  S.brancherStockage(st);
  await S.charger();
  assert.ok(P.niveau(S.progressionDe("z9"), P.DIM.PRODUCTION) > 0, "la progression V6 a été perdue");
});

/* ===================================================================
   PORTE D'ÉCRITURE UNIQUE
   =================================================================== */

test("l'état refuse une preuve venant d'une source non probante", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  const r = S.enregistrerPreuve("p1", { dim: P.DIM.PRODUCTION, source: P.SOURCE.AUTO_EVALUATION, reussi: true });
  assert.equal(r.ecrit, false);
  assert.equal(r.raison, "source_non_probante");
  assert.equal(P.niveau(S.progressionDe("p1"), P.DIM.PRODUCTION), 0);
});

test("l'état refuse toute écriture dans la prononciation", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  const r = S.enregistrerPreuve("p1", { dim: P.DIM.PRONONCIATION, source: P.SOURCE.TRANSCRIPTION, reussi: true });
  assert.equal(r.ecrit, false);
  assert.equal(r.raison, "dimension_non_mesurable");
});

test("une exposition est enregistrée sans faire monter de dimension", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  S.enregistrerExposition("p1");
  S.enregistrerExposition("p1");
  const e = S.progressionDe("p1");
  assert.equal(e.signaux.nombreExpositions, 2);
  for (const d of P.DIMENSIONS) assert.equal(P.niveau(e, d), 0);
});

/* ===================================================================
   VÉRIFICATION DU CONTENU
   =================================================================== */

test("passer une phrase en vérifié sans source est refusé", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  const r = S.definirStatut("p1", "verified", { source: "   " });
  assert.equal(r.ok, false);
  assert.equal(r.raison, "source_obligatoire");
  assert.equal(S.statutDe({ id: "p1", st: "unverified" }), "unverified");
});

test("avec une source, la vérification est acceptée et prime sur le fichier", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  const r = S.definirStatut("p1", "verified", { source: "lod.lu, entrée Moien, consultée le 16 août 2026" });
  assert.equal(r.ok, true);
  assert.equal(S.statutDe({ id: "p1", st: "unverified" }), "verified");
});

test("le statut en cours de relecture n'exige pas de source", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  assert.equal(S.definirStatut("p1", "reviewing").ok, true);
  assert.equal(S.definirStatut("p1", "n_importe_quoi").ok, false);
});

/* ===================================================================
   EXPORT ET IMPORT
   =================================================================== */

test("l'export ne contient aucun enregistrement audio", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  const d = S.exporter();
  const texte = JSON.stringify(d);
  assert.ok(!texte.includes("blob"), "l'export transporte de l'audio");
  assert.ok(!texte.includes("attemptId") || !texte.includes("audio/"), "l'export transporte de l'audio");
  assert.equal(d.format, "lulu-trajet");
  assert.equal(d.schema, S.SCHEMA);
});

test("un import d'une autre version est refusé au lieu d'être deviné", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  const r = await S.importer({ format: "lulu-trajet", schema: 3, progress: {} });
  assert.equal(r.ok, false);
  assert.equal(r.raison, "schema_incompatible");
});

test("un aller-retour export puis import conserve la progression", async () => {
  S.brancherStockage(memoire());
  await S.charger();
  S.enregistrerPreuve("k1", { dim: P.DIM.RAPPEL, source: P.SOURCE.TRANSCRIPTION, reussi: true });
  const sauvegarde = JSON.parse(JSON.stringify(S.exporter()));

  S.reinitialiserModule();
  S.brancherStockage(memoire());
  await S.charger();
  assert.equal(P.niveau(S.progressionDe("k1"), P.DIM.RAPPEL), 0);

  const r = await S.importer(sauvegarde);
  assert.equal(r.ok, true);
  assert.ok(P.niveau(S.progressionDe("k1"), P.DIM.RAPPEL) > 0);
});

/* ===================================================================
   PLATEFORME
   =================================================================== */

test("l'adaptateur mémoire remplit tout le contrat de stockage", async () => {
  const p = Plateforme.creerMemoire();
  await p.stockage.ecrire("a", "1");
  assert.equal(await p.stockage.lire("a"), "1");
  assert.deepEqual(await p.stockage.lister(""), ["a"]);
  await p.stockage.supprimer("a");
  assert.equal(await p.stockage.lire("a"), null);
});

test("l'adaptateur web déclare honnêtement ses limites", () => {
  const p = Plateforme.creerWeb();
  const c = p.capacites();
  assert.equal(c.audioArrierePlan, false, "le web ne sait pas jouer écran verrouillé");
  assert.equal(c.ecranVerrouille, false);
  assert.equal(c.sessionAudioPilotable, false);
  assert.match(c.note, /verrouillage/i);
});

test("l'adaptateur natif n'affirme jamais avoir été vérifié sur appareil", () => {
  const p = Plateforme.creerNatif({ estNatif: true, Preferences: null, SessionAudio: null });
  const c = p.capacites();
  assert.equal(c.verifieSurAppareil, false);
  assert.match(c.note, /vérifiée sur un iPhone/i);
});

test("la préparation de session natives échoue proprement sans pont", async () => {
  const p = Plateforme.creerNatif({ estNatif: true });
  const r = await p.audio.preparerSession("mixte");
  assert.equal(r.ok, false);
  assert.match(r.note, /pont/i);
});

test("la session mixte annonce le passage du Bluetooth en mono", async () => {
  const appels = [];
  const p = Plateforme.creerNatif({
    estNatif: true,
    SessionAudio: { async configurer(c) { appels.push(c); }, async liberer() {} }
  });
  const r = await p.audio.preparerSession("mixte");
  assert.equal(r.ok, true);
  assert.equal(appels[0].categorie, "playAndRecord");
  assert.match(r.note, /mono/i);
});

test("hors navigateur, la détection retombe sur l'adaptateur mémoire", () => {
  const p = Plateforme.detecter();
  assert.equal(p.id, Plateforme.PLATEFORME.MEMOIRE);
});
