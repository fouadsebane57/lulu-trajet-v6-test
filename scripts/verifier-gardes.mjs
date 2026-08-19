/* ===================================================================
   PREUVE DES GARDES

   Un test qui passe ne prouve rien tant qu'on n'a pas vérifié qu'il
   sait ÉCHOUER. Ce script réintroduit volontairement, une par une, les
   régressions que la V6 prétend interdire, relance la suite, et exige
   que le test correspondant tombe.

   Pour chaque mutation :
     le fichier est modifié en mémoire, écrit, testé, puis RESTAURÉ ;
     le résultat attendu est un ÉCHEC ;
     si la suite passe malgré la mutation, la garde est déclarée
     insuffisante et ce script sort en erreur.

   Aucune modification ne subsiste après exécution. Une vérification
   finale relance la suite complète pour le confirmer.
   =================================================================== */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const MUTATIONS = [
  {
    nom: "Une écoute fait monter une dimension",
    defaut: "L'exposition redevient une preuve, l'illusion de progression revient.",
    fichier: "src/core/preuve.js",
    de: 'if (!SOURCES_PROBANTES.has(source)) return { entree: e, ecrit: false, raison: "source_non_probante" };',
    vers: "// mutation : toute source devient probante"
  },
  {
    nom: "La prononciation redevient mesurable",
    defaut: "Un score de prononciation peut être fabriqué alors qu'aucun outil ne sait le mesurer.",
    fichier: "src/core/preuve.js",
    de: "[DIM.PRONONCIATION]: false",
    vers: "[DIM.PRONONCIATION]: true"
  },
  {
    nom: "Un moteur non probant peut sanctionner l'apprenant",
    defaut: "Une reconnaissance allemande fait baisser une progression en luxembourgeois.",
    // Cette propriété est protégée par DEUX barrières indépendantes :
    // la nature du moteur transmise au calcul de verdict, et le verrou
    // final du moteur vocal. Retirer une seule des deux ne produit
    // aucun défaut, l'autre rattrape. La mutation retire donc les deux
    // à la fois : c'est ce qui prouve que la propriété est tenue.
    parties: [
      { fichier: "src/speech/engine.js", de: 'engine: provider.probant ? "cloud" : "browser",', vers: 'engine: "cloud",' },
      { fichier: "src/speech/engine.js",
        de: "if (!provider.probant) {\n    if (nature === NATURE.ERREUR_UTILISATEUR) nature = NATURE.INCERTITUDE_MOTEUR;\n    v.fiable = false;\n  }",
        vers: "// mutation : le caractère probant n'est plus contrôlé" }
    ]
  },
  {
    nom: "L'écho rejoue le dernier enregistrement au lieu du bon",
    defaut: "Le défaut historique : une variable unique, et l'apprenant entend la mauvaise tentative.",
    fichier: "src/audio/tentative.js",
    de: "export function blobDe(attemptId) {\n  const t = registre.get(attemptId);\n  if (!t) return null;",
    vers: "export function blobDe(attemptId) {\n  const t = registre.get(attemptId) || [...registre.values()].pop();\n  if (!t) return null;"
  },
  {
    nom: "Une tentative peut être conservée sans consentement",
    defaut: "Des enregistrements de la voix sont gardés sans que l'utilisateur l'ait accepté.",
    fichier: "src/audio/tentative.js",
    de: 'if (!consentement) return { ok: false, raison: "consentement_absent" };',
    vers: "// mutation : le consentement n'est plus exigé"
  },
  {
    nom: "Réussir en avance repousse à nouveau l'échéance",
    defaut: "Cinq réussites en une séance envoient la phrase au palier de soixante jours.",
    fichier: "src/core/preuve.js",
    de: "if (etaitDue) d.n = entier(d.n + (p.avecIndice ? 1 : 2));",
    vers: "d.n = entier(d.n + (p.avecIndice ? 1 : 2));"
  },
  {
    nom: "La solidité ne demande plus de délai réel",
    defaut: "Une phrase répétée cinq fois en une minute est déclarée tenue dans le temps.",
    fichier: "src/core/scheduler.js",
    de: "if (!d.premier || (d.dernier || 0) - d.premier < ETALEMENT_SOLIDE_MS) return false;",
    vers: "// mutation : l'étalement n'est plus exigé"
  },
  {
    nom: "Une phrase neuve peut partir en rappel actif",
    defaut: "On demande de produire une phrase jamais entendue.",
    fichier: "src/core/scheduler.js",
    de: 'if (estNeuve(e)) return ["ecoute", "ecoute_lente", "repetition"];',
    vers: "// mutation : plus de garde sur les phrases neuves"
  },
  {
    nom: "Le dialogue coupe à nouveau une découverte en deux",
    defaut: "L'écoute et la répétition d'une phrase neuve se retrouvent séparées.",
    fichier: "src/core/session.js",
    de: "while (position < out.length && out[position]?.adjacenceVoulue) position += 1;",
    vers: "// mutation : insertion aveugle"
  },
  {
    nom: "Le hasard revient dans le moteur de séance",
    defaut: "Une séance n'est plus reproductible, un bug ne peut plus être rejoué.",
    fichier: "src/core/session.js",
    de: "const tirage = resoudreRng({ rng: o.rng, seed: o.seed });",
    vers: "const tirage = () => Math.random();"
  },
  {
    nom: "La migration promeut l'historique en preuve",
    defaut: "Une progression obtenue par de l'écoute devient une compétence prouvée.",
    fichier: "src/core/state.js",
    de: "const propre = Preuve.entreeVide();",
    vers: "const propre = normalisee;"
  },
  {
    nom: "Une phrase peut être vérifiée sans source",
    defaut: "Le contenu est validé en masse, sans qu'aucune source ne soit citée.",
    fichier: "src/core/state.js",
    de: 'if (statut === "verified" && !String(source).trim()) {\n    return { ok: false, raison: "source_obligatoire" };\n  }',
    vers: "// mutation : la source n'est plus exigée"
  },
  /* ---- Gardes audio, issues du test sur iPhone réel ---- */

  {
    nom: "La synthèse déclare un démarrage qu'elle n'a pas observé",
    defaut: "Un moteur muet est rapporté comme ayant parlé, et la séance défile en silence.",
    fichier: "src/audio/tts.js",
    de: "u.onstart = () => {\n      r.demarree = true;",
    vers: "r.demarree = true;\n    u.onstart = () => {"
  },
  {
    nom: "La voix du modèle retourne joué sans preuve",
    defaut: "Le défaut exact observé : joue: true sans savoir si un son est sorti.",
    fichier: "src/audio/voix-modele.js",
    de: "joue: !!r?.demarree,",
    vers: "joue: true,"
  },
  {
    nom: "Un écho muet laisse la restitution continuer",
    defaut: "L'apprenant n'entend pas sa voix, et l'exercice se termine quand même.",
    fichier: "src/core/restitution.js",
    de: "if (!rapport.echoJoue) {",
    vers: "if (false) {"
  },
  {
    nom: "Un modèle muet n'est plus signalé",
    defaut: "La forme cible n'est pas entendue, et l'exercice est consommé.",
    fichier: "src/core/restitution.js",
    de: "if (!rapport.modeleJoue) {",
    vers: "if (false) {"
  },
  {
    nom: "Une promesse de play tenue vaut audition",
    defaut: "Autorisé à démarrer est confondu avec réellement démarré.",
    fichier: "src/audio/coordinateur.js",
    de: 'if (e.type === "playing") { demarree = true; if (!t0) t0 = Date.now(); }',
    vers: "// mutation : le démarrage réel n'est plus observé"
  },
  {
    nom: "Deux sons peuvent jouer en même temps",
    defaut: "L'écoute manuelle et la séance se disputent la sortie audio.",
    fichier: "src/audio/coordinateur.js",
    de: "if (detenteur !== PROPRIETAIRE.AUCUN && detenteur !== qui) {",
    vers: "if (false) {"
  },
  {
    nom: "L'ObjectURL est révoquée avant la fin de la lecture",
    defaut: "Le son est coupé en cours de route par la lecture suivante.",
    fichier: "src/audio/coordinateur.js",
    de: 'if (urlCourante) { URL.revokeObjectURL(urlCourante); }\n    urlCourante = nouvelleUrl;',
    vers: 'urlCourante = nouvelleUrl;\n    URL.revokeObjectURL(nouvelleUrl);'
  },
  {
    nom: "Le contexte audio n'est plus rendu au système après capture",
    defaut: "Sur iOS, la sortie reste routée vers l'écouteur et plus rien n'est audible.",
    fichier: "src/audio/machine.js",
    de: "const rendu = await Micro.rendreAudioAuSysteme();\n        noter(\"audio_rendu_apres_capture\", rendu);",
    vers: "await Micro.liberer();"
  },
  {
    nom: "Le déverrouillage audio attend avant d'appeler play",
    defaut: "L'activation utilisateur est perdue, iOS refuse tout son.",
    fichier: "src/app.js",
    de: "    b.onclick = () => {\n      const dev = Coord.deverrouiller();\n      demarrerSeance(b.dataset.seance, dev);\n    };",
    vers: "    b.onclick = async () => {\n      await new Promise((r) => setTimeout(r, 0));\n      demarrerSeance(b.dataset.seance, Coord.deverrouiller());\n    };"
  },
  {
    nom: "La séance continue derrière un autre onglet",
    defaut: "La boucle avance pendant que l'utilisateur écoute un enregistrement.",
    fichier: "src/app.js",
    de: "      if (seance && !enPause) {\n        enPause = true;\n        $(\"sPause\").textContent = \"Reprendre\";\n        await audio?.pause();",
    vers: "      if (false) {\n        enPause = true;\n        $(\"sPause\").textContent = \"Reprendre\";"
  },
  {
    nom: "Un exercice est consommé malgré un blocage audio",
    defaut: "Exactement le comportement observé : aucun son, et la séance défile.",
    fichier: "src/app.js",
    de: "    if (issue === ISSUE.AUDIO_BLOQUE) {",
    vers: "    if (false) {"
  },
  {
    nom: "Un fournisseur de prononciation non luxembourgeois est accepté",
    defaut: "Un moteur allemand produit un score de prononciation présenté comme fiable.",
    fichier: "src/speech/prononciation.js",
    de: "if (!/^lb/i.test(provider.langue)) {",
    vers: "if (false) {"
  }
];

const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");
const ecrire = (f, t) => fs.writeFileSync(path.join(RACINE, f), t);

/* ------------------------------------------------------------------
   FILET DE SÉCURITÉ

   Ce script modifie volontairement le code source. Une interruption
   externe, un délai dépassé ou un Ctrl-C au mauvais moment laissait le
   dépôt dans un état muté, sans que rien ne le signale. C'est arrivé.

   Tout fichier touché est donc mémorisé, et restauré quoi qu'il
   arrive, y compris sur signal.
   ------------------------------------------------------------------ */
const enCours = new Map();

function restaurerTout() {
  for (const [f, t] of enCours) {
    try { ecrire(f, t); } catch (_) {}
  }
  enCours.clear();
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => { restaurerTout(); process.exit(130); });
}
process.on("exit", restaurerTout);
process.on("uncaughtException", (e) => { restaurerTout(); console.error(e); process.exit(2); });

function suitePasse() {
  try {
    execFileSync("node", ["--test", "tests/*.test.mjs"], { cwd: RACINE, stdio: "pipe" });
    return true;
  } catch (_) {
    return false;
  }
}

console.log("Vérification des gardes. Chaque défaut réintroduit doit faire échouer la suite.\n");

let echecs = 0;
let verifiees = 0;

for (const m of MUTATIONS) {
  // Une mutation porte sur un point unique, ou sur plusieurs quand la
  // propriété est protégée par des barrières redondantes.
  const parties = m.parties || [{ fichier: m.fichier, de: m.de, vers: m.vers }];
  const originaux = new Map();
  let applicable = true;

  for (const partie of parties) {
    if (!originaux.has(partie.fichier)) originaux.set(partie.fichier, lire(partie.fichier));
    const courant = originaux.get(partie.fichier);
    if (!courant.includes(partie.de)) {
      console.log(`  ?  ${m.nom}\n     Code de référence introuvable dans ${partie.fichier}. Mutation impossible.`);
      applicable = false;
      break;
    }
  }
  if (!applicable) { echecs++; continue; }

  const modifies = new Map(originaux);
  for (const partie of parties) {
    modifies.set(partie.fichier, modifies.get(partie.fichier).replace(partie.de, partie.vers));
  }
  // Mémorisé AVANT écriture : une interruption pendant le test doit
  // pouvoir remettre le fichier en état.
  for (const [f, t] of originaux) enCours.set(f, t);
  for (const [f, t] of modifies) ecrire(f, t);

  const passeQuandMeme = suitePasse();

  restaurerTout();                                // restauration immédiate

  if (passeQuandMeme) {
    console.log(`  ÉCHEC  ${m.nom}\n         La suite passe alors que le défaut est présent. Garde insuffisante.`);
    echecs++;
  } else {
    console.log(`  ok     ${m.nom}`);
    verifiees++;
  }
}

console.log(`\n${verifiees} gardes sur ${MUTATIONS.length} détectent le défaut qu'elles couvrent.`);

// Contrôle final : le dépôt doit être revenu exactement à son état initial.
if (!suitePasse()) {
  console.error("\nLa suite ne passe plus après restauration. Un fichier n'a pas été remis en état.");
  process.exit(2);
}
console.log("Suite complète repassée après restauration : le code est intact.");

process.exit(echecs ? 1 : 0);
