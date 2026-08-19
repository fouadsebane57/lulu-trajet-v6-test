/* ===================================================================
   VÉRIFICATION DE LIVRAISON

   À lancer dans le dossier EXTRAIT du ZIP, pas dans le dossier de
   travail. Il répond à une seule question : ce qui vient d'être
   décompressé est-il utilisable tel quel ?

   Contrôles :
     fichiers obligatoires présents
     aucun secret embarqué
     aucun fichier de travail oublié
     tous les imports se résolvent
     le contenu se charge et ses compteurs sont exacts
     les fichiers annoncés par le service worker existent
     la suite de tests passe

   Sortie : 0 si tout est bon, 1 sinon, avec la liste des problèmes.
   =================================================================== */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const problemes = [];
const notes = [];
const ok = [];

const existe = (rel) => fs.existsSync(path.join(RACINE, rel));
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), "utf8");

/* ---------- 1. Fichiers obligatoires ---------- */

const OBLIGATOIRES = [
  "index.html", "styles.css", "sw.js", "manifest.webmanifest",
  "package.json", "config.example.js", "capacitor.config.json",
  "src/app.js",
  "src/content/index.js", "src/content/phrases-a.js", "src/content/phrases-b.js",
  "src/content/dialogues.js", "src/content/parcours.js", "src/content/exercices.js",
  "src/core/preuve.js", "src/core/scheduler.js", "src/core/session.js",
  "src/core/state.js", "src/core/profil.js", "src/core/file.js", "src/core/rng.js",
  // Ajouté après un défaut d'empaquetage réel : le motif d'exclusion
  // « config.js » du ZIP avait aussi emporté src/core/config.js, et
  // vingt et un tests ne se lançaient plus dans l'archive extraite.
  "src/core/config.js", "src/core/restitution.js",
  "src/audio/tentative.js", "src/audio/voix-modele.js", "src/audio/machine.js",
  "src/audio/coordinateur.js", "src/audio/session-ios.js", "src/audio/test-p0.js", "src/audio/lecture.js",
  "src/speech/engine.js", "src/speech/provider.js", "src/speech/prononciation.js",
  "src/speech/providers/luxasr.js", "src/speech/providers/repli.js",
  "src/platform/index.js", "src/ui/diagnostic.js",
  "supabase/functions/luxasr-transcribe/index.ts",
  "docs/V6_ARCHITECTURE.md", "docs/V6_CONTENU.md", "docs/V6_VOIX.md",
  "docs/V6_MOBILE.md", "docs/V6_CONFIDENTIALITE.md", "docs/V6_DECISIONS.md",
  "docs/TEST_IPHONE.md", "docs/V6_AUDIO_P0.md", "README.md"
];

for (const f of OBLIGATOIRES) {
  if (!existe(f)) problemes.push(`Fichier obligatoire absent : ${f}`);
}
if (!problemes.length) ok.push(`${OBLIGATOIRES.length} fichiers obligatoires présents`);

/* ---------- 2. Fichiers qui ne doivent PAS être là ---------- */

const INTERDITS = ["config.js", "node_modules", ".env", ".env.local", "dist", ".DS_Store"];
for (const f of INTERDITS) {
  if (existe(f)) problemes.push(`Fichier qui ne doit pas être livré : ${f}`);
}
ok.push("aucun fichier de travail oublié");

/* ---------- 3. Aucun secret ---------- */

const MOTIFS_SECRETS = [
  { m: /sb_secret_[A-Za-z0-9_-]{8,}/, quoi: "clé secrète Supabase" },
  { m: /sb_publishable_[A-Za-z0-9_-]{8,}/, quoi: "clé publiable Supabase en dur" },
  // Une clé service_role est un JWT : le motif suivant la couvre déjà.
  // Ne pas signaler la simple MENTION du mot, sinon toute
  // documentation qui met en garde contre elle devient un faux
  // positif, et les faux positifs finissent par être ignorés.
  { m: /SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']{12,}["']/, quoi: "clé service_role écrite en dur" },
  { m: /eyJhbGciOi[A-Za-z0-9._-]{20,}/, quoi: "jeton JWT" },
  { m: /whsec_[A-Za-z0-9]{8,}/, quoi: "secret de webhook" },
  { m: /sk_(live|test)_[A-Za-z0-9]{8,}/, quoi: "clé secrète de paiement" }
];

function parcourir(dossier, sortie = []) {
  for (const e of fs.readdirSync(path.join(RACINE, dossier), { withFileTypes: true })) {
    const rel = path.join(dossier, e.name);
    if (e.name === "node_modules" || e.name.startsWith(".git")) continue;
    // Ce script contient forcément les motifs qu'il recherche.
    if (rel.endsWith("verifier-livraison.mjs")) continue;
    if (e.isDirectory()) parcourir(rel, sortie);
    else if (/\.(js|mjs|ts|html|json|md|webmanifest|css)$/.test(e.name)) sortie.push(rel);
  }
  return sortie;
}

const tousFichiers = parcourir(".");
for (const f of tousFichiers) {
  const texte = lire(f);
  for (const s of MOTIFS_SECRETS) {
    // La fonction serveur a le droit de NOMMER la variable d'environnement,
    // pas d'en contenir la valeur.
    if (s.m.test(texte)) problemes.push(`${s.quoi} trouvé dans ${f}`);
  }
}
if (!problemes.some((p) => /clé|jeton|secret/.test(p))) ok.push(`aucun secret dans ${tousFichiers.length} fichiers`);

/* ---------- 4. Imports résolus ---------- */

const manquants = [];
for (const f of tousFichiers.filter((x) => /\.(js|mjs)$/.test(x))) {
  const dossier = path.dirname(path.join(RACINE, f));
  for (const m of lire(f).matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    if (!fs.existsSync(path.resolve(dossier, m[1]))) manquants.push(`${f} -> ${m[1]}`);
  }
}
if (manquants.length) problemes.push(`Imports cassés : ${manquants.join(", ")}`);
else ok.push("tous les imports relatifs se résolvent");

/* ---------- 5. Service worker ---------- */

const sw = lire("sw.js");
const bloc = sw.match(/const FICHIERS = \[([\s\S]*?)\];/);
if (!bloc) problemes.push("sw.js : liste de fichiers introuvable");
else {
  const absents = [];
  for (const m of bloc[1].matchAll(/"\.\/([^"]*)"/g)) {
    if (m[1] && !existe(m[1])) absents.push(m[1]);
  }
  if (absents.length) problemes.push(`sw.js annonce des fichiers absents : ${absents.join(", ")}`);
  else ok.push("le service worker ne référence que des fichiers existants");
}

/* ---------- 6. Contenu ---------- */

let chiffres = null;
try {
  const C = await import(path.join(RACINE, "src/content/index.js"));
  const Ex = await import(path.join(RACINE, "src/content/exercices.js"));
  chiffres = { ...C.chiffres(), exercices: Ex.total(), repartition: Ex.repartition() };

  if (chiffres.phrases < 300) problemes.push(`Contenu insuffisant : ${chiffres.phrases} phrases`);
  if (chiffres.exercices < 1500) problemes.push(`Exercices insuffisants : ${chiffres.exercices}`);
  if (chiffres.statuts.verified > 0) {
    problemes.push(`${chiffres.statuts.verified} phrases marquées vérifiées sans relecture humaine`);
  }
  ok.push(`contenu chargé : ${chiffres.phrases} phrases, ${chiffres.exercices} exercices`);
} catch (e) {
  problemes.push(`Le contenu ne se charge pas : ${e?.message}`);
}

/* ---------- 7. Tests ---------- */

let resumeTests = "";
try {
  const sortie = execFileSync("node", ["--test", "--test-concurrency=1", "tests/*.test.mjs"], {
    cwd: RACINE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  });
  const total = sortie.match(/^# tests (\d+)$/m)?.[1];
  const passes = sortie.match(/^# pass (\d+)$/m)?.[1];
  const echecs = sortie.match(/^# fail (\d+)$/m)?.[1];
  resumeTests = `${passes}/${total} tests passants, ${echecs} échecs`;
  if (Number(echecs) > 0) problemes.push(`Tests en échec : ${echecs}`);
  else ok.push(resumeTests);
} catch (e) {
  const sortie = String(e.stdout || "");
  const echecs = sortie.match(/^# fail (\d+)$/m)?.[1] || "?";
  problemes.push(`La suite de tests échoue : ${echecs} test(s) en échec`);
}

/* ---------- Rapport ---------- */

console.log("VÉRIFICATION DE LIVRAISON\n");
for (const o of ok) console.log(`  ok    ${o}`);
for (const n of notes) console.log(`  note  ${n}`);

if (chiffres) {
  console.log("\nContenu livré :");
  console.log(`  phrases          ${chiffres.phrases} (${chiffres.reprises} reprises, ${chiffres.derivees} dérivées)`);
  console.log(`  statuts          ${chiffres.statuts.verified} vérifiées, ${chiffres.statuts.reviewing} en cours, ${chiffres.statuts.unverified} à vérifier`);
  console.log(`  paquets          ${chiffres.paquets} + ${chiffres.microModules} micro-modules`);
  console.log(`  dialogues        ${chiffres.dialogues}`);
  console.log(`  exercices        ${chiffres.exercices}`);
}

if (problemes.length) {
  console.log("\nPROBLÈMES :");
  for (const p of problemes) console.log(`  ✕  ${p}`);
  process.exit(1);
}

console.log("\nLivraison conforme.");
