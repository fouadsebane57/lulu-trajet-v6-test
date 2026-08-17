/* PARCOURS · niveaux, paquets, micro-modules
   Fichier GÉNÉRÉ par scripts/build-content.mjs. Ne pas éditer à la main.
   Aucune phrase n'a été inventée. Voir docs/V6_CONTENT.md.
   Statut linguistique : toutes les entrées sont "unverified".
   Le passage en "verified" est un geste humain, dans l'onglet
   Vérification, avec la source. */

export const NIVEAUX = [
 {
  "n": 1,
  "cle": "survie",
  "titre": "Survivre tout de suite",
  "but": "Saluer, remercier, dire qui tu es, et dire que tu n'as pas compris."
 },
 {
  "n": 2,
  "cle": "quotidien",
  "titre": "La vie de tous les jours",
  "but": "Commander, demander un prix, l'heure, le chemin, parler du temps qu'il fait."
 },
 {
  "n": 3,
  "cle": "construire",
  "titre": "Construire tes propres phrases",
  "but": "Conjuguer, nier, placer le verbe, utiliser les articles, parler du passé."
 },
 {
  "n": 4,
  "cle": "comprendre",
  "titre": "Comprendre les autres",
  "but": "Reconnaître les mots de liaison et les phrases entendues à vitesse normale."
 },
 {
  "n": 5,
  "cle": "conversation",
  "titre": "Tenir une conversation",
  "but": "Travail, jeunes, émotions, téléphone et guichet."
 }
];

export const PAQUETS = [
 {
  "id": "pk-saluer",
  "n": 1,
  "cat": "social",
  "t": "Saluer",
  "ctx": "Dans la rue, au travail, partout.",
  "util": 5
 },
 {
  "id": "pk-politesse",
  "n": 1,
  "cat": "social",
  "t": "Merci et s'il vous plaît",
  "ctx": "La politesse ouvre toutes les portes.",
  "util": 5
 },
 {
  "id": "pk-secours",
  "n": 1,
  "cat": "secours",
  "t": "Quand tu ne comprends pas",
  "ctx": "Le paquet le plus utile de toute l'application.",
  "util": 5
 },
 {
  "id": "pk-repondre",
  "n": 1,
  "cat": "social",
  "t": "Oui, non, peut-être",
  "ctx": "Répondre sans faire de phrase.",
  "util": 5
 },
 {
  "id": "pk-cava",
  "n": 1,
  "cat": "social",
  "t": "Comment ça va",
  "ctx": "La question posée cent fois par jour.",
  "util": 5
 },
 {
  "id": "pk-presenter",
  "n": 1,
  "cat": "social",
  "t": "Dire qui tu es",
  "ctx": "Prénom, pays, ville, travail.",
  "util": 5
 },
 {
  "id": "pk-commander",
  "n": 2,
  "cat": "commerce",
  "t": "Au café, commander",
  "ctx": "Café, restaurant, boulangerie.",
  "util": 4
 },
 {
  "id": "pk-prix-heure",
  "n": 2,
  "cat": "commerce",
  "t": "Le prix et l'heure",
  "ctx": "Payer, demander l'heure, donner son âge.",
  "util": 4
 },
 {
  "id": "pk-chemin",
  "n": 2,
  "cat": "deplacer",
  "t": "La route et les transports",
  "ctx": "Demander son chemin, comprendre une indication.",
  "util": 4
 },
 {
  "id": "pk-meteo",
  "n": 2,
  "cat": "quotidien",
  "t": "La maison et la météo",
  "ctx": "La conversation de couloir.",
  "util": 3
 },
 {
  "id": "pk-quand",
  "n": 2,
  "cat": "quotidien",
  "t": "Hier, aujourd'hui, demain",
  "ctx": "Situer une action sans conjuguer.",
  "util": 4
 },
 {
  "id": "pk-jours",
  "n": 2,
  "cat": "quotidien",
  "t": "Les jours de la semaine",
  "ctx": "Prendre un rendez-vous, lire un planning.",
  "util": 3
 },
 {
  "id": "pk-questions",
  "n": 2,
  "cat": "secours",
  "t": "Poser une question",
  "ctx": "Les sept mots en W.",
  "util": 4
 },
 {
  "id": "pk-verbes-ech",
  "n": 3,
  "cat": "structure",
  "t": "Les verbes avec ech",
  "ctx": "La forme que tu emploieras le plus.",
  "util": 4
 },
 {
  "id": "pk-verbes-autres",
  "n": 3,
  "cat": "structure",
  "t": "Tu, il, elle, nous, vous",
  "ctx": "Les autres personnes.",
  "util": 3
 },
 {
  "id": "pk-negation",
  "n": 3,
  "cat": "structure",
  "t": "Dire non",
  "ctx": "net après le verbe, keng devant un nom.",
  "util": 4
 },
 {
  "id": "pk-modaux",
  "n": 3,
  "cat": "structure",
  "t": "Vouloir, pouvoir, devoir",
  "ctx": "Le deuxième verbe part à la fin.",
  "util": 4
 },
 {
  "id": "pk-ordre",
  "n": 3,
  "cat": "structure",
  "t": "L'ordre des mots",
  "ctx": "Le verbe reste à la deuxième place.",
  "util": 3
 },
 {
  "id": "pk-articles",
  "n": 3,
  "cat": "structure",
  "t": "Le, la, un, une",
  "ctx": "Un article faux n'empêche pas d'être compris.",
  "util": 2
 },
 {
  "id": "pk-passe",
  "n": 3,
  "cat": "structure",
  "t": "Parler du passé",
  "ctx": "hunn ou sinn, puis le participe à la fin.",
  "util": 3
 },
 {
  "id": "pk-connecteurs",
  "n": 4,
  "cat": "ecoute",
  "t": "Les petits mots qui portent le sens",
  "ctx": "Les reconnaître suffit à deviner le reste.",
  "util": 4
 },
 {
  "id": "pk-entendu",
  "n": 4,
  "cat": "ecoute",
  "t": "Ce que tu entends tous les jours",
  "ctx": "Des blocs entiers, à ne pas découper.",
  "util": 4
 },
 {
  "id": "pk-travail",
  "n": 5,
  "cat": "travail",
  "t": "Le travail",
  "ctx": "Collègues, chef, réunion, équipe.",
  "util": 4
 },
 {
  "id": "pk-jeunes",
  "n": 5,
  "cat": "travail",
  "t": "Les jeunes et les enfants",
  "ctx": "Le vocabulaire de ton métier.",
  "util": 4
 },
 {
  "id": "pk-emotions",
  "n": 5,
  "cat": "social",
  "t": "Comment tu te sens",
  "ctx": "Dire son état, comprendre celui d'un autre.",
  "util": 4
 },
 {
  "id": "pk-telephone",
  "n": 5,
  "cat": "admin",
  "t": "Au téléphone et au guichet",
  "ctx": "Sans visage et sans gestes, l'exercice le plus dur.",
  "util": 3
 }
];

export const MICRO_MODULES = [
 {
  "id": "mi-chiffres-1",
  "t": "Les chiffres de zéro à cinq",
  "ctx": "Ouvert par le paquet des prix.",
  "n": 2,
  "declencheur": "pk-prix-heure"
 },
 {
  "id": "mi-chiffres-2",
  "t": "De six à douze",
  "ctx": "Suite immédiate.",
  "n": 2,
  "declencheur": "pk-prix-heure"
 },
 {
  "id": "mi-chiffres-3",
  "t": "De treize à vingt",
  "ctx": "La règle du zéng final.",
  "n": 2,
  "declencheur": "pk-prix-heure"
 },
 {
  "id": "mi-chiffres-4",
  "t": "Dizaines, cent, mille",
  "ctx": "zeg contre zéng, la seule confusion.",
  "n": 2,
  "declencheur": "pk-prix-heure"
 },
 {
  "id": "mi-sons",
  "t": "Les trois voyelles nouvelles",
  "ctx": "ë, é, ä. Ouvert dès le niveau 1.",
  "n": 1,
  "declencheur": "pk-saluer"
 },
 {
  "id": "mi-lettres",
  "t": "Les lettres qui trompent",
  "ctx": "w se dit v, v se dit f, s se dit z.",
  "n": 1,
  "declencheur": "pk-secours"
 },
 {
  "id": "mi-alphabet-1",
  "t": "L'alphabet, de A à M",
  "ctx": "Épeler ton nom au guichet.",
  "n": 5,
  "declencheur": "pk-telephone"
 },
 {
  "id": "mi-alphabet-2",
  "t": "L'alphabet, de N à Z",
  "ctx": "La suite.",
  "n": 5,
  "declencheur": "pk-telephone"
 }
];
