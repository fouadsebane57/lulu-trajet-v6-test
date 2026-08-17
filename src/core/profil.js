/* ===================================================================
   PROFIL VOCAL PERSONNEL

   Objectif : que l'application finisse par savoir ce qui, POUR CET
   APPRENANT, résiste.

   PRINCIPE QUI GOUVERNE TOUT LE MODULE

   Une absence de preuve n'est jamais une erreur de prononciation.

   Concrètement : si le moteur n'a pas reconnu la phrase, cela peut
   venir de la prononciation, mais aussi du bruit de la voiture, du
   micro Bluetooth, du réseau, ou du fait que le moteur n'a jamais
   entendu de luxembourgeois d'apprenant francophone. Ces échecs sont
   comptés séparément et n'entrent PAS dans les difficultés.

   Ce que le profil retient réellement :

     phrases souvent ratées      échecs confirmés par un moteur probant
     phrases souvent incertaines le moteur n'a pas su, répétitivement
     phrases oubliées            réussies puis ratées après un délai
     lenteur                     latence de réponse au-dessus de sa
                                 propre moyenne, pas d'un seuil absolu
     paquets fragiles            agrégation par situation

   Ce que le profil ne prétend PAS savoir :

     quels SONS sont mal prononcés. Rien ne permet de le mesurer
     aujourd'hui en luxembourgeois. Le champ existe, il reste vide, et
     l'interface affiche pourquoi.
   =================================================================== */

import { NATURE } from "../speech/engine.js";

export const MAX_EVENEMENTS = 400;

export function profilVide() {
  return {
    schema: 1,
    evenements: [],          // journal court, borné
    parPhrase: {},           // agrégats par identifiant de phrase
    latences: [],            // latences de réponse, en ms
    maj: 0
  };
}

const entreePhrase = () => ({
  reussites: 0,
  echecs: 0,             // confirmés par un moteur probant
  incertitudes: 0,       // le moteur n'a pas su
  pannes: 0,             // micro, réseau, service
  derniereReussite: 0,
  dernierEchec: 0,
  latences: []
});

export function normaliser(p) {
  const v = profilVide();
  if (!p || typeof p !== "object") return v;
  v.evenements = Array.isArray(p.evenements) ? p.evenements.slice(-MAX_EVENEMENTS) : [];
  v.latences = Array.isArray(p.latences) ? p.latences.slice(-200) : [];
  v.maj = Number(p.maj) || 0;
  for (const [id, e] of Object.entries(p.parPhrase || {})) {
    v.parPhrase[id] = { ...entreePhrase(), ...e, latences: Array.isArray(e?.latences) ? e.latences.slice(-10) : [] };
  }
  return v;
}

/**
 * Enregistre le résultat d'une tentative.
 * Chaque nature va dans son propre compteur. C'est ce cloisonnement
 * qui empêche une panne de réseau de devenir une difficulté d'élève.
 */
export function noter(profil, resultat) {
  const p = normaliser(profil);
  const id = resultat?.phrase?.id;
  if (!id) return p;

  if (!p.parPhrase[id]) p.parPhrase[id] = entreePhrase();
  const e = p.parPhrase[id];
  const t = Date.now();

  if (resultat.nature === NATURE.REUSSITE && resultat.fiable) {
    e.reussites += 1; e.derniereReussite = t;
  } else if (resultat.nature === NATURE.ERREUR_UTILISATEUR && resultat.fiable) {
    e.echecs += 1; e.dernierEchec = t;
  } else if (resultat.nature === NATURE.INCERTITUDE_MOTEUR) {
    e.incertitudes += 1;
  } else if (resultat.nature === NATURE.PANNE_TECHNIQUE) {
    e.pannes += 1;
  }

  const l = Math.round(resultat.totalMs || 0);
  if (l > 0 && l < 60000) {
    e.latences = [...e.latences, l].slice(-10);
    p.latences = [...p.latences, l].slice(-200);
  }

  p.evenements = [...p.evenements, {
    t, id, nature: resultat.nature,
    provider: resultat.providerId || "",
    paquet: resultat.phrase.paquet || "",
    fiable: !!resultat.fiable
  }].slice(-MAX_EVENEMENTS);

  p.maj = t;
  return p;
}

/* ---------- Lecture ---------- */

export function latenceMoyenne(profil) {
  const p = normaliser(profil);
  if (!p.latences.length) return null;
  return Math.round(p.latences.reduce((a, b) => a + b, 0) / p.latences.length);
}

/**
 * Phrases réellement difficiles.
 * Le critère est un rapport, pas un compteur brut : une phrase vue
 * vingt fois avec deux échecs n'est pas difficile.
 */
export function phrasesDifficiles(profil, { min = 2, seuil = 0.34 } = {}) {
  const p = normaliser(profil);
  const out = [];
  for (const [id, e] of Object.entries(p.parPhrase)) {
    const tentatives = e.reussites + e.echecs;
    if (e.echecs < min || tentatives === 0) continue;
    const taux = e.echecs / tentatives;
    if (taux >= seuil) out.push({ id, echecs: e.echecs, reussites: e.reussites, taux: Number(taux.toFixed(2)) });
  }
  return out.sort((a, b) => b.taux - a.taux || b.echecs - a.echecs);
}

/**
 * Phrases que le moteur ne reconnaît pas, alors que l'apprenant parle.
 *
 * C'est une information sur l'OUTIL, pas sur l'apprenant. Elle est
 * exposée séparément pour cette raison, et sert à conseiller un autre
 * mode plutôt qu'à corriger l'utilisateur.
 */
export function phrasesNonReconnues(profil, { min = 3 } = {}) {
  const p = normaliser(profil);
  return Object.entries(p.parPhrase)
    .filter(([, e]) => e.incertitudes >= min && e.echecs === 0)
    .map(([id, e]) => ({ id, incertitudes: e.incertitudes }))
    .sort((a, b) => b.incertitudes - a.incertitudes);
}

/** Phrases réussies puis ratées plus tard. L'oubli, mesuré. */
export function phrasesOubliees(profil) {
  const p = normaliser(profil);
  return Object.entries(p.parPhrase)
    .filter(([, e]) => e.reussites > 0 && e.dernierEchec > e.derniereReussite)
    .map(([id, e]) => ({ id, depuisMs: Date.now() - e.dernierEchec }))
    .sort((a, b) => a.depuisMs - b.depuisMs);
}

/** Phrases pour lesquelles la réponse est nettement plus lente que d'habitude. */
export function phrasesLentes(profil, { facteur = 1.5 } = {}) {
  const p = normaliser(profil);
  const moyenne = latenceMoyenne(p);
  if (!moyenne) return [];
  return Object.entries(p.parPhrase)
    .filter(([, e]) => e.latences.length >= 2)
    .map(([id, e]) => ({ id, moyenne: Math.round(e.latences.reduce((a, b) => a + b, 0) / e.latences.length) }))
    .filter((x) => x.moyenne > moyenne * facteur)
    .sort((a, b) => b.moyenne - a.moyenne);
}

/** Paquets où les échecs se concentrent. */
export function paquetsFragiles(profil, resoudrePaquet) {
  const p = normaliser(profil);
  const acc = new Map();
  for (const [id, e] of Object.entries(p.parPhrase)) {
    const pk = resoudrePaquet(id);
    if (!pk) continue;
    if (!acc.has(pk)) acc.set(pk, { paquet: pk, echecs: 0, reussites: 0 });
    const a = acc.get(pk);
    a.echecs += e.echecs; a.reussites += e.reussites;
  }
  return [...acc.values()]
    .filter((a) => a.echecs + a.reussites >= 4 && a.echecs > 0)
    .map((a) => ({ ...a, taux: Number((a.echecs / (a.echecs + a.reussites)).toFixed(2)) }))
    .sort((a, b) => b.taux - a.taux);
}

/**
 * Résumé affiché à l'utilisateur.
 * `sonsDifficiles` est toujours vide et accompagné de sa raison. C'est
 * volontaire : le champ montre ce qui manque au lieu de le taire.
 */
export function resume(profil, resoudrePaquet = () => "") {
  const p = normaliser(profil);
  const evts = p.evenements;
  const parNature = evts.reduce((a, e) => (a[e.nature] = (a[e.nature] || 0) + 1, a), {});
  return {
    tentatives: evts.length,
    parNature,
    latenceMoyenneMs: latenceMoyenne(p),
    difficiles: phrasesDifficiles(p).slice(0, 15),
    nonReconnues: phrasesNonReconnues(p).slice(0, 15),
    oubliees: phrasesOubliees(p).slice(0, 15),
    lentes: phrasesLentes(p).slice(0, 10),
    paquetsFragiles: paquetsFragiles(p, resoudrePaquet).slice(0, 8),
    sonsDifficiles: [],
    raisonSonsVides: "Aucun outil ne sait mesurer les sons du luxembourgeois un par un. Cette liste restera vide tant que ce sera le cas."
  };
}

/**
 * Ajustement de priorité proposé à l'ordonnanceur.
 * Volontairement faible : le profil oriente, il ne décide pas. Les
 * preuves restent la source principale.
 */
export function ajustementPriorite(profil, idPhrase) {
  const p = normaliser(profil);
  const e = p.parPhrase[idPhrase];
  if (!e) return 0;
  if (e.echecs >= 2 && e.echecs > e.reussites) return -1;   // remonte
  if (e.reussites >= 4 && e.echecs === 0) return +1;         // descend
  return 0;
}
