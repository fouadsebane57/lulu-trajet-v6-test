/* ===================================================================
   EXERCICES

   Une PHRASE n'est pas un EXERCICE.
   Une phrase produit plusieurs exercices, chacun avec un objectif
   pédagogique explicite et une DIMENSION de maîtrise visée.

   Un exercice porte un identifiant permanent, construit à partir de
   l'identifiant de la phrase et du type. Il ne dépend d'aucune
   position. Ajouter un type n'invalide donc aucun exercice existant.

   Règle centrale, reprise du modèle de preuves :
   le TYPE d'exercice détermine la dimension qu'il peut faire monter,
   et rien d'autre. Une écoute ne prouvera jamais une production.
   =================================================================== */

import { DIM } from "../core/preuve.js";
import * as C from "../content/index.js";

/**
 * Taxonomie. Pour chaque type :
 *   dim        dimension visée, null si l'exercice ne prouve rien
 *   oral       l'exercice demande de parler
 *   ecran      l'exercice exige de regarder l'écran, donc interdit en trajet
 *   modele     le modèle est entendu avant la réponse
 *   dureeMs    estimation initiale, corrigée par la mesure réelle
 */
export const TYPES = {
  ECOUTE:          { id: "ecoute",          dim: null,             oral: false, ecran: false, modele: true,  dureeMs: 9000,  titre: "Écoute" },
  ECOUTE_LENTE:    { id: "ecoute_lente",    dim: null,             oral: false, ecran: false, modele: true,  dureeMs: 11000, titre: "Écoute lente" },
  REPETITION:      { id: "repetition",      dim: DIM.PRODUCTION,   oral: true,  ecran: false, modele: true,  dureeMs: 17000, titre: "Répète après le modèle" },
  RAPPEL:          { id: "rappel",          dim: DIM.RAPPEL,       oral: true,  ecran: false, modele: false, dureeMs: 18000, titre: "Retrouve la phrase" },
  COMPREHENSION:   { id: "comprehension",   dim: DIM.COMPREHENSION, oral: true, ecran: false, modele: true,  dureeMs: 15000, titre: "Qu'est-ce que ça veut dire ?" },
  PRODUCTION:      { id: "production",      dim: DIM.PRODUCTION,   oral: true,  ecran: false, modele: false, dureeMs: 18000, titre: "À toi de le dire" },
  FLUIDITE:        { id: "fluidite",        dim: DIM.FLUIDITE,     oral: true,  ecran: false, modele: false, dureeMs: 11000, titre: "Vite, sans réfléchir" },
  DISCRIMINATION:  { id: "discrimination",  dim: DIM.COMPREHENSION, oral: true, ecran: false, modele: true,  dureeMs: 20000, titre: "Deux phrases proches" },
  VARIATION:       { id: "variation",       dim: DIM.TRANSFERT,    oral: true,  ecran: false, modele: false, dureeMs: 19000, titre: "Même structure, autre mot" },
  DIALOGUE:        { id: "dialogue",        dim: DIM.TRANSFERT,    oral: true,  ecran: false, modele: true,  dureeMs: 45000, titre: "Réponds dans la conversation" },
  ECOUTE_DIALOGUE: { id: "ecoute_dialogue", dim: null,             oral: false, ecran: false, modele: true,  dureeMs: 40000, titre: "Écoute la conversation" },
  TEST_DIFFERE:    { id: "test_differe",    dim: DIM.RAPPEL,       oral: true,  ecran: false, modele: false, dureeMs: 16000, titre: "Contrôle différé" },
  NOMBRE:          { id: "nombre",          dim: DIM.COMPREHENSION, oral: true, ecran: false, modele: true,  dureeMs: 9000,  titre: "Quel nombre ?" }
};

export const LISTE_TYPES = Object.values(TYPES);
export const typeDe = (id) => LISTE_TYPES.find((t) => t.id === id) || null;

/** Types utilisables sans regarder l'écran. Tous, par construction. */
export const typesTrajet = () => LISTE_TYPES.filter((t) => !t.ecran);

/** Identifiant permanent d'un exercice. */
export const idExercice = (idPhrase, idType, variante = "") =>
  `ex:${idPhrase}:${idType}${variante ? ":" + variante : ""}`;

/* ---------- Voisins phonétiques, pour la discrimination ---------- */

function distance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  let c = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    c[0] = i;
    for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const t = p; p = c; c = t;
  }
  return p[n];
}

/**
 * Voisin le plus proche DANS LE MÊME PAQUET.
 * Comparer deux phrases de paquets différents n'apprend rien : la
 * discrimination n'a d'intérêt qu'entre formes réellement confondues.
 */
function voisin(phrase, memePaquet) {
  let meilleur = null, d = Infinity;
  for (const autre of memePaquet) {
    if (autre.id === phrase.id) continue;
    const x = distance(autre.lb.toLowerCase(), phrase.lb.toLowerCase());
    if (x < d) { d = x; meilleur = autre; }
  }
  // Au-delà de cette distance, les deux formes ne se ressemblent plus.
  return d <= 5 ? meilleur : null;
}

/**
 * Phrase de même structure, pour l'exercice de variation.
 * On s'appuie sur les phrases DÉRIVÉES, qui partagent explicitement
 * un cadre. Aucune analyse grammaticale n'est tentée.
 */
function memeCadre(phrase, toutes) {
  const tete = phrase.lb.split(" ").slice(0, 2).join(" ").toLowerCase();
  if (tete.length < 4) return null;
  return toutes.find((p) => p.id !== phrase.id && p.lb.toLowerCase().startsWith(tete)) || null;
}

/* ---------- Génération ---------- */

/**
 * Exercices produits par une phrase.
 * Le nombre dépend de ce que la phrase permet réellement :
 * une phrase sans voisin proche n'a pas d'exercice de discrimination,
 * une phrase sans structure partagée n'a pas de variation.
 */
export function exercicesDe(phrase, contexte = {}) {
  const memePaquet = contexte.memePaquet || C.phrasesDuPaquet(phrase.paquet);
  const toutes = contexte.toutes || C.phrases();
  const out = [];
  const pousser = (t, extra = {}) => out.push({
    id: idExercice(phrase.id, t.id, extra.variante || ""),
    type: t.id,
    dim: t.dim,
    oral: t.oral,
    ecran: t.ecran,
    idPhrase: phrase.id,
    paquet: phrase.paquet,
    niveau: phrase.niveau,
    dureeMs: t.dureeMs,
    ...extra
  });

  // Socle, valable pour toute phrase.
  pousser(TYPES.ECOUTE);
  pousser(TYPES.ECOUTE_LENTE);
  pousser(TYPES.REPETITION);
  pousser(TYPES.COMPREHENSION);
  pousser(TYPES.RAPPEL);
  pousser(TYPES.PRODUCTION);
  pousser(TYPES.TEST_DIFFERE);

  // La fluidité n'a de sens qu'une fois la production acquise. Elle est
  // générée, mais l'ordonnanceur ne la propose qu'à partir d'un niveau.
  pousser(TYPES.FLUIDITE);

  // Les nombres gardent leur exercice propre, dans les micro-modules.
  if (phrase.cat === "micro" && phrase.paquet.startsWith("mi-chiffres")) {
    pousser(TYPES.NOMBRE);
  }

  const v = voisin(phrase, memePaquet);
  if (v) pousser(TYPES.DISCRIMINATION, { idAutre: v.id, variante: v.id });

  const m = memeCadre(phrase, toutes);
  if (m) pousser(TYPES.VARIATION, { idAutre: m.id, variante: m.id });

  return out;
}

/** Exercices issus d'un dialogue : une écoute, puis un tour par réplique. */
export function exercicesDeDialogue(d) {
  const out = [{
    id: `ex:${d.id}:${TYPES.ECOUTE_DIALOGUE.id}`,
    type: TYPES.ECOUTE_DIALOGUE.id,
    dim: null, oral: false, ecran: false,
    idDialogue: d.id, niveau: d.niveau,
    dureeMs: TYPES.ECOUTE_DIALOGUE.dureeMs
  }];
  d.l.forEach((rep, k) => {
    // L'utilisateur tient le rôle B. Il répond, LULU joue A.
    if (rep.q !== "B") return;
    out.push({
      id: `ex:${d.id}:${TYPES.DIALOGUE.id}:${k}`,
      type: TYPES.DIALOGUE.id,
      dim: TYPES.DIALOGUE.dim, oral: true, ecran: false,
      idDialogue: d.id, tour: k, niveau: d.niveau,
      dureeMs: TYPES.DIALOGUE.dureeMs
    });
  });
  return out;
}

let _cache = null;

/** Catalogue complet. Construit une fois, puis servi depuis le cache. */
export function catalogue() {
  if (_cache) return _cache;
  const toutes = C.phrases();
  const parPaquet = new Map();
  for (const p of toutes) {
    if (!parPaquet.has(p.paquet)) parPaquet.set(p.paquet, []);
    parPaquet.get(p.paquet).push(p);
  }
  const out = [];
  for (const p of toutes) out.push(...exercicesDe(p, { memePaquet: parPaquet.get(p.paquet), toutes }));
  for (const d of C.DIALOGUES()) out.push(...exercicesDeDialogue(d));
  _cache = out;
  return out;
}

export function reinitialiserCache() { _cache = null; }

export const exercicesDePhrase = (idPhrase) => catalogue().filter((e) => e.idPhrase === idPhrase);
export const exerciceParId = (id) => catalogue().find((e) => e.id === id) || null;

/** Répartition par type. Chiffres exacts, affichés tels quels. */
export function repartition() {
  const r = {};
  for (const e of catalogue()) r[e.type] = (r[e.type] || 0) + 1;
  return r;
}

export const total = () => catalogue().length;
