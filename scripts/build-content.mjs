/* ===================================================================
   CONSTRUCTION DU CONTENU V6

   Ce script NE FABRIQUE PAS de luxembourgeois.

   Il fait exactement deux choses :

     1. il reprend les 248 expressions distinctes déjà présentes dans
        le corpus GATE 2.5, telles quelles, avec leur identifiant
        permanent, et les réorganise en paquets par SITUATION, dans un
        ordre où les phrases utiles viennent avant les chiffres ;

     2. il produit un petit nombre de phrases DÉRIVÉES, uniquement par
        recombinaison de fragments qui existent DÉJÀ, à l'identique,
        dans le corpus.

   Règle de dérivation, vérifiée par un test :
     une phrase dérivée est la concaténation d'un CADRE et d'un
     COMPLÉMENT dont les deux chaînes exactes apparaissent déjà dans
     une expression attestée du corpus. Aucune flexion n'est inventée,
     aucun article n'est deviné, aucun accord n'est produit par
     analogie. Si le fragment n'existe pas mot pour mot, la dérivation
     est refusée et le script s'arrête.

   Toute phrase dérivée porte :
     derive: true
     de: [ids sources]
     st: "unverified"

   Aucune phrase, reprise ou dérivée, ne devient "verified" ici.
   Le passage en "verified" est un geste humain, fait dans
   l'application, avec la source.
   =================================================================== */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, "..");

/* ---------- 1. Lecture du corpus source ---------- */

const source = process.argv[2] || path.join(RACINE, "scripts", "corpus-gate25.js");
const brut = fs.readFileSync(source, "utf8");
const bac = { window: {} };
vm.createContext(bac);
vm.runInContext(brut + "\n;globalThis.__OUT = { ETAPES, COURS, DIALOGUES };", bac);
const CORPUS = bac.__OUT || bac.globalThis.__OUT;

const attestees = [];
const vus = new Set();
CORPUS.COURS.forEach((lecon, li) => {
  lecon.i.forEach((it) => {
    if (vus.has(it.id)) return;
    vus.add(it.id);
    attestees.push({ ...it, leconSource: li, etapeSource: lecon.e });
  });
});

/* ---------- 2. Niveaux du parcours ---------- */

const NIVEAUX = [
  { n: 1, cle: "survie", titre: "Survivre tout de suite",
    but: "Saluer, remercier, dire qui tu es, et dire que tu n'as pas compris." },
  { n: 2, cle: "quotidien", titre: "La vie de tous les jours",
    but: "Commander, demander un prix, l'heure, le chemin, parler du temps qu'il fait." },
  { n: 3, cle: "construire", titre: "Construire tes propres phrases",
    but: "Conjuguer, nier, placer le verbe, utiliser les articles, parler du passé." },
  { n: 4, cle: "comprendre", titre: "Comprendre les autres",
    but: "Reconnaître les mots de liaison et les phrases entendues à vitesse normale." },
  { n: 5, cle: "conversation", titre: "Tenir une conversation",
    but: "Travail, jeunes, émotions, téléphone et guichet." }
];

/* ---------- 3. Paquets, par situation ---------- */
/* leconSource : index de la leçon GATE 2.5 dont le contenu est repris.
   Rien n'est perdu : les 35 leçons sont toutes reprises. */

const PAQUETS = [
  // Niveau 1, on parle avant d'étudier la langue.
  { id: "pk-saluer",        n: 1, cat: "social",     t: "Saluer",                     ctx: "Dans la rue, au travail, partout.",              de: [9],  util: 5 },
  { id: "pk-politesse",     n: 1, cat: "social",     t: "Merci et s'il vous plaît",   ctx: "La politesse ouvre toutes les portes.",          de: [10], util: 5 },
  { id: "pk-secours",       n: 1, cat: "secours",    t: "Quand tu ne comprends pas",  ctx: "Le paquet le plus utile de toute l'application.", de: [14], util: 5 },
  { id: "pk-repondre",      n: 1, cat: "social",     t: "Oui, non, peut-être",        ctx: "Répondre sans faire de phrase.",                 de: [11], util: 5 },
  { id: "pk-cava",          n: 1, cat: "social",     t: "Comment ça va",              ctx: "La question posée cent fois par jour.",          de: [13], util: 5 },
  { id: "pk-presenter",     n: 1, cat: "social",     t: "Dire qui tu es",             ctx: "Prénom, pays, ville, travail.",                  de: [12], util: 5 },

  // Niveau 2, les situations concrètes.
  { id: "pk-commander",     n: 2, cat: "commerce",   t: "Au café, commander",         ctx: "Café, restaurant, boulangerie.",                 de: [26], util: 4 },
  { id: "pk-prix-heure",    n: 2, cat: "commerce",   t: "Le prix et l'heure",         ctx: "Payer, demander l'heure, donner son âge.",       de: [4],  util: 4 },
  { id: "pk-chemin",        n: 2, cat: "deplacer",   t: "La route et les transports", ctx: "Demander son chemin, comprendre une indication.", de: [27], util: 4 },
  { id: "pk-meteo",         n: 2, cat: "quotidien",  t: "La maison et la météo",      ctx: "La conversation de couloir.",                    de: [28], util: 3 },
  { id: "pk-quand",         n: 2, cat: "quotidien",  t: "Hier, aujourd'hui, demain",  ctx: "Situer une action sans conjuguer.",              de: [24], util: 4 },
  { id: "pk-jours",         n: 2, cat: "quotidien",  t: "Les jours de la semaine",    ctx: "Prendre un rendez-vous, lire un planning.",      de: [23], util: 3 },
  { id: "pk-questions",     n: 2, cat: "secours",    t: "Poser une question",         ctx: "Les sept mots en W.",                            de: [25], util: 4 },

  // Niveau 3, la mécanique de la langue, au service de la parole.
  { id: "pk-verbes-ech",    n: 3, cat: "structure",  t: "Les verbes avec ech",        ctx: "La forme que tu emploieras le plus.",            de: [15], util: 4 },
  { id: "pk-verbes-autres", n: 3, cat: "structure",  t: "Tu, il, elle, nous, vous",   ctx: "Les autres personnes.",                          de: [16, 17], util: 3 },
  { id: "pk-negation",      n: 3, cat: "structure",  t: "Dire non",                   ctx: "net après le verbe, keng devant un nom.",        de: [18], util: 4 },
  { id: "pk-modaux",        n: 3, cat: "structure",  t: "Vouloir, pouvoir, devoir",   ctx: "Le deuxième verbe part à la fin.",               de: [19], util: 4 },
  { id: "pk-ordre",         n: 3, cat: "structure",  t: "L'ordre des mots",           ctx: "Le verbe reste à la deuxième place.",            de: [20], util: 3 },
  { id: "pk-articles",      n: 3, cat: "structure",  t: "Le, la, un, une",            ctx: "Un article faux n'empêche pas d'être compris.",  de: [21], util: 2 },
  { id: "pk-passe",         n: 3, cat: "structure",  t: "Parler du passé",            ctx: "hunn ou sinn, puis le participe à la fin.",      de: [22], util: 3 },

  // Niveau 4, l'oreille.
  { id: "pk-connecteurs",   n: 4, cat: "ecoute",     t: "Les petits mots qui portent le sens", ctx: "Les reconnaître suffit à deviner le reste.", de: [29], util: 4 },
  { id: "pk-entendu",       n: 4, cat: "ecoute",     t: "Ce que tu entends tous les jours",    ctx: "Des blocs entiers, à ne pas découper.",      de: [30], util: 4 },

  // Niveau 5, la conversation réelle.
  { id: "pk-travail",       n: 5, cat: "travail",    t: "Le travail",                 ctx: "Collègues, chef, réunion, équipe.",              de: [31], util: 4 },
  { id: "pk-jeunes",        n: 5, cat: "travail",    t: "Les jeunes et les enfants",  ctx: "Le vocabulaire de ton métier.",                  de: [32], util: 4 },
  { id: "pk-emotions",      n: 5, cat: "social",     t: "Comment tu te sens",         ctx: "Dire son état, comprendre celui d'un autre.",    de: [33], util: 4 },
  { id: "pk-telephone",     n: 5, cat: "admin",      t: "Au téléphone et au guichet", ctx: "Sans visage et sans gestes, l'exercice le plus dur.", de: [34], util: 3 }
];

/* ---------- 4. Micro-modules ---------- */
/* Les chiffres, l'alphabet et les sons ne disparaissent pas. Ils
   cessent d'être le point de départ et deviennent des modules courts,
   ouverts quand le parcours en a besoin. */

const MICRO = [
  { id: "mi-chiffres-1",  t: "Les chiffres de zéro à cinq", ctx: "Ouvert par le paquet des prix.",       n: 2, de: [0], declencheur: "pk-prix-heure" },
  { id: "mi-chiffres-2",  t: "De six à douze",              ctx: "Suite immédiate.",                     n: 2, de: [1], declencheur: "pk-prix-heure" },
  { id: "mi-chiffres-3",  t: "De treize à vingt",           ctx: "La règle du zéng final.",              n: 2, de: [2], declencheur: "pk-prix-heure" },
  { id: "mi-chiffres-4",  t: "Dizaines, cent, mille",       ctx: "zeg contre zéng, la seule confusion.", n: 2, de: [3], declencheur: "pk-prix-heure" },
  { id: "mi-sons",        t: "Les trois voyelles nouvelles", ctx: "ë, é, ä. Ouvert dès le niveau 1.",    n: 1, de: [5], declencheur: "pk-saluer" },
  { id: "mi-lettres",     t: "Les lettres qui trompent",    ctx: "w se dit v, v se dit f, s se dit z.",  n: 1, de: [6], declencheur: "pk-secours" },
  { id: "mi-alphabet-1",  t: "L'alphabet, de A à M",        ctx: "Épeler ton nom au guichet.",           n: 5, de: [7], declencheur: "pk-telephone" },
  { id: "mi-alphabet-2",  t: "L'alphabet, de N à Z",        ctx: "La suite.",                            n: 5, de: [8], declencheur: "pk-telephone" }
];

/* ---------- 5. Dérivations ---------- */
/*
   Chaque dérivation nomme un CADRE et un COMPLÉMENT.
   Les deux doivent apparaître mot pour mot dans une expression
   attestée. Sinon, le script échoue.

   Objectif : donner de quoi varier, sans jamais produire une forme
   que le corpus ne contient pas déjà.
*/

/*
   Les emplacements retenus sont ceux où AUCUN accord n'est à produire :

     après « ass », le nom reste au nominatif, forme de citation ;
     après « ass » ou « si », l'adjectif attribut est invariable ;
     après « bis », le nom de jour reste tel quel ;
     un adverbe placé après le verbe ne change rien ;
     l'inversion verbe-sujet ne modifie ni le verbe ni le pronom.

   Tout emplacement demandant un accusatif, un datif, un pluriel ou un
   accord d'article est volontairement écarté. C'est la raison pour
   laquelle le nombre de phrases dérivées reste modeste : produire
   davantage exigerait de deviner des formes, ce qui est interdit.
*/

/** Noms singuliers attestés, avec leur article exact tel qu'écrit dans le corpus. */
const NOMS_SINGULIERS = [
  { lb: "d'Strooss", fr: "la rue" },
  { lb: "d'Schoul", fr: "l'école" },
  { lb: "d'Haus", fr: "la maison" },
  { lb: "den Zuch", fr: "le train" },
  { lb: "d'Aarbecht", fr: "le travail" },
  { lb: "d'Sitzung", fr: "la réunion" },
  { lb: "d'Grenz", fr: "la frontière" },
  { lb: "d'Rechnung", fr: "l'addition" },
  { lb: "d'Nummer", fr: "le numéro" },
  { lb: "d'Auer", fr: "l'heure" },
  { lb: "de Chef", fr: "le chef" },
  { lb: "de Kolleeg", fr: "le collègue" },
  { lb: "d'Equipe", fr: "l'équipe" },
  { lb: "d'Grupp", fr: "le groupe" },
  { lb: "de Jong", fr: "le garçon" },
  { lb: "d'Meedchen", fr: "la fille" },
  { lb: "d'Kand", fr: "l'enfant" },
  // d'Mamm est volontairement absent : le corpus atteste « Mamm »
  // seul, jamais avec son article. Deviner l'article serait inventer.
  { lb: "d'Fra", fr: "la femme" },
  { lb: "de Mann", fr: "l'homme" },
  { lb: "den Auto", fr: "la voiture" },
  { lb: "de Stau", fr: "l'embouteillage" }
];

/** Adjectifs attributs attestés. Invariables après ass ou si. */
const ADJ_ATTRIBUTS = [
  { lb: "gutt", fr: "bien" },
  { lb: "kloer", fr: "clair" },
  { lb: "schéin", fr: "beau" },
  { lb: "wäit", fr: "loin" },
  { lb: "kal", fr: "froid" },
  { lb: "waarm", fr: "chaud" }
];

const JOURS = [
  { lb: "Méindeg", fr: "lundi" },
  { lb: "Dënschdeg", fr: "mardi" },
  { lb: "Mëttwoch", fr: "mercredi" },
  { lb: "Donneschdeg", fr: "jeudi" },
  { lb: "Freideg", fr: "vendredi" },
  { lb: "Samschdeg", fr: "samedi" },
  { lb: "Sonndeg", fr: "dimanche" }
];

const ADVERBES_TEMPS = [
  { lb: "haut", fr: "aujourd'hui" },
  { lb: "muer", fr: "demain" },
  { lb: "spéider", fr: "plus tard" },
  { lb: "elo", fr: "maintenant" }
];

const DERIVATIONS = [
  // Où est …, le nom reste au nominatif après « ass ».
  { cadre: "Wou ass", frCadre: "où est", suffixe: "?", complements: NOMS_SINGULIERS, paquet: "pk-chemin" },

  // Attribut du sujet, adjectif invariable.
  { cadre: "Dat ass", frCadre: "c'est", complements: ADJ_ATTRIBUTS, paquet: "pk-repondre" },
  { cadre: "Et ass", frCadre: "c'est", complements: ADJ_ATTRIBUTS, paquet: "pk-meteo" },
  { cadre: "Ech si", frCadre: "je suis", complements: [
    { lb: "prett", fr: "prêt" },
    { lb: "midd", fr: "fatigué" },
    { lb: "frou", fr: "content" },
    { lb: "krank", fr: "malade" },
    { lb: "rosen", fr: "en colère" }
  ], paquet: "pk-emotions" },

  // Nom sans article après hunn, formes attestées uniquement.
  { cadre: "Ech hunn", frCadre: "j'ai", complements: [
    { lb: "Honger", fr: "faim" },
    { lb: "Duuscht", fr: "soif" },
    { lb: "Angscht", fr: "peur" },
    { lb: "keng Zäit", fr: "pas le temps" },
    { lb: "e Rendez-vous", fr: "un rendez-vous" }
  ], paquet: "pk-emotions" },

  // Commander. Seuls les deux compléments attestés avec leur article.
  { cadre: "Ech hätt gär", frCadre: "je voudrais", complements: [
    { lb: "e Waasser", fr: "une eau" },
    { lb: "e Kaffi", fr: "un café" }
  ], paquet: "pk-commander" },

  // À bientôt, à lundi. Le nom de jour ne change pas après « bis ».
  { cadre: "Bis", frCadre: "à", complements: JOURS, paquet: "pk-saluer" },

  // Adverbe de temps après le verbe. Aucun accord.
  { cadre: "Ech schaffen", frCadre: "je travaille", complements: ADVERBES_TEMPS, paquet: "pk-quand" },
  { cadre: "Ech kommen", frCadre: "je viens", complements: ADVERBES_TEMPS, paquet: "pk-quand" },
  { cadre: "Ech ginn", frCadre: "je vais", complements: [{ lb: "heem", fr: "à la maison" }], paquet: "pk-quand" },

  // Inversion verbe-sujet, la règle centrale du niveau 3.
  { cadre: "Haut", frCadre: "aujourd'hui,", complements: [
    { lb: "schaffen ech", fr: "je travaille" },
    { lb: "kommen ech", fr: "je viens" },
    { lb: "verstinn ech", fr: "je comprends" }
  ], paquet: "pk-ordre" },
  { cadre: "Muer", frCadre: "demain,", complements: [
    { lb: "schaffen ech", fr: "je travaille" },
    { lb: "kommen ech", fr: "je viens" },
    { lb: "verstinn ech", fr: "je comprends" }
  ], paquet: "pk-ordre" },
  { cadre: "Elo", frCadre: "maintenant,", complements: [
    { lb: "schaffen ech", fr: "je travaille" },
    { lb: "kommen ech", fr: "je viens" },
    { lb: "verstinn ech", fr: "je comprends" }
  ], paquet: "pk-ordre" },

  // Provenance. Nom de pays sans article, forme attestée.
  { cadre: "Ech kommen aus", frCadre: "je viens de", complements: [
    { lb: "Frankräich", fr: "France" },
    { lb: "Lëtzebuerg", fr: "Luxembourg" }
  ], paquet: "pk-presenter" },
  { cadre: "Ech wunnen zu", frCadre: "j'habite à", complements: [
    { lb: "Lëtzebuerg", fr: "Luxembourg" }
  ], paquet: "pk-presenter" },
  { cadre: "Ech schaffen zu", frCadre: "je travaille à", complements: [
    { lb: "Lëtzebuerg", fr: "Luxembourg" }
  ], paquet: "pk-presenter" },

  // Demander de l'aide.
  { cadre: "Kënnt Dir", frCadre: "pouvez-vous", suffixe: "?", complements: [
    { lb: "mir hëllefen", fr: "m'aider" },
    { lb: "dat widderhuelen", fr: "répéter cela" }
  ], paquet: "pk-secours" }
];

/* ---------- 6. Outils ---------- */

/* La ponctuation ne porte pas de son. « E Waasser, wann ech gelift »
   atteste bien le fragment « e Waasser ». On la retire avant de
   comparer, mais jamais dans le texte livré. */
const norme = (s) => String(s || "")
  .normalize("NFC")
  .toLowerCase()
  .replace(/[.,;:!?…«»"'’]/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const corpusTexte = attestees.map((i) => norme(i.lb));
const dialoguesTexte = CORPUS.DIALOGUES.flatMap((d) => d.l.map((r) => norme(r.lb)));
const TOUT = [...corpusTexte, ...dialoguesTexte];

/** Le fragment apparaît-il mot pour mot dans une expression attestée ? */
function fragmentAtteste(fragment) {
  const f = norme(fragment);
  if (!f) return null;
  const hote = attestees.find((i) => {
    const t = norme(i.lb);
    return t === f || t.startsWith(f + " ") || t.endsWith(" " + f) || t.includes(" " + f + " ");
  });
  if (hote) return hote.id;
  const dansDialogue = TOUT.some((t) => t === f || t.startsWith(f + " ") || t.endsWith(" " + f) || t.includes(" " + f + " "));
  return dansDialogue ? "dialogue" : null;
}

let compteur = 0;
function idDerive(lb) {
  // Identifiant stable, dérivé du texte. Deux exécutions du script
  // donnent le même identifiant : la progression n'est jamais perdue.
  let h = 2166136261;
  for (const c of "d6:" + norme(lb)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  compteur++;
  return "dv" + (h >>> 0).toString(16).padStart(8, "0");
}

const syllabesDe = (ph) => {
  if (!ph) return null;
  const n = String(ph).split(/[-\s]+/).filter(Boolean).length;
  return n > 0 ? n : null;
};

/* ---------- 7. Assemblage des phrases ---------- */

const parLeconSource = new Map();
attestees.forEach((it) => {
  if (!parLeconSource.has(it.leconSource)) parLeconSource.set(it.leconSource, []);
  parLeconSource.get(it.leconSource).push(it);
});

const phrases = [];
const erreurs = [];

function poser(base, paquet, niveau, extra = {}) {
  phrases.push({
    id: base.id,
    lb: base.lb,
    fr: base.fr,
    ph: base.ph || "",
    tr: base.tr || "",
    alt: Array.isArray(base.alt) ? base.alt : [],
    syl: base.syl ?? syllabesDe(base.ph),
    paquet,
    niveau,
    st: "unverified",         // jamais promu automatiquement
    src: base.src || "",
    ver: base.ver || "",
    audio: null,              // renseigné quand un audio natif est présent
    ...extra
  });
}

for (const pk of PAQUETS) {
  for (const li of pk.de) {
    const liste = parLeconSource.get(li) || [];
    if (!liste.length) erreurs.push(`Paquet ${pk.id} : leçon source ${li} vide.`);
    for (const it of liste) poser(it, pk.id, pk.n, { util: pk.util, cat: pk.cat, derive: false });
  }
}

for (const mi of MICRO) {
  for (const li of mi.de) {
    const liste = parLeconSource.get(li) || [];
    if (!liste.length) erreurs.push(`Micro-module ${mi.id} : leçon source ${li} vide.`);
    for (const it of liste) poser(it, mi.id, mi.n, { util: 3, cat: "micro", derive: false, micro: true });
  }
}

// Contrôle : aucune expression du corpus ne doit être perdue.
const reprises = new Set(phrases.map((p) => p.id));
for (const it of attestees) {
  if (!reprises.has(it.id)) erreurs.push(`Expression perdue : ${it.id} ${it.lb}`);
}

/* ---------- 8. Dérivations ---------- */

const dejaLa = new Set(phrases.map((p) => norme(p.lb)));

for (const d of DERIVATIONS) {
  const srcCadre = fragmentAtteste(d.cadre);
  if (!srcCadre) { erreurs.push(`Cadre non attesté, dérivation refusée : « ${d.cadre} »`); continue; }
  for (const c of d.complements) {
    const srcComp = fragmentAtteste(c.lb);
    if (!srcComp) { erreurs.push(`Complément non attesté, dérivation refusée : « ${c.lb} »`); continue; }
    const lb = `${d.cadre} ${c.lb}${d.suffixe || ""}`;
    if (dejaLa.has(norme(lb))) continue;      // déjà dans le corpus, rien à dériver
    dejaLa.add(norme(lb));
    const pk = PAQUETS.find((p) => p.id === d.paquet);
    if (!pk) { erreurs.push(`Paquet inconnu : ${d.paquet}`); continue; }
    phrases.push({
      id: idDerive(lb),
      lb,
      fr: `${d.frCadre} ${c.fr}${d.suffixe || ""}`,
      ph: "",
      tr: "",
      alt: [],
      syl: null,
      paquet: pk.id,
      niveau: pk.n,
      st: "unverified",
      src: "",
      ver: "",
      audio: null,
      util: pk.util,
      cat: pk.cat,
      derive: true,
      de: [srcCadre, srcComp].filter((x) => x !== "dialogue")
    });
  }
}

/* ---------- 9. Dialogues ---------- */

const NIVEAU_DIALOGUE = { 3: 1, 5: 2, 6: 5 };
const dialogues = CORPUS.DIALOGUES.map((d, k) => ({
  id: "dl" + String(k + 1).padStart(2, "0"),
  t: d.t,
  niveau: NIVEAU_DIALOGUE[d.e] || 2,
  cat: "conversation",
  st: "unverified",
  l: d.l.map((r) => ({ q: r.q, lb: r.lb, fr: r.fr }))
}));

/* ---------- 10. Écriture ---------- */

if (erreurs.length) {
  console.error("CONSTRUCTION REFUSÉE :");
  erreurs.forEach((e) => console.error("  " + e));
  process.exit(1);
}

const entete = (titre) => `/* ${titre}
   Fichier GÉNÉRÉ par scripts/build-content.mjs. Ne pas éditer à la main.
   Aucune phrase n'a été inventée. Voir docs/V6_CONTENT.md.
   Statut linguistique : toutes les entrées sont "unverified".
   Le passage en "verified" est un geste humain, dans l'onglet
   Vérification, avec la source. */\n\n`;

const dump = (v) => JSON.stringify(v, null, 1);

const moitie = Math.ceil(phrases.length / 2);
fs.writeFileSync(path.join(RACINE, "src/content/phrases-a.js"),
  entete("PHRASES · première moitié") + "export const PHRASES_A = " + dump(phrases.slice(0, moitie)) + ";\n");
fs.writeFileSync(path.join(RACINE, "src/content/phrases-b.js"),
  entete("PHRASES · seconde moitié") + "export const PHRASES_B = " + dump(phrases.slice(moitie)) + ";\n");
fs.writeFileSync(path.join(RACINE, "src/content/dialogues.js"),
  entete("DIALOGUES") + "export const DIALOGUES = " + dump(dialogues) + ";\n");
fs.writeFileSync(path.join(RACINE, "src/content/parcours.js"),
  entete("PARCOURS · niveaux, paquets, micro-modules")
  + "export const NIVEAUX = " + dump(NIVEAUX) + ";\n\n"
  + "export const PAQUETS = " + dump(PAQUETS.map(({ de, ...r }) => r)) + ";\n\n"
  + "export const MICRO_MODULES = " + dump(MICRO.map(({ de, ...r }) => r)) + ";\n");

const version = "v6-" + phrases.length + "-" + dialogues.length;
fs.writeFileSync(path.join(RACINE, "src/content/version.js"),
  entete("VERSION DU CONTENU") + `export const VERSION_CONTENU = ${JSON.stringify(version)};\n`);

console.log(JSON.stringify({
  phrases: phrases.length,
  reprises: phrases.filter((p) => !p.derive).length,
  derivees: phrases.filter((p) => p.derive).length,
  paquets: PAQUETS.length,
  micro: MICRO.length,
  dialogues: dialogues.length,
  niveaux: NIVEAUX.length,
  version
}, null, 1));
