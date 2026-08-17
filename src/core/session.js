/* ===================================================================
   MOTEUR DE SÉANCE

   Une séance est un FLUX, pas une liste. À chaque tour :

     temps restant -> estimation du prochain exercice -> continuer ou clore

   L'estimation s'ajuste sur les durées réellement observées. Un
   exercice commencé n'est jamais coupé au milieu.

   CE QUI CHANGE PAR RAPPORT À LA 5.1.0

   La file ne contient plus des expressions à travailler « d'une
   certaine façon ». Elle contient des EXERCICES, chacun avec son type
   et la dimension qu'il vise. C'est ce qui permet de proposer la même
   phrase en écoute puis en rappel actif trois minutes plus tard, sans
   que ce soit une répétition accidentelle.

   DOSAGE DES NOUVEAUTÉS

   Une séance ne peut pas introduire plus de `maxNouvelles` phrases.
   Au-delà, tout le temps restant va à la consolidation. Sans cette
   limite, une séance de soixante minutes ouvre quarante phrases dont
   aucune ne sera retenue.

   ESPACEMENT

   La construction de la file passe par core/file.js, qui distingue une
   répétition VOULUE d'un doublon issu du recouvrement de deux listes.
   Rien n'est supprimé en silence, les occurrences sont déplacées.
   =================================================================== */

import { resoudreRng } from "./rng.js";
import { candidature, ordonner, SOURCE, RAISON } from "./file.js";
import { normaliser } from "./preuve.js";
import * as Sched from "./scheduler.js";
import { TYPES, typeDe } from "../content/exercices.js";

export const MODES = {
  TRAJET: "trajet",         // aucune interaction visuelle après le lancement
  APPRENTISSAGE: "arret",   // écran autorisé
  REVISION: "revision",     // uniquement ce qui est dû
  DECOUVERTE: "decouverte", // nouvelles phrases, sans révision
  DIALOGUE: "dialogue",     // conversations
  FRAGILE: "fragile"        // ce qui résiste
};

const RESERVE_CLOTURE_MS = 20000;

/** Nombre de phrases nouvelles autorisées, selon la durée. */
export function maxNouvelles(minutes) {
  if (minutes <= 10) return 3;
  if (minutes <= 20) return 5;
  if (minutes <= 30) return 7;
  return 9;
}

/**
 * Construit une séance.
 *
 * @param {object} o
 * @param {string} o.mode
 * @param {number} o.dureeMinutes
 * @param {Array}  o.phrases            contenu disponible pour ce niveau
 * @param {Array}  o.dialogues
 * @param {function} o.progressionDe    id -> entrée de preuve
 * @param {object} o.profil             profil vocal, facultatif
 * @param {number} o.seed               graine, pour reproduire une file
 */
export function creerSeance(o) {
  const minutes = Math.max(1, Number(o.dureeMinutes) || 10);
  const tirage = resoudreRng({ rng: o.rng, seed: o.seed });
  const prog = (id) => normaliser(o.progressionDe?.(id));
  const maintenant = o.maintenant || Date.now();

  const phrases = (o.phrases || []).filter(Boolean);
  const neuves = phrases.filter((p) => Sched.estNeuve(prog(p.id)));
  const dues = phrases.filter((p) => Sched.estDue(prog(p.id), maintenant));
  const exposees = phrases.filter((p) => Sched.estExposeeSeulement(prog(p.id)));
  const enCours = phrases.filter((p) => {
    const e = prog(p.id);
    return !Sched.estNeuve(e) && !Sched.estSolide(e) && !Sched.estDue(e, maintenant);
  });
  const solides = phrases.filter((p) => Sched.estSolide(prog(p.id)));

  const plafond = maxNouvelles(minutes);
  const contexte = {
    mode: o.mode || MODES.TRAJET,
    minutes, plafond, maintenant,
    prog, tirage,
    neuves, dues, exposees, enCours, solides,
    dialogues: o.dialogues || [],
    profil: o.profil || null
  };

  const construite = ordonner(candidatures(contexte));

  return {
    mode: contexte.mode,
    cibleMs: minutes * 60000,
    demarree: false,
    debut: 0,
    index: 0,
    idSession: "s" + Math.round(maintenant / 1000).toString(36),
    nouvellesIntroduites: 0,
    plafondNouvelles: plafond,
    reussites: 0,
    tentatives: 0,
    probantes: 0,
    estimations: estimationsInitiales(),
    historique: [],
    sautes: 0,
    rng: tirage,
    file: construite.file,
    diagnosticFile: construite.diagnostic,
    dernierId: "",
    // Reprise en fin de séance : uniquement du contenu DÉJÀ RENCONTRÉ,
    // jamais une phrase neuve ouverte à la dernière minute.
    recyclage: recyclage(contexte, construite.file)
  };
}

function estimationsInitiales() {
  const e = {};
  for (const t of Object.values(TYPES)) e[t.id] = t.dureeMs;
  return e;
}

/* ---------- Construction des candidatures ---------- */

function exercice(phrase, type, extra = {}) {
  const t = typeDe(type);
  return candidature({
    type,
    it: phrase,
    source: extra.source || SOURCE.LECON,
    raison: extra.raison || RAISON.ANCRAGE,
    echeance: extra.echeance || 0,
    intentionnelle: !!extra.intentionnelle,
    adjacenceVoulue: !!extra.adjacenceVoulue,
    occurrence: extra.occurrence || 0,
    ...(t ? {} : {})
  });
}

/**
 * Séquence de découverte d'une phrase neuve.
 *
 * Écoute, puis écoute lente, puis répétition immédiate. Les trois sont
 * soudées : les séparer priverait la répétition de son modèle. C'est
 * la seule adjacence VOULUE de la construction, et elle est marquée
 * comme telle pour que le contrôle d'espacement ne la défasse pas.
 */
function decouverte(phrase) {
  return [
    exercice(phrase, TYPES.ECOUTE.id, { source: SOURCE.NEUF, raison: RAISON.DECOUVERTE }),
    exercice(phrase, TYPES.ECOUTE_LENTE.id, { source: SOURCE.NEUF, raison: RAISON.DECOUVERTE, intentionnelle: true, adjacenceVoulue: true, occurrence: 1 }),
    exercice(phrase, TYPES.REPETITION.id, { source: SOURCE.NEUF, raison: RAISON.ANCRAGE, intentionnelle: true, adjacenceVoulue: true, occurrence: 2 })
  ];
}

/**
 * Exercice de reprise, choisi selon ce que la phrase a déjà prouvé.
 * Une phrase seulement entendue ne part pas en rappel actif.
 */
function reprise(phrase, entree, extra) {
  const admis = Sched.typesAdmissibles(entree);
  const dim = Sched.dimensionSuivante(entree);
  const voulu = {
    comprehension: TYPES.COMPREHENSION.id,
    rappel: TYPES.RAPPEL.id,
    production: TYPES.PRODUCTION.id,
    fluidite: TYPES.FLUIDITE.id,
    transfert: TYPES.VARIATION.id
  }[dim] || TYPES.PRODUCTION.id;
  const type = admis.includes(voulu) ? voulu : (admis.includes(TYPES.COMPREHENSION.id) ? TYPES.COMPREHENSION.id : TYPES.ECOUTE.id);
  return exercice(phrase, type, extra);
}

function candidatures(ctx) {
  const { mode, prog, tirage, neuves, dues, exposees, enCours, solides, dialogues, plafond, maintenant } = ctx;
  const melanger = (a) => a.slice().sort(() => (tirage() < 0.5 ? -1 : 1));
  const out = [];

  if (mode === MODES.DIALOGUE) {
    for (const d of melanger(dialogues)) {
      out.push(candidature({ type: TYPES.ECOUTE_DIALOGUE.id, dialogue: d, source: SOURCE.DIALOGUE, raison: RAISON.DIALOGUE }));
      out.push(candidature({ type: TYPES.DIALOGUE.id, dialogue: d, source: SOURCE.DIALOGUE, raison: RAISON.DIALOGUE, intentionnelle: true, occurrence: 1 }));
    }
    return out;
  }

  if (mode === MODES.REVISION) {
    for (const p of melanger(dues)) {
      out.push(reprise(p, prog(p.id), { source: SOURCE.DU, raison: RAISON.RAPPEL, echeance: Sched.echeance(prog(p.id)) }));
    }
    for (const p of melanger(enCours)) {
      out.push(reprise(p, prog(p.id), { source: SOURCE.EN_COURS, raison: RAISON.CONSOLIDATION }));
    }
    return out.length ? out : melanger(solides).map((p) => exercice(p, TYPES.PRODUCTION.id, { source: SOURCE.SOLIDE, raison: RAISON.CONSOLIDATION }));
  }

  if (mode === MODES.FRAGILE) {
    const fragiles = ctx.phrasesFragiles || dues.filter((p) => {
      const e = prog(p.id);
      return Object.values(e.dims).some((d) => (d.echecs || 0) > 0);
    });
    const pool = fragiles.length ? fragiles : dues;
    for (const p of melanger(pool)) {
      out.push(exercice(p, TYPES.ECOUTE.id, { source: SOURCE.FRAGILE, raison: RAISON.CORRECTION }));
      out.push(exercice(p, TYPES.REPETITION.id, { source: SOURCE.FRAGILE, raison: RAISON.CORRECTION, intentionnelle: true, adjacenceVoulue: true, occurrence: 1 }));
      out.push(exercice(p, TYPES.PRODUCTION.id, { source: SOURCE.FRAGILE, raison: RAISON.CORRECTION }));
    }
    return out;
  }

  if (mode === MODES.DECOUVERTE) {
    for (const p of neuves.slice(0, plafond)) out.push(...decouverte(p));
    return out;
  }

  /* Mode principal : trajet et apprentissage.
     La révision passe AVANT la découverte. Ouvrir une phrase neuve
     alors qu'une phrase due attend, c'est perdre le bénéfice de la
     répétition espacée. */

  const dusTries = melanger(dues).sort((a, b) =>
    Sched.priorite(prog(a.id), a, maintenant) - Sched.priorite(prog(b.id), b, maintenant));

  const aOuvrir = melanger(neuves)
    .sort((a, b) => (b.util || 3) - (a.util || 3))
    .slice(0, plafond);

  // Entrelacement : deux reprises pour une découverte. La reprise reste
  // majoritaire, la nouveauté ne noie jamais la séance.
  let i = 0, j = 0, k = 0;
  const consolidables = melanger([...enCours, ...exposees, ...solides]);

  while (i < dusTries.length || j < aOuvrir.length || k < consolidables.length) {
    for (let n = 0; n < 2 && i < dusTries.length; n++) {
      const p = dusTries[i++];
      out.push(reprise(p, prog(p.id), { source: SOURCE.DU, raison: RAISON.RAPPEL, echeance: Sched.echeance(prog(p.id)) }));
    }
    if (j < aOuvrir.length) out.push(...decouverte(aOuvrir[j++]));
    if (k < consolidables.length) {
      const p = consolidables[k++];
      out.push(reprise(p, prog(p.id), { source: SOURCE.EN_COURS, raison: RAISON.CONSOLIDATION }));
    }
  }

  // Un dialogue en milieu de séance, dès qu'il y en a un d'accessible.
  //
  // L'insertion ne doit jamais tomber À L'INTÉRIEUR d'une séquence
  // soudée. Une découverte coupée en deux perd son modèle : l'écoute
  // se retrouve d'un côté, la répétition de l'autre, et l'apprenant
  // doit répéter une phrase entendue cinq minutes plus tôt.
  if (dialogues.length && ctx.minutes >= 15) {
    const d = dialogues[Math.floor(tirage() * dialogues.length)];
    let position = Math.floor(out.length * 0.6);
    while (position < out.length && out[position]?.adjacenceVoulue) position += 1;
    out.splice(position, 0,
      candidature({ type: TYPES.ECOUTE_DIALOGUE.id, dialogue: d, source: SOURCE.DIALOGUE, raison: RAISON.DIALOGUE }));
  }

  if (!out.length) {
    // Aucune progression, aucun contenu dû : on ouvre le début du parcours.
    for (const p of (ctx.neuves.length ? ctx.neuves : ctx.solides).slice(0, plafond)) out.push(...decouverte(p));
  }
  return out;
}

/**
 * Réserve de fin de séance.
 *
 * Elle contient deux choses, et seulement ces deux-là :
 *
 *   les phrases déjà connues avant la séance ;
 *   les phrases OUVERTES pendant cette séance.
 *
 * Le second point n'est pas un relâchement, c'est le cœur du dispositif.
 * Sans lui, une toute première séance s'arrêtait au bout de quatre
 * minutes : cinq phrases découvertes, quinze exercices, file vide. Or
 * c'est précisément la reprise d'une phrase dix minutes après sa
 * découverte qui la fait tenir. Les paliers commencent à dix minutes
 * pour cette raison ; encore faut-il que la séance ait de quoi les
 * honorer.
 *
 * Une phrase entre dans la réserve seulement si elle figure déjà dans
 * la file : au moment où la réserve est consommée, elle a donc été
 * entendue, dite lentement et répétée.
 */
function recyclage(ctx, file) {
  const { dues, enCours, solides, exposees } = ctx;
  const ouvertesIci = [];
  const dansLaFile = new Set();
  for (const c of file || []) {
    if (!c.it || dansLaFile.has(c.it.id)) continue;
    dansLaFile.add(c.it.id);
    ouvertesIci.push(c.it);
  }
  const uniques = [];
  const vu = new Set();
  for (const p of [...dues, ...enCours, ...solides, ...exposees, ...ouvertesIci]) {
    if (vu.has(p.id)) continue;
    vu.add(p.id);
    uniques.push(p);
  }
  return uniques.slice(0, 80);
}

/* ---------- Déroulement ---------- */

export function demarrer(s, maintenant = Date.now()) { s.debut = maintenant; s.demarree = true; return s; }
export const ecouleMs = (s, maintenant = Date.now()) => (s.demarree ? Math.max(0, maintenant - s.debut) : 0);
export const restantMs = (s, maintenant = Date.now()) => Math.max(0, s.cibleMs - ecouleMs(s, maintenant));
export const progressionTemps = (s, maintenant = Date.now()) => Math.min(1, ecouleMs(s, maintenant) / s.cibleMs);

const idDe = (e) => e?.it?.id || e?.dialogue?.id || e?.itemId || "";

/** Prochain exercice, ou null si la séance doit se clore. */
export function prochain(s, maintenant = Date.now()) {
  const restant = restantMs(s, maintenant) - RESERVE_CLOTURE_MS;
  if (restant <= 0) return null;

  eviterRepetitionImmediate(s);

  let candidat = s.file[s.index];
  if (!candidat) {
    if (!s.recyclage.length) return null;
    const n = s.recyclage.length;
    let k = s.index % n;
    if (n > 1 && s.recyclage[k]?.id === s.dernierId) k = (k + 1) % n;
    candidat = {
      type: TYPES.PRODUCTION.id, it: s.recyclage[k], recycle: true,
      source: "recyclage", raison: "recyclage", intentionnelle: true,
      itemId: s.recyclage[k]?.id || ""
    };
  }

  const estime = s.estimations[candidat.type] || 15000;
  if (estime > restant) {
    const courts = s.file.slice(s.index).filter((e) => (s.estimations[e.type] || 15000) <= restant);
    if (!courts.length) return null;
    return courts.find((e) => idDe(e) !== s.dernierId) || courts[0];
  }
  return candidat;
}

/**
 * Consomme une position.
 * Un exercice pris plus loin dans la file est RETIRÉ à sa place et
 * l'index ne bouge pas : rien n'est sauté en silence.
 */
function consommerPosition(s, ex) {
  const pos = s.file.indexOf(ex);
  if (pos < 0) { s.index += 1; return pos; }
  if (pos === s.index) { s.index = pos + 1; return pos; }
  s.file.splice(pos, 1);
  return pos;
}

function eviterRepetitionImmediate(s) {
  const courant = s.file[s.index];
  if (!courant || !s.dernierId) return;
  if (courant.adjacenceVoulue) return;
  if (idDe(courant) !== s.dernierId) return;

  let j = s.index + 1;
  while (j < s.file.length && (idDe(s.file[j]) === s.dernierId || s.file[j].adjacenceVoulue)) j++;
  if (j >= s.file.length) return;

  let fin = j + 1;
  while (fin < s.file.length && s.file[fin].adjacenceVoulue && idDe(s.file[fin]) === idDe(s.file[j])) fin++;
  s.file.splice(s.index, 0, ...s.file.splice(j, fin - j));
}

export function sauterExercice(s, ex) {
  s.historique.push({ type: ex.type, dureeMs: 0, saute: true, id: idDe(ex) });
  const id = idDe(ex);
  const pos = consommerPosition(s, ex);
  // Les occurrences soudées à celle-ci portent la même expression et
  // n'existent que pour la suivre. Sauter une phrase les saute toutes.
  if (pos >= 0) {
    while (s.file[s.index]?.adjacenceVoulue && idDe(s.file[s.index]) === id) {
      s.historique.push({ type: s.file[s.index].type, dureeMs: 0, saute: true, id, lie: true });
      s.index += 1;
    }
  }
  s.sautes += 1;
  s.dernierId = id;
  return s;
}

export function terminerExercice(s, ex, dureeMs) {
  const t = ex.type;
  const prec = s.estimations[t] || 15000;
  s.estimations[t] = Math.round(prec * 0.65 + dureeMs * 0.35);
  s.historique.push({ type: t, dureeMs, id: idDe(ex) });
  if (ex.raison === RAISON.DECOUVERTE && !ex.adjacenceVoulue) s.nouvellesIntroduites += 1;
  consommerPosition(s, ex);
  s.dernierId = idDe(ex);
  return s;
}

export function bilan(s, maintenant = Date.now()) {
  return {
    minutes: Math.round(ecouleMs(s, maintenant) / 60000),
    minutesCible: Math.round(s.cibleMs / 60000),
    exercices: s.historique.filter((h) => !h.saute).length,
    sautes: s.sautes,
    tentatives: s.tentatives,
    // Aucune précision affichée sans mesure probante. On n'invente pas
    // de pourcentage à partir de tentatives non vérifiées.
    probantes: s.probantes,
    reussites: s.reussites,
    precision: s.probantes ? Math.round((s.reussites / s.probantes) * 100) : null,
    nouvellesIntroduites: s.nouvellesIntroduites
  };
}

export { TYPES };
