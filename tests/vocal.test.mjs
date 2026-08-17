import test from "node:test";
import assert from "node:assert/strict";

import * as Providers from "../src/speech/provider.js";
import { creerAucun } from "../src/speech/providers/repli.js";
import { creer as creerLuxasr } from "../src/speech/providers/luxasr.js";
import * as Prononciation from "../src/speech/prononciation.js";
import * as Tentatives from "../src/audio/tentative.js";
import { evaluerReponse, NATURE } from "../src/speech/engine.js";
import { CAUSE } from "../src/speech/erreurs.js";

const PHRASE = { id: "px", lb: "Moien", fr: "bonjour", ph: "mo-ï-eune", alt: [], syl: 2, paquet: "pk-saluer" };

/* ---------- Fournisseurs de test ---------- */

function faux({ id, probant, transcripts = [], ok = true, cause = CAUSE.OK, error = "" }) {
  return {
    id, nom: "Faux " + id, langue: "lb", enLigne: false,
    specialise: probant, probant, reserve: "",
    async disponible() { return { ok, cause, resume: error || "" }; },
    async transcrire() { return { providerId: id, transcripts, cause, error, latencyMs: 5, lang: "lb", model: id }; }
  };
}

/** Capture simulée. Aucun micro réel n'est touché. */
const capture = ({ parole = true, octets = 900, errorKind = "none" } = {}) => async () => ({
  ok: parole, errorKind, error: "", blob: octets ? { size: octets, type: "audio/webm" } : null,
  mimeType: "audio/webm", octets,
  vad: {
    speechDetected: parole, speechMs: parole ? 900 : 0,
    snrDb: 22, seuilDb: -45, mesureFiable: true, enveloppe: [], detail: parole ? "" : "Aucune parole."
  }
});

test.beforeEach(() => {
  Providers.reinitialiser();
  Tentatives.reinitialiser();
  Prononciation.reinitialiser();
});

/* ===================================================================
   CONTRAT DES FOURNISSEURS
   =================================================================== */

test("un fournisseur incomplet est refusé à l'enregistrement", () => {
  assert.throws(() => Providers.enregistrer({ id: "x" }), /champ/);
  assert.throws(() => Providers.enregistrer({ nom: "x", langue: "lb", transcrire() {}, disponible() {} }), /identifiant/);
});

test("l'ordre de préférence retient le premier fournisseur disponible", async () => {
  Providers.enregistrer(faux({ id: "a", probant: true, ok: false }));
  Providers.enregistrer(faux({ id: "b", probant: true, ok: true }));
  Providers.definirOrdre(["a", "b"]);
  const r = await Providers.choisir({});
  assert.equal(r.provider.id, "b");
  assert.equal(r.essais.length, 2);
});

test("un fournisseur en ligne est écarté quand le réseau est absent", async () => {
  const enLigne = { ...faux({ id: "cloud", probant: true }), enLigne: true };
  Providers.enregistrer(enLigne);
  Providers.enregistrer(creerAucun());
  Providers.definirOrdre(["cloud", "aucun"]);
  const r = await Providers.choisir({ enLigne: false });
  assert.equal(r.provider.id, "aucun");
});

test("le mode sans reconnaissance est toujours disponible", async () => {
  const a = creerAucun();
  const e = await a.disponible();
  assert.equal(e.ok, true);
  assert.equal(a.probant, false);
});

test("LuxASR se déclare indisponible tant que l'autorisation manque, et dit pourquoi", async () => {
  const p = creerLuxasr({ autorise: () => false });
  const e = await p.disponible();
  assert.equal(e.ok, false);
  assert.match(e.resume, /autoris/i);
  assert.equal(p.probant, true);
  assert.match(p.reserve, /native/i);
});

test("l'état complet expose le caractère probant de chaque fournisseur", async () => {
  Providers.enregistrer(faux({ id: "specialise", probant: true }));
  Providers.enregistrer(faux({ id: "generique", probant: false }));
  const etats = await Providers.etatComplet();
  assert.equal(etats.find((e) => e.id === "specialise").probant, true);
  assert.equal(etats.find((e) => e.id === "generique").probant, false);
});

/* ===================================================================
   TROIS NATURES D'ÉCHEC, JAMAIS CONFONDUES
   =================================================================== */

test("réussite : un moteur probant a transcrit la forme attendue", async () => {
  Providers.enregistrer(faux({ id: "lux", probant: true, transcripts: [{ text: "Moien", confidence: 0.9 }] }));
  Providers.definirOrdre(["lux"]);
  const r = await evaluerReponse(PHRASE, { capturer: capture(), idSession: "s" });
  assert.equal(r.nature, NATURE.REUSSITE);
  assert.equal(r.fiable, true);
  assert.equal(r.ecrivable, true);
});

test("erreur utilisateur : un moteur probant a entendu autre chose", async () => {
  Providers.enregistrer(faux({ id: "lux", probant: true, transcripts: [{ text: "bonjour tout le monde", confidence: 0.9 }] }));
  Providers.definirOrdre(["lux"]);
  const r = await evaluerReponse(PHRASE, { capturer: capture(), idSession: "s" });
  assert.equal(r.nature, NATURE.ERREUR_UTILISATEUR);
  assert.equal(r.ecrivable, true);
});

test("incertitude : un moteur NON probant ne peut jamais imputer une erreur", async () => {
  // Défaut historique : un moteur allemand transcrivait de travers et
  // la progression baissait. Verrou principal de cette version.
  Providers.enregistrer(faux({ id: "navigateur", probant: false, transcripts: [{ text: "complètement autre chose", confidence: 0.9 }] }));
  Providers.definirOrdre(["navigateur"]);
  const r = await evaluerReponse(PHRASE, { capturer: capture(), idSession: "s" });
  assert.notEqual(r.nature, NATURE.ERREUR_UTILISATEUR);
  assert.equal(r.fiable, false);
  assert.equal(r.ecrivable, false);
});

test("panne technique : le service ne répond pas", async () => {
  Providers.enregistrer(faux({ id: "lux", probant: true, transcripts: [], cause: CAUSE.RESEAU, error: "Serveur injoignable." }));
  Providers.definirOrdre(["lux"]);
  const r = await evaluerReponse(PHRASE, { capturer: capture(), idSession: "s" });
  assert.equal(r.nature, NATURE.PANNE_TECHNIQUE);
  assert.equal(r.ecrivable, false);
  assert.match(r.message, /progression n'est pas touchée/i);
});

test("panne technique : le micro est refusé", async () => {
  Providers.enregistrer(faux({ id: "lux", probant: true }));
  Providers.definirOrdre(["lux"]);
  const r = await evaluerReponse(PHRASE, {
    capturer: capture({ parole: false, octets: 0, errorKind: "mic" }), idSession: "s"
  });
  assert.equal(r.nature, NATURE.PANNE_TECHNIQUE);
  assert.equal(r.ecrivable, false);
});

test("aucune parole détectée n'est ni une faute ni une panne", async () => {
  Providers.enregistrer(faux({ id: "lux", probant: true }));
  Providers.definirOrdre(["lux"]);
  const r = await evaluerReponse(PHRASE, { capturer: capture({ parole: false, octets: 0 }), idSession: "s" });
  assert.equal(r.nature, NATURE.INCERTITUDE_MOTEUR);
  assert.equal(r.ecrivable, false);
});

test("le mode sans reconnaissance continue d'enseigner sans rien prétendre", async () => {
  Providers.enregistrer(creerAucun());
  Providers.definirOrdre(["aucun"]);
  const r = await evaluerReponse(PHRASE, { capturer: capture(), idSession: "s" });
  assert.equal(r.nature, NATURE.INCERTITUDE_MOTEUR);
  assert.equal(r.ecrivable, false);
  // La tentative existe quand même : l'écho et le modèle font le travail.
  assert.ok(Tentatives.blobDe(r.attemptId), "la tentative doit rester réécoutable");
});

test("une panne n'est jamais formulée comme une faute de l'apprenant", async () => {
  Providers.enregistrer(faux({ id: "lux", probant: true, transcripts: [], cause: CAUSE.SERVEUR, error: "500" }));
  Providers.definirOrdre(["lux"]);
  const r = await evaluerReponse(PHRASE, { capturer: capture(), idSession: "s" });
  assert.ok(!/réessaie|recommence|pas encore/i.test(r.message), `message accusateur : ${r.message}`);
});

/* ===================================================================
   TENTATIVE ET ÉCHO
   =================================================================== */

test("chaque évaluation crée une tentative identifiée et réécoutable", async () => {
  Providers.enregistrer(faux({ id: "lux", probant: true, transcripts: [{ text: "Moien" }] }));
  Providers.definirOrdre(["lux"]);
  const r = await evaluerReponse(PHRASE, { capturer: capture({ octets: 1234 }), idSession: "s7", idExercice: "ex:px:rappel" });
  assert.ok(r.attemptId);
  assert.equal(Tentatives.blobDe(r.attemptId).size, 1234);
  assert.equal(Tentatives.tentative(r.attemptId).idPhrase, "px");
  assert.equal(Tentatives.tentative(r.attemptId).transcription, "Moien");
});

test("deux évaluations successives gardent chacune leur propre tentative", async () => {
  Providers.enregistrer(faux({ id: "lux", probant: true, transcripts: [{ text: "Moien" }] }));
  Providers.definirOrdre(["lux"]);
  const a = await evaluerReponse(PHRASE, { capturer: capture({ octets: 111 }), idSession: "s" });
  const b = await evaluerReponse(PHRASE, { capturer: capture({ octets: 222 }), idSession: "s" });
  assert.notEqual(a.attemptId, b.attemptId);
  assert.equal(Tentatives.blobDe(a.attemptId).size, 111);
  assert.equal(Tentatives.blobDe(b.attemptId).size, 222);
});

test("sans source de capture, le moteur refuse au lieu de contourner", async () => {
  const r = await evaluerReponse(PHRASE, {});
  assert.equal(r.nature, NATURE.PANNE_TECHNIQUE);
  assert.match(r.error, /capture/i);
});

/* ===================================================================
   PRONONCIATION
   =================================================================== */

test("l'évaluation de la prononciation est indisponible, et le dit", async () => {
  const e = await Prononciation.etat();
  assert.equal(e.disponible, false);
  assert.match(e.message, /non disponible/i);
});

test("aucun score de prononciation n'est jamais produit", async () => {
  const r = await Prononciation.evaluer({ attendu: "Moien" });
  assert.equal(r.disponible, false);
  assert.equal(r.fiable, false);
  // null, jamais 0 : l'absence de mesure n'est pas une mauvaise note.
  assert.equal(r.scoreGlobal, null);
  assert.deepEqual(r.phonemes, []);
});

test("tout résultat d'évaluation vocale rappelle que la prononciation n'est pas mesurée", async () => {
  Providers.enregistrer(faux({ id: "lux", probant: true, transcripts: [{ text: "Moien" }] }));
  Providers.definirOrdre(["lux"]);
  const r = await evaluerReponse(PHRASE, { capturer: capture(), idSession: "s" });
  assert.equal(r.prononciation.disponible, false);
  assert.match(r.prononciation.message, /non disponible/i);
});

test("un fournisseur de prononciation qui ne parle pas luxembourgeois est refusé", () => {
  assert.throws(() => Prononciation.brancher({
    id: "azure", nom: "Azure", langue: "de-DE",
    async disponible() { return { ok: true }; },
    async evaluer() { return { fiable: true, scoreGlobal: 87, phonemes: [] }; }
  }), /luxembourgeois/i);
});

test("un fournisseur luxembourgeois branché devient utilisable", async () => {
  Prononciation.brancher({
    id: "futur", nom: "Futur", langue: "lb-LU",
    async disponible() { return { ok: true, resume: "Prêt." }; },
    async evaluer() { return { fiable: true, scoreGlobal: 0.8, phonemes: [{ phoneme: "m", score: 0.9 }], methode: "alignement" }; }
  });
  const e = await Prononciation.etat();
  assert.equal(e.disponible, true);
  const r = await Prononciation.evaluer({ attendu: "Moien" });
  assert.equal(r.fiable, true);
  assert.equal(r.scoreGlobal, 0.8);
});
