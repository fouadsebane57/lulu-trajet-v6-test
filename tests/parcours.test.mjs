import test from "node:test";
import assert from "node:assert/strict";

import * as C from "../src/content/index.js";
import * as Sess from "../src/core/session.js";
import * as Sched from "../src/core/scheduler.js";
import * as P from "../src/core/preuve.js";
import * as S from "../src/core/state.js";
import * as Profil from "../src/core/profil.js";
import * as Providers from "../src/speech/provider.js";
import * as Tentatives from "../src/audio/tentative.js";
import { evaluerReponse, NATURE } from "../src/speech/engine.js";
import { TYPES, typeDe } from "../src/content/exercices.js";
import { CAUSE } from "../src/speech/erreurs.js";

/* ===================================================================
   PARCOURS COMPLET

   Ce test rejoue une séance entière, exercice par exercice, sans
   micro, sans réseau et sans écran. Il vérifie ce qu'aucun test
   unitaire ne peut vérifier : que l'enchaînement complet tient debout
   et que les règles ne se contredisent pas une fois assemblées.

   Ce qui est simulé : la capture audio et le moteur de reconnaissance.
   Ce qui est RÉEL : le contenu, la file, l'ordonnanceur, les preuves,
   les tentatives, le profil, l'état et la clôture.
   =================================================================== */

function stockageMemoire() {
  const m = new Map();
  return {
    async lire(c) { return m.has(c) ? m.get(c) : null; },
    async ecrire(c, v) { m.set(c, v); return true; },
    async supprimer(c) { m.delete(c); return true; },
    async lister(p = "") { return [...m.keys()].filter((k) => k.startsWith(p)); }
  };
}

/** Capture simulée : l'apprenant parle toujours. */
const capture = (octets = 900) => async () => ({
  ok: true, errorKind: "none", error: "",
  blob: { size: octets, type: "audio/webm" }, mimeType: "audio/webm", octets,
  vad: { speechDetected: true, speechMs: 900, snrDb: 21, seuilDb: -45, mesureFiable: true, enveloppe: [] }
});

/**
 * Moteur luxembourgeois simulé.
 * `justesse` fixe la proportion de réponses correctes, de façon
 * déterministe : le test doit donner le même résultat à chaque
 * exécution.
 */
function moteurSimule(justesse) {
  let n = 0;
  return {
    id: "lux-simule", nom: "LuxASR simulé", langue: "lb",
    enLigne: false, specialise: true, probant: true, reserve: "",
    async disponible() { return { ok: true, cause: CAUSE.OK, resume: "" }; },
    async transcrire({ attendu }) {
      n += 1;
      const juste = (n % 10) < justesse * 10;
      return {
        providerId: "lux-simule",
        transcripts: [{ text: juste ? attendu : "eppes anescht", confidence: 0.9 }],
        cause: CAUSE.OK, error: "", latencyMs: 40, lang: "lb", model: "simule"
      };
    }
  };
}

/**
 * Déroule une séance entière.
 * Le temps est simulé : chaque exercice consomme sa durée estimée.
 */
async function derouler({ minutes = 20, justesse = 0.8, phrases, progressionInitiale = {}, maintenant = Date.now() } = {}) {
  S.reinitialiserModule();
  S.brancherStockage(stockageMemoire());
  await S.charger();
  for (const [id, e] of Object.entries(progressionInitiale)) S.state().progress[id] = e;

  Tentatives.reinitialiser();
  Providers.reinitialiser();
  Providers.enregistrer(moteurSimule(justesse));
  Providers.definirOrdre(["lux-simule"]);

  const liste = phrases || C.phrases().filter((p) => p.niveau <= 1);
  const s = Sess.creerSeance({
    mode: Sess.MODES.TRAJET,
    dureeMinutes: minutes,
    phrases: liste,
    dialogues: C.dialoguesDuNiveau(1),
    progressionDe: (id) => S.progressionDe(id),
    seed: 2026,
    // Les échéances des preuves sont des instants réels. Construire la
    // séance à l'instant zéro rendrait toute phrase « pas encore due ».
    maintenant
  });

  Sess.demarrer(s, 0);
  let horloge = 0;
  const journal = [];
  let garde = 0;

  while (garde++ < 5000) {
    const ex = Sess.prochain(s, horloge);
    if (!ex) break;
    const t = typeDe(ex.type);
    const duree = s.estimations[ex.type] || 15000;

    if (ex.type === TYPES.ECOUTE.id || ex.type === TYPES.ECOUTE_LENTE.id
        || ex.type === TYPES.COMPREHENSION.id || ex.type === TYPES.NOMBRE.id
        || ex.type === TYPES.ECOUTE_DIALOGUE.id) {
      // Écoute pure : exposition, aucune preuve.
      if (ex.it) S.enregistrerExposition(ex.it.id);
      journal.push({ type: ex.type, id: ex.it?.id, ecrit: false });
    } else if (ex.it) {
      const r = await evaluerReponse(ex.it, {
        capturer: capture(),
        idSession: s.idSession,
        idExercice: ex.id || `${ex.it.id}:${ex.type}`,
        enLigne: false
      });
      s.tentatives += 1;
      if (r.fiable) s.probantes += 1;
      if (r.nature === NATURE.REUSSITE) s.reussites += 1;

      let ecrit = false;
      if (r.ecrivable && t?.dim) {
        ecrit = S.enregistrerPreuve(ex.it.id, {
          dim: t.dim, source: P.SOURCE.TRANSCRIPTION,
          reussi: r.nature === NATURE.REUSSITE,
          avecIndice: ex.type === TYPES.REPETITION.id,
          latenceMs: r.totalMs, attemptId: r.attemptId
        }).ecrit;
      }
      S.noterProfil(r);
      journal.push({ type: ex.type, id: ex.it.id, nature: r.nature, ecrit, attemptId: r.attemptId });
    } else {
      journal.push({ type: ex.type, ecrit: false });
    }

    Sess.terminerExercice(s, ex, duree);
    horloge += duree;
  }

  return { seance: s, journal, horloge, bilan: Sess.bilan(s, horloge) };
}

/* =================================================================== */

test("une séance de vingt minutes se déroule entièrement sans blocage", async () => {
  const { journal, horloge, bilan } = await derouler({ minutes: 20 });
  assert.ok(journal.length >= 20, `seulement ${journal.length} exercices joués`);
  assert.ok(horloge <= 20 * 60000, "la séance a dépassé son temps");
  assert.ok(horloge >= 17 * 60000, `séance trop courte : ${Math.round(horloge / 60000)} min`);
  assert.equal(bilan.minutesCible, 20);
});

test("la séance ne se termine jamais au milieu d'un exercice", async () => {
  const { seance: s, horloge } = await derouler({ minutes: 20 });
  // Tout ce qui a été entamé a été mené à son terme.
  const inacheves = s.historique.filter((h) => !h.saute && !(h.dureeMs > 0));
  assert.deepEqual(inacheves, []);
  assert.ok(Sess.restantMs(s, horloge) >= 0);
});

test("la première rencontre d'une phrase est toujours une écoute", async () => {
  const { journal } = await derouler({ minutes: 20 });
  const vus = new Set();
  for (const e of journal) {
    if (!e.id || vus.has(e.id)) continue;
    vus.add(e.id);
    assert.ok(["ecoute", "ecoute_lente"].includes(e.type),
      `la phrase ${e.id} a démarré en ${e.type}`);
  }
});

test("aucune écoute n'écrit de preuve, même après vingt minutes", async () => {
  const { journal } = await derouler({ minutes: 20 });
  for (const e of journal) {
    if (["ecoute", "ecoute_lente", "comprehension", "nombre", "ecoute_dialogue"].includes(e.type)) {
      assert.equal(e.ecrit, false, `${e.type} a écrit une preuve`);
    }
  }
});

test("chaque tour de parole laisse une tentative réécoutable", async () => {
  const { journal } = await derouler({ minutes: 20 });
  const oraux = journal.filter((e) => e.attemptId);
  assert.ok(oraux.length > 0, "aucun tour de parole dans la séance");

  // La mémoire est volontairement bornée : les plus anciennes
  // tentatives non épinglées sortent. Les récentes, elles, doivent
  // toutes être retrouvables, avec la bonne phrase.
  const recentes = oraux.slice(-Tentatives.MAX_EN_MEMOIRE);
  for (const e of recentes) {
    const t = Tentatives.tentative(e.attemptId);
    assert.ok(t, `tentative récente perdue : ${e.attemptId}`);
    assert.equal(t.idPhrase, e.id);
  }
  assert.ok(Tentatives.inventaire().enMemoire <= Tentatives.MAX_EN_MEMOIRE + 1,
    "la mémoire des tentatives n'est plus bornée");
});

test("deux tours de parole ne partagent jamais la même tentative", async () => {
  const { journal } = await derouler({ minutes: 20 });
  const ids = journal.filter((e) => e.attemptId).map((e) => e.attemptId);
  assert.equal(new Set(ids).size, ids.length, "un identifiant de tentative a été réutilisé");
});

test("le plafond de nouveautés est tenu sur toute la séance", async () => {
  const { journal, seance: s } = await derouler({ minutes: 20 });
  const ouvertes = new Set(journal.filter((e) => e.id).map((e) => e.id));
  assert.ok(s.nouvellesIntroduites <= s.plafondNouvelles,
    `${s.nouvellesIntroduites} nouveautés pour un plafond de ${s.plafondNouvelles}`);
  assert.ok(ouvertes.size >= 3, "la séance n'a presque rien travaillé");
});

test("après la séance, la progression repose uniquement sur des preuves", async () => {
  const { journal } = await derouler({ minutes: 20, justesse: 1 });
  const ecrites = new Set(journal.filter((e) => e.ecrit).map((e) => e.id));
  for (const p of C.phrases()) {
    const e = S.progressionDe(p.id);
    const aUneDimension = P.DIMENSIONS.some((d) => P.niveau(e, d) > 0);
    if (aUneDimension) {
      assert.ok(ecrites.has(p.id), `${p.id} a une dimension sans preuve écrite`);
    }
  }
});

test("une séance parfaitement réussie ne rend aucune phrase solide le jour même", async () => {
  // Verrou contre l'illusion de maîtrise. La solidité exige un délai
  // réel entre la première et la dernière réussite.
  await derouler({ minutes: 20, justesse: 1 });
  const solides = C.phrases().filter((p) => Sched.estSolide(S.progressionDe(p.id)));
  assert.deepEqual(solides.map((p) => p.id), []);
});

test("une séance entièrement ratée ne descend jamais sous zéro", async () => {
  await derouler({ minutes: 20, justesse: 0 });
  for (const p of C.phrases()) {
    const e = S.progressionDe(p.id);
    for (const d of P.DIMENSIONS) assert.ok(P.niveau(e, d) >= 0);
  }
});

test("la prononciation reste à zéro quoi qu'il arrive pendant la séance", async () => {
  await derouler({ minutes: 20, justesse: 1 });
  for (const p of C.phrases()) {
    assert.equal(P.niveau(S.progressionDe(p.id), P.DIM.PRONONCIATION), 0);
  }
});

test("le profil vocal se remplit à partir des tentatives réelles", async () => {
  await derouler({ minutes: 20, justesse: 0.5 });
  const r = Profil.resume(S.state().profilVocal, (id) => C.parId(id)?.paquet || "");
  assert.ok(r.tentatives > 0, "aucune tentative enregistrée dans le profil");
  assert.ok(r.latenceMoyenneMs === null || r.latenceMoyenneMs >= 0);
  assert.deepEqual(r.sonsDifficiles, []);
});

test("le bilan ne compte comme vérifiées que les tentatives probantes", async () => {
  const { bilan } = await derouler({ minutes: 20, justesse: 0.8 });
  assert.ok(bilan.probantes <= bilan.tentatives);
  assert.ok(bilan.reussites <= bilan.probantes);
  if (bilan.probantes > 0) {
    assert.equal(bilan.precision, Math.round((bilan.reussites / bilan.probantes) * 100));
  } else {
    assert.equal(bilan.precision, null);
  }
});

test("une deuxième séance reprend ce qui est dû plutôt que d'ouvrir du neuf", async () => {
  // Première séance : on ouvre quelques phrases.
  await derouler({ minutes: 20, justesse: 1 });
  const acquis = JSON.parse(JSON.stringify(S.state().progress));

  // On avance d'un mois : tout ce qui a été travaillé est redevenu dû.
  const unMois = 30 * 86400000;
  for (const e of Object.values(acquis)) {
    for (const d of Object.values(e.dims)) if (d.echeance) d.echeance -= unMois;
  }

  const { journal } = await derouler({ minutes: 20, justesse: 1, progressionInitiale: acquis });
  const dejaVues = new Set(Object.keys(acquis));
  const dixPremiers = journal.filter((e) => e.id).slice(0, 10);
  const reprises = dixPremiers.filter((e) => dejaVues.has(e.id)).length;

  // L'entrelacement est de deux reprises pour une découverte, et une
  // découverte coûte trois exercices. Le maximum atteignable sur dix
  // exercices est donc de quatre à cinq reprises, pas dix : ouvrir du
  // neuf reste nécessaire, il ne doit simplement jamais passer devant.
  assert.ok(reprises >= 4,
    `seulement ${reprises} reprises sur les dix premiers exercices de la deuxième séance`);
  assert.equal(journal.filter((e) => e.id).slice(0, 2).every((e) => dejaVues.has(e.id)), true,
    "la deuxième séance devrait commencer par des reprises");
});

test("le déroulé complet est reproductible à graine identique", async () => {
  const a = await derouler({ minutes: 20, justesse: 0.8 });
  const b = await derouler({ minutes: 20, justesse: 0.8 });
  const trace = (r) => r.journal.map((e) => `${e.type}:${e.id || ""}:${e.nature || ""}`).join("|");
  assert.equal(trace(a), trace(b));
});

test("sans aucun moteur de reconnaissance, la séance enseigne quand même", async () => {
  S.reinitialiserModule();
  S.brancherStockage(stockageMemoire());
  await S.charger();
  Tentatives.reinitialiser();
  Providers.reinitialiser();
  const { creerAucun } = await import("../src/speech/providers/repli.js");
  Providers.enregistrer(creerAucun());
  Providers.definirOrdre(["aucun"]);

  const liste = C.phrases().filter((p) => p.niveau <= 1);
  const s = Sess.creerSeance({
    mode: Sess.MODES.TRAJET, dureeMinutes: 10, phrases: liste,
    dialogues: [], progressionDe: (id) => S.progressionDe(id), seed: 5, maintenant: 0
  });
  Sess.demarrer(s, 0);

  let horloge = 0, joues = 0, tentativesGardees = 0, garde = 0;
  while (garde++ < 2000) {
    const ex = Sess.prochain(s, horloge);
    if (!ex) break;
    if (ex.it && typeDe(ex.type)?.oral) {
      const r = await evaluerReponse(ex.it, { capturer: capture(), idSession: s.idSession, enLigne: false });
      assert.equal(r.ecrivable, false, "un moteur absent ne doit rien écrire");
      if (Tentatives.blobDe(r.attemptId)) tentativesGardees++;
    } else if (ex.it) {
      S.enregistrerExposition(ex.it.id);
    }
    const duree = s.estimations[ex.type] || 15000;
    Sess.terminerExercice(s, ex, duree);
    horloge += duree;
    joues++;
  }

  assert.ok(joues >= 15, `séance trop courte sans moteur : ${joues} exercices`);
  assert.ok(tentativesGardees > 0, "aucune tentative réécoutable en mode autonome");
  // Des expositions ont bien été enregistrées : l'apprentissage continue.
  const exposees = liste.filter((p) => S.progressionDe(p.id).signaux.nombreExpositions > 0);
  assert.ok(exposees.length > 0, "aucune exposition enregistrée");
});
