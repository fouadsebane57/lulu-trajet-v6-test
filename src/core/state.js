/* ===================================================================
   ÉTAT APPLICATIF

   Source de vérité côté client. Le stockage passe par un ADAPTATEUR,
   jamais par `localStorage` en direct : c'est ce qui permet à la même
   logique de tourner dans le navigateur, sous Capacitor et dans les
   tests, sans branche conditionnelle éparpillée.

   MIGRATION

   L'état 5.1.0 et l'état GATE 2.5 sont relus, jamais écrasés. Une
   sauvegarde de l'ancien état est conservée avant toute écriture, et
   la restauration est possible à tout moment.

   Règle de migration, héritée et maintenue : une écoute ancienne ne
   devient JAMAIS une compétence prouvée. L'historique est conservé et
   affiché à part, sous « progression historique ». Le confondre avec
   une preuve prolongerait indéfiniment une illusion de niveau.
   =================================================================== */

import * as Preuve from "./preuve.js";
import * as Profil from "./profil.js";

export const CLE_V6 = "lulu:v6";
export const CLE_SAUVEGARDE = "lulu:v6:sauvegarde-avant-migration";
export const CLES_ANCIENNES = ["lulu:v6-gate", "lulu:v5", "letz:v5", "letz:v4", "lux:prog"];
export const SCHEMA = 6;

export const DEFAUTS = {
  schema: SCHEMA,
  progress: {},
  profilVocal: Profil.profilVide(),
  journal: { sessions: 0, minutes: 0, last: null, streak: 0, hist: {} },
  reglages: {
    duree: 20,
    mode: "trajet",              // trajet | arret
    reconnaissance: "auto",      // auto | luxasr | navigateur | aucun
    profilAudio: "voiture",
    attenteMaxMs: 4500,
    paroleMaxMs: 9000,
    vitesseVoix: 0.85,
    voixLb: "", voixFr: "",
    echo: true,
    astuces: true,
    // Conservation des enregistrements. Faux par défaut, sans exception.
    conserverMaVoix: false
  },
  parcours: { niveau: 1, paquet: "", paquetsTermines: {} },
  reprise: { mode: "", idPhrase: "", position: 0, dateMs: 0, minutes: 0, terminee: true },
  verification: {},              // idPhrase -> { st, src, par, le }
  appareil: ""
};

let etat = structuredClone(DEFAUTS);
let stockage = null;
let rapport = null;

export const state = () => etat;
export const rapportMigration = () => rapport;

export function brancherStockage(adaptateur) { stockage = adaptateur; }

/* ---------- Chargement ---------- */

export async function charger() {
  if (!stockage) throw new Error("Aucun adaptateur de stockage branché.");

  const brut = await stockage.lire(CLE_V6);
  if (brut) {
    const v = parse(brut);
    if (v?.schema === SCHEMA) {
      etat = fusionner(structuredClone(DEFAUTS), v);
      normaliserProgression();
      await assurerAppareil();
      return etat;
    }
  }

  // Aucun état V6 : on tente une reprise des états antérieurs.
  const m = await migrer();
  rapport = m.rapport;
  etat = m.etat;
  normaliserProgression();
  await assurerAppareil();
  await sauver();
  return etat;
}

function parse(s) { try { return JSON.parse(s); } catch (_) { return null; } }

function normaliserProgression() {
  for (const k of Object.keys(etat.progress)) etat.progress[k] = Preuve.normaliser(etat.progress[k]);
  etat.profilVocal = Profil.normaliser(etat.profilVocal);
}

async function assurerAppareil() {
  if (etat.appareil) return;
  try {
    etat.appareil = (globalThis.crypto?.randomUUID?.()) || ("dev-" + Date.now().toString(36));
  } catch (_) { etat.appareil = "dev-" + Date.now().toString(36); }
}

/* ---------- Migration ---------- */

/**
 * Reprend un état antérieur.
 *
 * Ce qui est repris : la progression, sous forme d'HISTORIQUE.
 * Ce qui n'est PAS repris : les niveaux, comme s'ils étaient prouvés.
 *
 * Le contrôle de sortie est simple et vérifiable : aucune dimension
 * mesurée ne doit être non nulle après migration. Si c'était le cas,
 * une donnée non fiable serait devenue une preuve.
 */
export async function migrer() {
  const nouvel = structuredClone(DEFAUTS);
  const r = { trouve: "", expressions: 0, historiques: 0, refus: [], ok: true };

  let ancien = null;
  for (const cle of CLES_ANCIENNES) {
    const brut = await stockage.lire(cle);
    const v = brut ? parse(brut) : null;
    if (v && (v.progress || v.prog)) { ancien = v; r.trouve = cle; break; }
  }
  if (!ancien) return { etat: nouvel, rapport: { ...r, trouve: "", ok: true } };

  // Sauvegarde avant toute écriture. Le retour arrière reste possible.
  await stockage.ecrire(CLE_SAUVEGARDE, JSON.stringify({ cle: r.trouve, date: Date.now(), etat: ancien }));

  const source = ancien.progress || ancien.prog || {};
  for (const [id, valeur] of Object.entries(source)) {
    const normalisee = Preuve.normaliser(valeur);
    // On ne garde QUE l'héritage. Les dimensions repartent à zéro.
    const propre = Preuve.entreeVide();
    propre.legacy = normalisee.legacy || legacyDepuis(valeur);
    propre.signaux.nombreExpositions = propre.legacy?.seen || 0;
    propre.signaux.dateDerniereExposition = propre.legacy?.lastSeen || 0;
    nouvel.progress[id] = propre;
    r.expressions++;
    if (propre.legacy) r.historiques++;
  }

  if (ancien.journal) nouvel.journal = { ...nouvel.journal, ...ancien.journal };
  const reg = ancien.settings || ancien.reglages || {};
  if (reg.duration) nouvel.reglages.duree = reg.duration;
  if (reg.duree) nouvel.reglages.duree = reg.duree;
  if (reg.echo !== undefined) nouvel.reglages.echo = !!reg.echo;
  if (reg.voiceRate) nouvel.reglages.vitesseVoix = reg.voiceRate;
  if (reg.luxVoice) nouvel.reglages.voixLb = reg.luxVoice;
  if (reg.frVoice) nouvel.reglages.voixFr = reg.frVoice;
  if (reg.profilAudio) nouvel.reglages.profilAudio = reg.profilAudio;

  // Contrôle de sortie. Aucune dimension mesurée ne doit être remplie.
  for (const [id, e] of Object.entries(nouvel.progress)) {
    for (const d of Preuve.DIMENSIONS) {
      if ((e.dims[d]?.n || 0) !== 0) { r.refus.push(`${id}.${d}`); r.ok = false; }
    }
  }
  if (!r.ok) {
    // Refus net plutôt que migration douteuse. L'ancien état reste intact.
    return { etat: structuredClone(DEFAUTS), rapport: r };
  }
  return { etat: nouvel, rapport: r };
}

function legacyDepuis(v) {
  if (!v || typeof v !== "object") return null;
  const n = (x) => Math.max(0, Math.min(7, Math.round(Number(x) || 0)));
  return {
    schema: 5,
    comprehension: n(v.comprehension ?? v.n),
    production: n(v.production ?? v.n),
    pronunciation: n(v.pronunciation),
    seen: Math.max(0, Number(v.seen ?? v.vu) || 0),
    errors: Math.max(0, Number(v.errors) || 0),
    lastSeen: Number(v.lastSeen ?? v.jour) || 0,
    nextDue: Number(v.nextDue ?? v.due) || 0
  };
}

/** Retour arrière vers l'état d'avant migration. */
export async function restaurerAvantMigration() {
  const brut = await stockage.lire(CLE_SAUVEGARDE);
  const v = brut ? parse(brut) : null;
  if (!v?.etat) return { ok: false, raison: "aucune_sauvegarde" };
  await stockage.ecrire(v.cle || CLES_ANCIENNES[0], JSON.stringify(v.etat));
  await stockage.supprimer(CLE_V6);
  return { ok: true, cle: v.cle, date: v.date };
}

/* ---------- Écriture ---------- */

let minuteur = null;

export async function sauver({ immediat = false } = {}) {
  if (!stockage) return false;
  if (immediat) return ecrire();
  clearTimeout(minuteur);
  return new Promise((r) => { minuteur = setTimeout(() => r(ecrire()), 300); });
}

async function ecrire() {
  try { await stockage.ecrire(CLE_V6, JSON.stringify(etat)); return true; }
  catch (e) { console.warn("Sauvegarde impossible", e); return false; }
}

export const progressionDe = (id) => Preuve.normaliser(etat.progress[id]);

/**
 * Écrit une preuve.
 * Refuse toute source non probante. Le refus est renvoyé, pas avalé.
 */
export function enregistrerPreuve(id, p) {
  const avant = progressionDe(id);
  const { entree, ecrit, raison } = Preuve.enregistrerPreuve(avant, p);
  if (!ecrit) return { ecrit: false, raison, entree: avant };
  etat.progress[id] = entree;
  sauver();
  return { ecrit: true, raison: "", entree };
}

export function enregistrerExposition(id) {
  etat.progress[id] = Preuve.exposer(progressionDe(id));
  sauver();
  return etat.progress[id];
}

export function enregistrerRythme(id, mesures) {
  etat.progress[id] = Preuve.noterRythme(progressionDe(id), mesures);
  sauver();
  return etat.progress[id];
}

export function noterProfil(resultat) {
  etat.profilVocal = Profil.noter(etat.profilVocal, resultat);
  sauver();
  return etat.profilVocal;
}

export function noterReprise(r) {
  etat.reprise = { ...etat.reprise, ...r, dateMs: Date.now() };
  sauver();
  return etat.reprise;
}

/* ---------- Vérification du contenu ---------- */

/**
 * Change le statut linguistique d'une phrase.
 *
 * `verified` exige une source. Sans source, la demande est refusée.
 * C'est la règle qui empêche de valider en masse par lassitude.
 */
export function definirStatut(idPhrase, statut, { source = "", par = "" } = {}) {
  if (!["unverified", "reviewing", "verified"].includes(statut)) {
    return { ok: false, raison: "statut_inconnu" };
  }
  if (statut === "verified" && !String(source).trim()) {
    return { ok: false, raison: "source_obligatoire" };
  }
  etat.verification[idPhrase] = { st: statut, src: source, par, le: Date.now() };
  sauver();
  return { ok: true };
}

/** Statut effectif : la vérification humaine prime sur le fichier. */
export function statutDe(phrase) {
  const v = etat.verification[phrase.id];
  return v?.st || phrase.st || "unverified";
}

export function reinitialiserProgression() {
  etat.progress = {};
  etat.profilVocal = Profil.profilVide();
  etat.journal = structuredClone(DEFAUTS.journal);
  etat.reprise = structuredClone(DEFAUTS.reprise);
  etat.parcours = structuredClone(DEFAUTS.parcours);
  sauver({ immediat: true });
}

/* ---------- Export et import ---------- */

export function exporter() {
  return {
    format: "lulu-trajet",
    schema: SCHEMA,
    date: new Date().toISOString(),
    appareil: etat.appareil,
    // L'audio n'est jamais exporté. Seules les métadonnées le sont.
    contient: "progression, profil, réglages, vérifications",
    progress: etat.progress,
    profilVocal: etat.profilVocal,
    journal: etat.journal,
    reglages: etat.reglages,
    parcours: etat.parcours,
    verification: etat.verification
  };
}

export async function importer(donnees) {
  if (!donnees || donnees.format !== "lulu-trajet") return { ok: false, raison: "format_inconnu" };
  if (Number(donnees.schema) !== SCHEMA) return { ok: false, raison: "schema_incompatible", schema: donnees.schema };
  etat = fusionner(structuredClone(DEFAUTS), {
    progress: donnees.progress || {},
    profilVocal: donnees.profilVocal || Profil.profilVide(),
    journal: donnees.journal || DEFAUTS.journal,
    reglages: donnees.reglages || DEFAUTS.reglages,
    parcours: donnees.parcours || DEFAUTS.parcours,
    verification: donnees.verification || {},
    appareil: etat.appareil
  });
  normaliserProgression();
  await sauver({ immediat: true });
  return { ok: true, expressions: Object.keys(etat.progress).length };
}

function fusionner(cible, source) {
  for (const [k, v] of Object.entries(source || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && cible[k] && typeof cible[k] === "object") fusionner(cible[k], v);
    else if (v !== undefined) cible[k] = v;
  }
  return cible;
}

/** Remise à zéro complète du module. Utilisée entre deux tests. */
export function reinitialiserModule() {
  etat = structuredClone(DEFAUTS);
  rapport = null;
  clearTimeout(minuteur);
}
