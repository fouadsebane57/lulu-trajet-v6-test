import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ===================================================================
   TESTS D'ARCHITECTURE

   Ces tests ne vérifient pas un comportement, ils vérifient une
   PROPRIÉTÉ DU CODE. Ils existent parce que trois régressions passées
   sont revenues par la même porte : quelqu'un a rajouté un appel
   direct là où une couche existait déjà.

   Un test de comportement se contourne en ajoutant un chemin
   parallèle. Un test d'architecture ferme le chemin.
   =================================================================== */

const RACINE = path.join(import.meta.dirname, "..");

function fichiers(dossier, ext = ".js") {
  const base = path.join(RACINE, dossier);
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    const p = path.join(base, e.name);
    if (e.isDirectory()) out.push(...fichiers(path.join(dossier, e.name), ext));
    else if (e.name.endsWith(ext)) out.push({ chemin: path.join(dossier, e.name), texte: fs.readFileSync(p, "utf8") });
  }
  return out;
}

const sourcesJs = () => fichiers("src");

/** Retire commentaires et chaînes, pour ne tester que du code réel. */
function codeNu(texte) {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/* ===================================================================
   1. UNE SEULE SOURCE DE HASARD
   =================================================================== */

test("Math.random n'apparaît nulle part dans le moteur, sauf dans rng.js", () => {
  const coupables = [];
  for (const f of sourcesJs()) {
    if (f.chemin.endsWith("core/rng.js")) continue;
    if (codeNu(f.texte).includes("Math.random")) coupables.push(f.chemin);
  }
  assert.deepEqual(coupables, [],
    `Math.random hors de rng.js rend une séance irreproductible : ${coupables.join(", ")}`);
});

test("le moteur de séance tire son hasard du générateur injecté", () => {
  const s = fs.readFileSync(path.join(RACINE, "src/core/session.js"), "utf8");
  assert.match(s, /resoudreRng/, "session.js doit résoudre un générateur explicite");
});

/* ===================================================================
   2. AUCUN SCORE DE PRONONCIATION NE PEUT ÊTRE FABRIQUÉ
   =================================================================== */

test("aucun module ne peut écrire dans la dimension prononciation", () => {
  const coupables = [];
  for (const f of sourcesJs()) {
    if (f.chemin.endsWith("core/preuve.js")) continue;      // c'est lui qui refuse
    const c = codeNu(f.texte);
    // Une écriture passerait forcément par une preuve visant cette dimension.
    if (/dim\s*:\s*[A-Za-z_.]*PRONONCIATION/.test(c)) coupables.push(f.chemin);
  }
  assert.deepEqual(coupables, [], `écriture possible sur la prononciation : ${coupables.join(", ")}`);
});

test("le modèle de preuves déclare la prononciation non mesurable", () => {
  const s = fs.readFileSync(path.join(RACINE, "src/core/preuve.js"), "utf8");
  assert.match(codeNu(s), /\[DIM\.PRONONCIATION\]\s*:\s*false/,
    "la prononciation doit être déclarée non mesurable");
});

test("le module de prononciation refuse tout fournisseur non luxembourgeois", () => {
  const s = codeNu(fs.readFileSync(path.join(RACINE, "src/speech/prononciation.js"), "utf8"));
  assert.match(s, /\/\^lb\/i\.test\(provider\.langue\)/,
    "le contrôle de langue du fournisseur a disparu");
});

/* ===================================================================
   3. UNE SEULE PORTE D'ÉCRITURE DES PREUVES
   =================================================================== */

test("seul core/state.js appelle l'écriture de preuve du modèle", () => {
  const coupables = [];
  for (const f of sourcesJs()) {
    if (f.chemin.endsWith("core/preuve.js")) continue;
    if (f.chemin.endsWith("core/state.js")) continue;
    const c = codeNu(f.texte);
    // Appel direct au modèle, en contournant l'état.
    if (/Preuve\.enregistrerPreuve\s*\(/.test(c)) coupables.push(f.chemin);
  }
  assert.deepEqual(coupables, [],
    `écriture de preuve hors de state.js : ${coupables.join(", ")}`);
});

test("l'interface ne manipule jamais directement le stockage du navigateur", () => {
  const coupables = [];
  for (const f of sourcesJs()) {
    // Seuls la plateforme et la synthèse vocale ont le droit d'y toucher.
    if (f.chemin.endsWith("platform/index.js")) continue;
    if (f.chemin.endsWith("audio/tts.js")) continue;
    const c = codeNu(f.texte);
    if (/localStorage\./.test(c)) coupables.push(f.chemin);
  }
  assert.deepEqual(coupables, [],
    `accès direct à localStorage hors de la couche plateforme : ${coupables.join(", ")}`);
});

/* ===================================================================
   4. LA COUCHE MÉTIER NE CONNAÎT PAS L'ÉCRAN
   =================================================================== */

test("aucun module de core/ ne touche au DOM", () => {
  const coupables = [];
  for (const f of fichiers("src/core")) {
    const c = codeNu(f.texte);
    if (/\bdocument\.|getElementById|querySelector/.test(c)) coupables.push(f.chemin);
  }
  assert.deepEqual(coupables, [],
    `la logique métier dépend de l'écran : ${coupables.join(", ")}`);
});

test("aucun module de content/ n'importe de code d'interface", () => {
  for (const f of fichiers("src/content")) {
    assert.ok(!/from\s+["'][^"']*ui\//.test(f.texte), `${f.chemin} importe l'interface`);
    assert.ok(!/from\s+["'][^"']*app\.js/.test(f.texte), `${f.chemin} importe app.js`);
  }
});

/* ===================================================================
   5. AUCUN SECRET DANS LE CODE LIVRÉ
   =================================================================== */

test("aucune clé Supabase n'est écrite en dur dans les sources", () => {
  const motifs = [/sb_publishable_[A-Za-z0-9_-]{10,}/, /sb_secret_[A-Za-z0-9_-]{10,}/, /eyJhbGciOi[A-Za-z0-9._-]{20,}/];
  const coupables = [];
  for (const f of [...sourcesJs(), ...fichiers(".", ".html"), ...fichiers("scripts", ".mjs")]) {
    for (const m of motifs) if (m.test(f.texte)) coupables.push(f.chemin);
  }
  assert.deepEqual(coupables, [], `secret trouvé dans : ${coupables.join(", ")}`);
});

test("la configuration passe par un fichier séparé, jamais versionné", () => {
  const s = fs.readFileSync(path.join(RACINE, "src/core/config.js"), "utf8");
  assert.match(s, /config\.js|CONFIG/, "config.js doit lire une configuration externe");
  assert.ok(fs.existsSync(path.join(RACINE, "config.example.js")),
    "un modèle de configuration doit être livré");
  assert.ok(!fs.existsSync(path.join(RACINE, "config.js")),
    "config.js ne doit jamais être livré dans le ZIP");
});

/* ===================================================================
   6. LE SERVICE WORKER LISTE CE QUI EXISTE VRAIMENT
   =================================================================== */

test("chaque fichier listé par le service worker existe", () => {
  const sw = fs.readFileSync(path.join(RACINE, "sw.js"), "utf8");
  const bloc = sw.match(/const FICHIERS = \[([\s\S]*?)\];/);
  assert.ok(bloc, "liste de fichiers introuvable dans sw.js");
  const manquants = [];
  for (const m of bloc[1].matchAll(/"\.\/([^"]*)"/g)) {
    const rel = m[1];
    if (!rel) continue;                        // "./" = la racine
    if (!fs.existsSync(path.join(RACINE, rel))) manquants.push(rel);
  }
  assert.deepEqual(manquants, [], `fichiers annoncés mais absents : ${manquants.join(", ")}`);
});

test("le service worker ne met jamais en cache les appels de reconnaissance", () => {
  // Ici on lit le texte brut : la condition porte sur une chaîne, que
  // le nettoyage du code effacerait.
  const sw = fs.readFileSync(path.join(RACINE, "sw.js"), "utf8");
  assert.match(sw, /transcribe/, "le contournement de cache pour la transcription a disparu");
  assert.match(sw, /if \(url\.pathname\.includes/, "le contrôle d'URL a disparu");
});

/* ===================================================================
   7. TOUS LES IMPORTS SE RÉSOLVENT
   =================================================================== */

test("aucun import ne pointe vers un fichier inexistant", () => {
  const manquants = [];
  for (const f of sourcesJs()) {
    const dossier = path.dirname(path.join(RACINE, f.chemin));
    for (const m of f.texte.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const cible = path.resolve(dossier, m[1]);
      if (!fs.existsSync(cible)) manquants.push(`${f.chemin} -> ${m[1]}`);
    }
  }
  assert.deepEqual(manquants, [], `imports cassés : ${manquants.join(", ")}`);
});

test("chaque module importé par index.html existe", () => {
  const html = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^https?:|^data:|^#/.test(ref)) continue;
    assert.ok(fs.existsSync(path.join(RACINE, ref)), `ressource absente : ${ref}`);
  }
});

/* ===================================================================
   8. AUCUN MESSAGE D'ERREUR GÉNÉRIQUE
   =================================================================== */

test("aucun message générique du type « une erreur est survenue »", () => {
  // On teste les CHAÎNES affichées, pas les commentaires : un
  // commentaire qui interdit une formulation la contient forcément.
  const interdits = [/une erreur est survenue/i, /\berreur inconnue\b/i, /\boups\b/i, /something went wrong/i];
  const coupables = [];
  for (const f of [...sourcesJs(), ...fichiers(".", ".html")]) {
    const sansCommentaires = f.texte
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/<!--[\s\S]*?-->/g, " ");
    for (const m of interdits) {
      if (m.test(sansCommentaires)) coupables.push(`${f.chemin} : ${m}`);
    }
  }
  assert.deepEqual(coupables, [], `message non actionnable : ${coupables.join(", ")}`);
});
