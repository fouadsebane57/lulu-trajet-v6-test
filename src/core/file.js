/* ===================================================================
   FILE DE SÉANCE, PAR CANDIDATURES

   DÉFAUT CORRIGÉ AU GATE 2.5

   La file était construite en concaténant des listes qui se
   recouvrent : `neufs`, `dus`, `enCours`, `leconItems`, `solides`,
   puis en mélangeant le tout. Or ces listes ne sont pas disjointes.

     neufs      ⊂ leconItems          par construction
     dus        ∩ enCours  ≠ ∅        un item dû peut être en cours
     dus        ∩ solides  ≠ ∅        un item solide redevient dû

   Le même itemId se retrouvait donc plusieurs fois dans la file sans
   qu'aucune règle pédagogique ne l'ait demandé. Un mélange aléatoire
   pouvait alors produire A A B C, et la reprise après « Suivant »
   ramenait la même expression.

   POURQUOI PAS UNE DÉDUPLICATION

   Supprimer les doublons résoudrait le symptôme et détruirait la
   pédagogie : une expression DOIT parfois revenir plusieurs fois dans
   une même séance. Le mode chiffres fait trois passages voulus. Le
   mode voiture fait écouter puis répéter le même mot.

   MODÈLE RETENU

   Chaque occurrence devient une CANDIDATURE explicite :

     itemId          l'expression concernée
     source          d'où vient l'occurrence
     raison          pourquoi elle est proposée
     priorite        0 = à traiter en premier
     echeance        date de révision, 0 si sans objet
     intentionnelle  true  = répétition voulue par une règle
                     false = occurrence issue d'une simple liste

   Deux occurrences NON intentionnelles du même couple (itemId, type)
   proviennent forcément d'un recouvrement de listes. Elles sont
   fusionnées en une seule candidature, et la fusion est COMPTÉE dans
   le diagnostic : rien ne disparaît en silence.

   Les occurrences intentionnelles sont toutes conservées. Elles ne
   sont jamais supprimées, seulement DÉPLACÉES pour qu'une autre
   expression puisse s'intercaler.

   INVARIANT

   Si au moins deux itemId distincts restent disponibles, deux
   occurrences du même itemId ne peuvent pas se suivre, sauf si
   l'adjacence est explicitement demandée (`adjacenceVoulue`).
   =================================================================== */

import { melanger, rngSysteme } from "./rng.js";

export const SOURCE = {
  NEUF: "neuf",
  DU: "du",
  EN_COURS: "en_cours",
  SOLIDE: "solide",
  LECON: "lecon",
  FRAGILE: "fragile",
  NOMBRE: "nombre",
  DIALOGUE: "dialogue",
  SOCLE: "socle",
  RECYCLAGE: "recyclage"
};

export const RAISON = {
  DECOUVERTE: "decouverte",
  ANCRAGE: "ancrage",              // répétition immédiate voulue après l'écoute
  RAPPEL: "rappel",
  CONSOLIDATION: "consolidation",
  DRILL: "drill",                  // passages multiples voulus, mode chiffres
  CORRECTION: "correction",
  ECOUTE: "ecoute",
  DIALOGUE: "dialogue",
  RECYCLAGE: "recyclage"
};

/** Priorités. Plus le nombre est bas, plus l'occurrence est urgente. */
export const PRIORITE = {
  [SOURCE.FRAGILE]: 0,
  [SOURCE.DU]: 1,
  [SOURCE.NEUF]: 2,
  [SOURCE.EN_COURS]: 3,
  [SOURCE.LECON]: 4,
  [SOURCE.SOLIDE]: 5,
  [SOURCE.NOMBRE]: 2,
  [SOURCE.DIALOGUE]: 2,
  [SOURCE.SOCLE]: 6,
  [SOURCE.RECYCLAGE]: 6
};

/**
 * Crée une candidature.
 *
 * @param {object} o
 * @param {string} o.type            type d'exercice
 * @param {object} [o.it]            item de contenu
 * @param {object} [o.dialogue]      dialogue
 * @param {string} o.source          SOURCE.*
 * @param {string} o.raison          RAISON.*
 * @param {number} [o.echeance]      date de révision
 * @param {boolean} [o.intentionnelle] répétition voulue par une règle
 * @param {boolean} [o.adjacenceVoulue] doit suivre immédiatement la précédente
 */
export function candidature({ type, it = null, dialogue = null, source, raison,
                              echeance = 0, intentionnelle = false,
                              adjacenceVoulue = false, occurrence = 0 }) {
  const itemId = it ? it.id : dialogue ? `dlg:${dialogue.id ?? dialogue.t ?? ""}` : "";
  return {
    itemId, type, it, dialogue,
    source, raison,
    priorite: PRIORITE[source] ?? 9,
    echeance,
    intentionnelle,
    adjacenceVoulue,
    occurrence,
    // Traçabilité : renseigné si des occurrences accidentelles ont été
    // absorbées par celle-ci.
    sourcesFusionnees: []
  };
}

/* ===================================================================
   1 · FUSION DES OCCURRENCES ACCIDENTELLES
   =================================================================== */

/**
 * Fusionne les candidatures NON intentionnelles portant le même couple
 * (itemId, type). L'occurrence la plus prioritaire est conservée, les
 * autres sont absorbées et tracées.
 *
 * Les candidatures intentionnelles ne sont jamais fusionnées.
 *
 * @returns {{ candidatures: Array, fusionnees: number }}
 */
export function fusionner(candidatures) {
  const parCle = new Map();
  const sortie = [];
  let fusionnees = 0;

  for (const c of candidatures) {
    if (c.intentionnelle) { sortie.push(c); continue; }
    const cle = `${c.itemId}|${c.type}`;
    const garde = parCle.get(cle);
    if (!garde) {
      parCle.set(cle, c);
      sortie.push(c);
      continue;
    }
    fusionnees++;
    garde.sourcesFusionnees.push({ source: c.source, raison: c.raison });
    // La priorité la plus forte gagne, ainsi que l'échéance la plus proche.
    if (c.priorite < garde.priorite) {
      garde.priorite = c.priorite;
      garde.source = c.source;
      garde.raison = c.raison;
    }
    if (c.echeance && (!garde.echeance || c.echeance < garde.echeance)) {
      garde.echeance = c.echeance;
    }
  }
  return { candidatures: sortie, fusionnees };
}

/* ===================================================================
   2 · REGROUPEMENT EN BLOCS
   =================================================================== */

/**
 * Une candidature marquée `adjacenceVoulue` est soudée à la précédente.
 * Le bloc devient l'unité déplaçable : l'écoute et la répétition d'un
 * même mot ne peuvent plus être séparées par le réordonnancement.
 *
 * Toutes les candidatures d'un bloc portent le même itemId. C'est ce
 * qui rend l'algorithme d'espacement exact.
 */
export function enBlocs(candidatures) {
  const blocs = [];
  for (const c of candidatures) {
    const dernier = blocs[blocs.length - 1];
    if (c.adjacenceVoulue && dernier && dernier.cle === c.itemId) {
      dernier.cands.push(c);
      continue;
    }
    blocs.push({ cle: c.itemId, cands: [c] });
  }
  return blocs;
}

/* ===================================================================
   3 · ESPACEMENT
   =================================================================== */

/**
 * Réordonne les blocs pour qu'aucun itemId n'apparaisse deux fois de
 * suite, SANS jamais supprimer d'occurrence.
 *
 * Algorithme : à chaque pas, on retient le bloc dont l'itemId a le plus
 * d'occurrences restantes parmi ceux qui diffèrent du précédent. À
 * égalité, l'ordre d'origine tranche, ce qui rend le résultat
 * reproductible et laisse l'ordre pédagogique intact quand il n'y a
 * aucun conflit à résoudre.
 *
 * Ce choix du plus fréquent d'abord est nécessaire : prendre
 * simplement le premier bloc différent échoue sur A B C A A, où la
 * solution A B A C A existe pourtant.
 *
 * Quand il ne reste que l'itemId courant, l'adjacence est INÉVITABLE.
 * Elle est alors produite et comptée comme telle, jamais silencieuse.
 *
 * @returns {{ blocs: Array, deplacements: number, inevitables: number }}
 */
export function espacer(blocs) {
  const restants = blocs.map((b, i) => ({ b, i, pris: false }));
  const compte = new Map();
  for (const r of restants) compte.set(r.b.cle, (compte.get(r.b.cle) || 0) + 1);

  const sortie = [];
  let dernier = null;
  let inevitables = 0;

  while (sortie.length < blocs.length) {
    let choix = null;
    for (const r of restants) {
      if (r.pris || r.b.cle === dernier) continue;
      if (!choix || compte.get(r.b.cle) > compte.get(choix.b.cle)) choix = r;
    }
    if (!choix) {
      // Il ne reste que l'expression courante. L'adjacence est subie,
      // pas produite par hasard.
      choix = restants.find((r) => !r.pris);
      choix.b.adjacenceInevitable = true;
      inevitables++;
    }
    choix.pris = true;
    compte.set(choix.b.cle, compte.get(choix.b.cle) - 1);
    dernier = choix.b.cle;
    sortie.push(choix);
  }

  let deplacements = 0;
  sortie.forEach((r, position) => { if (r.i !== position) deplacements++; });
  return { blocs: sortie.map((r) => r.b), deplacements, inevitables };
}

/* ===================================================================
   4 · ASSEMBLAGE
   =================================================================== */

/** Aplatit les blocs en liste d'exercices, format attendu par app.js. */
export function aplatir(blocs) {
  const out = [];
  for (const b of blocs) for (const c of b.cands) out.push(c);
  return out;
}

/**
 * Chaîne complète : fusion, blocs, espacement, aplatissement.
 * @returns {{ file: Array, diagnostic: object }}
 */
export function ordonner(candidatures) {
  const brutes = candidatures.length;
  const { candidatures: retenues, fusionnees } = fusionner(candidatures);
  const { blocs, deplacements, inevitables } = espacer(enBlocs(retenues));
  const file = aplatir(blocs);
  return {
    file,
    diagnostic: {
      brutes,
      fusionnees,
      occurrences: file.length,
      intentionnelles: file.filter((c) => c.intentionnelle).length,
      deplacements,
      adjacencesInevitables: inevitables,
      adjacencesAccidentelles: compterAdjacencesAccidentelles(file)
    }
  };
}

/**
 * Contrôle de sortie. Compte les répétitions immédiates qui ne sont ni
 * voulues ni inévitables. Ce compteur doit toujours valoir zéro ; il
 * existe pour que ce soit vérifiable, pas seulement affirmé.
 */
export function compterAdjacencesAccidentelles(file) {
  const distincts = new Set(file.map((c) => c.itemId)).size;
  if (distincts <= 1) return 0;
  let n = 0;
  for (let i = 1; i < file.length; i++) {
    if (file[i].itemId !== file[i - 1].itemId) continue;
    if (file[i].adjacenceVoulue) continue;
    // Adjacence subie en fin de file : plus aucune autre expression
    // n'était disponible à cet endroit.
    if (!resteUneAutre(file, i)) continue;
    n++;
  }
  return n;
}

/** Une autre expression était-elle encore plaçable à partir de i ? */
function resteUneAutre(file, i) {
  for (let k = i; k < file.length; k++) if (file[k].itemId !== file[i].itemId) return true;
  return false;
}

/* ===================================================================
   5 · CANDIDATURES PAR MODE
   =================================================================== */

const T = { ECOUTE: "listen", ORAL: "speak", NOMBRE: "number", DIALOGUE: "dialogue" };

/**
 * Expressions distinctes, en gardant la première occurrence.
 *
 * `content.items()` produit une entrée PAR OCCURRENCE : une même
 * expression enseignée dans deux leçons y figure deux fois, avec le
 * même `id`. Sur le contenu réel, 7 identifiants sont dans ce cas.
 * Un passage voulu doit donc porter sur des expressions distinctes,
 * sinon un « triple passage » deviendrait un sextuple passage.
 */
const distincts = (liste) => {
  const vus = new Set();
  return liste.filter((i) => (vus.has(i.id) ? false : (vus.add(i.id), true)));
};

const depuis = (liste, source, raison, type, ech = () => 0) =>
  liste.map((it) => candidature({ type, it, source, raison, echeance: ech(it) }));

/**
 * Construit les candidatures d'une séance, puis la file ordonnée.
 *
 * @param {object} ctx  listes déjà calculées par session.js
 * @returns {{ file: Array, diagnostic: object }}
 */
export function construireFile(ctx) {
  const rng = ctx.rng || rngSysteme;
  const cands = candidaturesDuMode(ctx, rng);
  return ordonner(cands);
}

function candidaturesDuMode(ctx, rng) {
  const { mode, dus, solides, enCours, neufs, fragiles, items, dialogues,
          leconCourante, etapeCourante, echeanceDe = () => 0 } = ctx;
  const leconItems = items.filter((i) => i.lesson === leconCourante);
  const ech = echeanceDe;

  if (mode === "listen") {
    return melanger([
      ...depuis(dus, SOURCE.DU, RAISON.RAPPEL, T.ECOUTE, ech),
      ...depuis(leconItems, SOURCE.LECON, RAISON.ECOUTE, T.ECOUTE),
      ...depuis(solides, SOURCE.SOLIDE, RAISON.CONSOLIDATION, T.ECOUTE)
    ], rng);
  }

  if (mode === "numbers") {
    // Sélection par étape, pas par position. Trois passages VOULUS.
    const nombres = distincts(items.filter((i) => i.stage === 1));
    const cands = [];
    for (let passe = 0; passe < 3; passe++) {
      for (const it of melanger(nombres, rng)) {
        cands.push(candidature({
          type: T.NOMBRE, it, source: SOURCE.NOMBRE, raison: RAISON.DRILL,
          // Répétition assumée : trois passages sur le même chiffre.
          intentionnelle: true, occurrence: passe
        }));
      }
    }
    return cands;
  }

  if (mode === "dialogue") {
    return melanger(dialogues.filter((d) => d.e <= etapeCourante), rng)
      .map((d) => candidature({ type: T.DIALOGUE, dialogue: d, source: SOURCE.DIALOGUE, raison: RAISON.DIALOGUE }));
  }

  if (mode === "mistakes") {
    const pool = fragiles.length
      ? depuis(fragiles, SOURCE.FRAGILE, RAISON.CORRECTION, T.ORAL, ech)
      : [...depuis(dus, SOURCE.DU, RAISON.RAPPEL, T.ORAL, ech),
         ...depuis(enCours, SOURCE.EN_COURS, RAISON.CONSOLIDATION, T.ORAL, ech)];
    return melanger(pool, rng);
  }

  if (mode === "repeat") {
    // C'est ici que le défaut était le plus visible : neufs ⊂ leconItems.
    const socle = [
      ...depuis(neufs, SOURCE.NEUF, RAISON.DECOUVERTE, T.ORAL),
      ...depuis(dus, SOURCE.DU, RAISON.RAPPEL, T.ORAL, ech),
      ...depuis(enCours, SOURCE.EN_COURS, RAISON.CONSOLIDATION, T.ORAL, ech),
      ...depuis(leconItems, SOURCE.LECON, RAISON.ANCRAGE, T.ORAL)
    ];
    const base = socle.length ? socle : depuis(items, SOURCE.SOCLE, RAISON.ANCRAGE, T.ORAL);
    return melanger(base, rng);
  }

  if (mode === "review") {
    return melanger([
      ...depuis(dus, SOURCE.DU, RAISON.RAPPEL, T.ORAL, ech),
      ...depuis(enCours, SOURCE.EN_COURS, RAISON.CONSOLIDATION, T.ORAL, ech)
    ], rng);
  }

  if (mode === "sprint") {
    return melanger([
      ...depuis(dus, SOURCE.DU, RAISON.RAPPEL, T.ORAL, ech),
      ...depuis(solides, SOURCE.SOLIDE, RAISON.CONSOLIDATION, T.ORAL),
      ...depuis(leconItems, SOURCE.LECON, RAISON.ANCRAGE, T.ORAL)
    ], rng);
  }

  // smart : découverte, rappel, consolidation, alternés.
  const decouverte = distincts(neufs).slice(0, 12);
  const rappel = melanger(dus, rng);
  const conso = melanger([...enCours, ...solides], rng);
  const plan = [];
  let a = 0, b = 0, c = 0;
  while (a < decouverte.length || b < rappel.length || c < conso.length) {
    if (a < decouverte.length) {
      const it = decouverte[a++];
      plan.push(candidature({ type: T.ECOUTE, it, source: SOURCE.NEUF, raison: RAISON.DECOUVERTE }));
      // Répétition immédiate VOULUE : on entend puis on redit. Elle est
      // marquée, donc identifiable, et jamais produite par hasard.
      plan.push(candidature({ type: T.ORAL, it, source: SOURCE.NEUF, raison: RAISON.ANCRAGE,
                              intentionnelle: true, adjacenceVoulue: true, occurrence: 1 }));
    }
    // Deux rappels pour une découverte : le rappel reste majoritaire.
    for (let k = 0; k < 2 && b < rappel.length; k++) {
      const it = rappel[b++];
      plan.push(candidature({ type: T.ORAL, it, source: SOURCE.DU, raison: RAISON.RAPPEL, echeance: ech(it) }));
    }
    if (c < conso.length) {
      const it = conso[c++];
      plan.push(candidature({ type: T.ORAL, it, source: SOURCE.EN_COURS, raison: RAISON.CONSOLIDATION }));
    }
  }
  if (!plan.length) {
    return melanger(depuis(items.filter((i) => i.lesson === leconCourante), SOURCE.LECON, RAISON.ANCRAGE, T.ORAL), rng);
  }
  return plan;
}

/* ===================================================================
   6 · RÉSERVE DE RECYCLAGE
   =================================================================== */

/**
 * Réserve de rappel utilisée quand la file s'épuise avant la fin du
 * temps. Elle contenait elle aussi des doublons : `dus`, `enCours` et
 * `solides` se recouvrent. Une file recyclée pouvait donc répéter la
 * même expression deux fois de suite.
 *
 * @returns {Array} items distincts, ordonnés
 */
export function construireRecyclage({ dus, enCours, solides, items, leconCourante, etapeCourante, rng = rngSysteme }) {
  const travailles = [
    ...depuis(dus, SOURCE.DU, RAISON.RECYCLAGE, T.ORAL),
    ...depuis(enCours, SOURCE.EN_COURS, RAISON.RECYCLAGE, T.ORAL),
    ...depuis(solides, SOURCE.SOLIDE, RAISON.RECYCLAGE, T.ORAL)
  ];
  const distincts = new Set(travailles.map((c) => c.itemId)).size;

  let pool = travailles;
  if (distincts < 8) {
    // Contenu déjà vu insuffisant : on complète avec la leçon courante,
    // les leçons déjà atteintes, puis le reste du programme accessible.
    const atteintes = items.filter((i) => i.lesson <= leconCourante || i.stage <= etapeCourante);
    const socle = atteintes.length ? atteintes : items;
    pool = [...travailles, ...depuis(socle, SOURCE.SOCLE, RAISON.RECYCLAGE, T.ORAL)];
  }

  const { file } = ordonner(melanger(pool, rng));
  return file.slice(0, 80).map((c) => c.it);
}
