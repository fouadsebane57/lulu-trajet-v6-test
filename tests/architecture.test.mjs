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

/* ===================================================================
   9. AUDIO · RÈGLES ISSUES DU TEST SUR IPHONE RÉEL
   =================================================================== */

test("un seul module crée des éléments audio", () => {
  // Défaut corrigé : chaque lecture créait un `new Audio()`. Sur iOS,
  // un élément neuf, créé après plusieurs `await`, n'a pas
  // l'autorisation de jouer.
  const coupables = [];
  for (const f of sourcesJs()) {
    if (f.chemin.endsWith("audio/coordinateur.js")) continue;
    if (f.chemin.endsWith("audio/lecture.js")) continue;   // conservé, non utilisé en séance
    const c = codeNu(f.texte);
    if (/new Audio\s*\(/.test(c)) coupables.push(f.chemin);
  }
  assert.deepEqual(coupables, [],
    `création d'élément audio hors du coordinateur : ${coupables.join(", ")}`);
});

test("le coordinateur conserve un élément unique et persistant", () => {
  const s = codeNu(fs.readFileSync(path.join(RACINE, "src/audio/coordinateur.js"), "utf8"));
  assert.match(s, /if \(element\) return element;/,
    "l'élément audio n'est plus réutilisé d'une lecture à l'autre");
});

test("le déverrouillage audio est demandé sans await préalable", () => {
  // Sur iOS, l'autorisation de jouer n'existe que dans la pile
  // d'appels issue du toucher. Un `await` avant l'appel la perd.
  const s = fs.readFileSync(path.join(RACINE, "src/app.js"), "utf8");
  const bloc = s.match(/b\.onclick = \(\) => \{\s*const dev = Coord\.deverrouiller\(\);/);
  assert.ok(bloc, "le déverrouillage n'est plus la première instruction du clic");
  const fn = codeNu(fs.readFileSync(path.join(RACINE, "src/audio/coordinateur.js"), "utf8"));
  const corps = fn.slice(fn.indexOf("export function deverrouiller()"), fn.indexOf("export async function confirmerDeverrouillage"));
  assert.ok(!/await/.test(corps), "deverrouiller() contient un await, l'activation utilisateur sera perdue");
});

test("la synthèse ne peut pas déclarer un démarrage sans onstart", () => {
  const s = fs.readFileSync(path.join(RACINE, "src/audio/tts.js"), "utf8");
  // Une seule affectation de `demarree` à vrai, et elle est dans onstart.
  const affectations = s.match(/r\.demarree\s*=\s*true/g) || [];
  assert.equal(affectations.length, 1, "plusieurs chemins mettent demarree à vrai");
  const onstart = s.slice(s.indexOf("u.onstart"), s.indexOf("u.onend"));
  assert.match(onstart, /r\.demarree = true/, "demarree n'est plus posé par onstart");
});

test("la voix du modèle ne déclare jamais joué sans démarrage prouvé", () => {
  // On retire d'abord commentaires et gabarits : le commentaire qui
  // documente le défaut corrigé contient forcément le motif interdit.
  const brut = fs.readFileSync(path.join(RACINE, "src/audio/voix-modele.js"), "utf8");
  const s = brut
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  assert.ok(!/joue:\s*true/.test(s), "un chemin retourne joue: true en dur");
  assert.match(brut, /joue:\s*!!r\?\.demarree/, "joue ne dérive plus du démarrage réel");
});

test("le contexte audio est rendu au système après chaque capture", () => {
  // Sans cette fermeture, iOS garde la sortie routée vers l'écouteur
  // interne et plus rien n'est audible ensuite.
  const mic = fs.readFileSync(path.join(RACINE, "src/audio/mic.js"), "utf8");
  assert.match(mic, /export async function fermerContexte/, "la fermeture du contexte a disparu");
  assert.match(mic, /export async function rendreAudioAuSysteme/, "la libération complète a disparu");

  // Deux points d'appel distincts, et chacun compte. Vérifier
  // seulement la présence du nom laissait passer la suppression de
  // l'un des deux : l'autre suffisait à faire passer le test.
  const machine = fs.readFileSync(path.join(RACINE, "src/audio/machine.js"), "utf8");

  const capture = machine.slice(machine.indexOf("async capturerReponse"), machine.indexOf("entrerEcoute()"));
  assert.match(capture, /rendreAudioAuSysteme\(\)/,
    "l'audio n'est plus rendu au système après la capture");
  assert.ok(!/Micro\.liberer\(\)/.test(capture),
    "la capture se contente d'arrêter les pistes, sans fermer le contexte audio");

  const echo = machine.slice(machine.indexOf("async rejouerVoix"), machine.indexOf("async libererMicro"));
  assert.match(echo, /rendreAudioAuSysteme\(\)/,
    "l'audio n'est plus rendu au système avant l'écho");
});

test("la restitution signale un blocage au lieu de poursuivre en silence", () => {
  const s = fs.readFileSync(path.join(RACINE, "src/core/restitution.js"), "utf8");
  assert.match(s, /rapport\.blocageAudio = true/, "le blocage audio n'est plus signalé");
  assert.match(s, /segmentBloque/, "le segment fautif n'est plus nommé");
});

test("un blocage audio empêche de consommer l'exercice", () => {
  const s = fs.readFileSync(path.join(RACINE, "src/app.js"), "utf8");
  assert.match(s, /ISSUE\.AUDIO_BLOQUE/, "l'issue de blocage audio a disparu");
  // La consommation ne doit pas être atteignable depuis un blocage.
  const boucle = s.slice(s.indexOf("async function boucle"), s.indexOf("function issueCourante"));
  const posBlocage = boucle.indexOf("ISSUE.AUDIO_BLOQUE");
  const posConsommation = boucle.indexOf("Sess.terminerExercice");
  assert.ok(posBlocage >= 0 && posBlocage < posConsommation,
    "le blocage audio n'est pas traité avant la consommation de l'exercice");
});

test("les tests P0 isolés n'importent aucune logique de séance", () => {
  // Contrainte structurelle, pas déclarative : le module ne PEUT pas
  // démarrer une séance, écrire une progression ni appeler un moteur
  // de reconnaissance, faute d'y avoir accès.
  const s = fs.readFileSync(path.join(RACINE, "src/audio/test-p0.js"), "utf8");
  const interdits = ["core/session", "core/state", "core/scheduler", "speech/engine", "speech/provider", "content/"];
  for (const i of interdits) {
    assert.ok(!s.includes(i), `test-p0.js importe ${i}, il peut donc interférer avec la séance`);
  }
});

test("l'écoute manuelle et le diagnostic passent par le même arbitre", () => {
  const s = fs.readFileSync(path.join(RACINE, "src/app.js"), "utf8");
  assert.match(s, /Coord\.prendre\(Coord\.PROPRIETAIRE\.MANUEL\)/,
    "l'écoute manuelle ne prend plus le verrou audio");
  assert.match(s, /Coord\.rendre\(Coord\.PROPRIETAIRE\.SEANCE\)/,
    "la séance ne rend plus le verrou audio");
});

test("changer d'onglet pendant une séance la met en pause", () => {
  const s = fs.readFileSync(path.join(RACINE, "src/app.js"), "utf8");
  const nav = s.slice(s.indexOf('document.querySelectorAll(".ong button")'), s.indexOf('document.querySelectorAll("[data-seance]")'));
  assert.match(nav, /audio\?\.pause\(\)/,
    "la séance peut continuer derrière un autre onglet");
});
