/* ===================================================================
   SYNTHÈSE VOCALE

   Règle : on cherche d'abord une voix lb-LU réelle. Si elle n'existe
   pas sur l'appareil, on le dit clairement et on nomme la voix de
   remplacement utilisée. On ne prétend jamais parler luxembourgeois
   avec une voix allemande.

   Ordre de préférence, du meilleur au moins bon :
     1. lb-LU ou lb, vraie voix luxembourgeoise
     2. de-LU, allemand du Luxembourg
     3. de-DE ou de-AT, allemand standard, approximation
     4. nl-NL, si rien d'autre, très approximatif

   Limite connue et non contournable en web : sur iPhone, la synthèse
   s'arrête quand l'écran se verrouille. La solution durable est
   l'audio pré-enregistré, lu par un élément audio, qui lui continue.
   L'architecture de audio/voix-modele.js est faite pour cela : dès
   qu'un fichier natif existe pour une phrase, il passe devant la
   synthèse sans qu'aucun autre module ne change.
   =================================================================== */

import * as SessionIOS from "./session-ios.js";

let voix = [];
let voixLb = null;
let voixFr = null;
let dernier = null;
let qualite = "aucune";   // native | regionale | approximation | eloignee | aucune

export const dispo = () => "speechSynthesis" in window;

const RANGS = [
  { test: (l) => /^lb/i.test(l),        qualite: "native",        note: "Voix luxembourgeoise" },
  { test: (l) => /^de-LU/i.test(l),     qualite: "regionale",     note: "Allemand du Luxembourg" },
  { test: (l) => /^de/i.test(l),        qualite: "approximation", note: "Allemand, approximation" },
  { test: (l) => /^nl/i.test(l),        qualite: "eloignee",      note: "Néerlandais, très approximatif" }
];

function reglages() {
  // La clé V6 range les réglages sous « reglages ». L'ancien nom
  // « settings » est encore accepté pour ne rien casser.
  try {
    const brut = JSON.parse(localStorage.getItem("lulu:v6") || "{}");
    const r = brut.reglages || brut.settings || {};
    return {
      voiceRate: r.vitesseVoix ?? r.voiceRate,
      luxVoice: r.voixLb ?? r.luxVoice,
      frVoice: r.voixFr ?? r.frVoice
    };
  } catch (_) { return {}; }
}

export function chargerVoix() {
  if (!dispo()) return { candidats: [], fr: [] };
  voix = speechSynthesis.getVoices() || [];

  const candidats = [];
  for (const rang of RANGS) {
    for (const v of voix) {
      if (rang.test(v.lang) && !candidats.some((x) => x.voice.name === v.name)) {
        candidats.push({ voice: v, qualite: rang.qualite, note: rang.note });
      }
    }
  }
  const fr = voix.filter((v) => /^fr/i.test(v.lang));

  const s = reglages();
  const choisie = candidats.find((c) => c.voice.name === s.luxVoice) || candidats[0] || null;
  voixLb = choisie?.voice || null;
  qualite = choisie?.qualite || "aucune";
  voixFr = voix.find((v) => v.name === s.frVoice) || fr[0] || null;

  remplir("selVoixLb", candidats.map((c) => ({ value: c.voice.name, label: `${c.note} · ${c.voice.name}` })), voixLb?.name);
  remplir("selVoixFr", fr.map((v) => ({ value: v.name, label: v.name })), voixFr?.name);
  return { candidats, fr };
}

function remplir(id, options, valeur) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = options.length
    ? options.map((o) => `<option value="${String(o.value).replace(/"/g, "&quot;")}">${o.label}</option>`).join("")
    : `<option value="">Aucune voix compatible sur cet appareil</option>`;
  if (valeur) el.value = valeur;
}

export const voixLuxembourgeoiseReelle = () => qualite === "native";
export const qualiteVoix = () => qualite;
export const voixActuelles = () => ({ lb: voixLb, fr: voixFr });

/** Phrase exacte à afficher dans le diagnostic. Aucune promesse fausse. */
export function descriptionVoix() {
  if (!dispo()) return { etat: "bad", texte: "La synthèse vocale n'existe pas sur ce navigateur." };
  if (!voixLb) return { etat: "bad", texte: "Aucune voix utilisable trouvée sur cet appareil." };
  const par = {
    native:        { etat: "ok",   prefixe: "Voix luxembourgeoise réelle" },
    regionale:     { etat: "warn", prefixe: "Pas de voix lb-LU. Allemand du Luxembourg utilisé" },
    approximation: { etat: "warn", prefixe: "Pas de voix lb-LU. Allemand standard utilisé, prononciation approchée" },
    eloignee:      { etat: "bad",  prefixe: "Pas de voix lb-LU. Remplacement très approximatif" }
  }[qualite] || { etat: "bad", prefixe: "Voix inconnue" };
  return { etat: par.etat, texte: `${par.prefixe} : ${voixLb.name} (${voixLb.lang}).` };
}

/** Prépare le moteur. À appeler depuis un geste utilisateur, iOS l'exige. */
export async function preparer() {
  if (!dispo()) return;
  try { speechSynthesis.cancel(); } catch (_) {}
  chargerVoix();
  if (!voix.length) {
    await new Promise((r) => {
      speechSynthesis.onvoiceschanged = () => { chargerVoix(); r(); };
      setTimeout(r, 800);
    });
  }
}

/* ===================================================================
   RÉSULTAT D'UN ÉNONCÉ

   Défaut corrigé, constaté sur iPhone réel.

   L'ancienne version résolvait sa promesse de la MÊME FAÇON dans
   quatre situations distinctes :

     onend        l'énoncé est allé à son terme
     onerror      le moteur a échoué
     exception    speak() a levé
     surveillance le moteur n'a jamais démarré

   Pire, la surveillance interrogeait `speechSynthesis.speaking` toutes
   les 250 ms en partant du principe qu'un énoncé démarre tout de
   suite. Sur iOS, si l'activation utilisateur a été perdue, `speak()`
   ne démarre jamais : `speaking` reste faux, la surveillance conclut
   « terminé » au bout de 250 ms, et l'application enchaîne en silence.

   C'est exactement ce qui a été observé : rien n'est prononcé, et la
   séance avance quand même.

   Désormais, `dire()` renvoie un OBJET, et `demarree` ne peut venir
   que de l'événement `onstart`.
   =================================================================== */

export const RESULTAT_VIDE = () => ({
  demande: false, demarree: false, terminee: false,
  erreur: false, cause: "", dureeMs: 0, voix: "", langue: ""
});

/** Délai au-delà duquel un énoncé qui n'a pas démarré est un échec. */
export const DELAI_DEMARRAGE_MS = 1600;

/**
 * Prononce un texte.
 *
 * @returns {Promise<object>} { demande, demarree, terminee, erreur, cause, dureeMs }
 *
 * `demarree` vient exclusivement de `onstart`. Aucune heuristique,
 * aucune estimation de durée ne peut le mettre à vrai.
 */
export function dire(texte, langue = "lb", facteur = 1) {
  // Après une capture micro, Safari iOS peut rester dans une catégorie
  // de session orientée enregistrement. Réaffirmer "playback" juste
  // avant speak() remet la sortie sur le chemin de lecture.
  SessionIOS.preparerLecture();
  dernier = { texte, langue, facteur };

  return new Promise((resolve) => {
    const r = RESULTAT_VIDE();
    r.langue = langue;

    if (!dispo()) { r.erreur = true; r.cause = "synthese_absente"; return resolve(r); }
    if (!String(texte).trim()) { r.cause = "texte_vide"; return resolve(r); }

    try { speechSynthesis.cancel(); } catch (_) {}

    const s = reglages();
    const u = new SpeechSynthesisUtterance(String(texte));
    const base = Number(s.voiceRate || 0.85);

    if (langue === "lb") {
      if (voixLb) { u.voice = voixLb; u.lang = voixLb.lang; r.voix = voixLb.name; }
      else u.lang = "de-DE";
      u.rate = borne(base * facteur, 0.45, 1.25);
    } else {
      if (voixFr) { u.voice = voixFr; u.lang = voixFr.lang; r.voix = voixFr.name; }
      else u.lang = "fr-FR";
      u.rate = borne(base + 0.1, 0.6, 1.3);
    }

    let fini = false;
    let t0 = 0;
    let minuteurDemarrage = null;
    let minuteurFin = null;
    let veille = null;

    const finir = (cause) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteurDemarrage);
      clearTimeout(minuteurFin);
      clearInterval(veille);
      r.cause = r.cause || cause || "";
      r.dureeMs = t0 ? Date.now() - t0 : 0;
      resolve(r);
    };

    u.onstart = () => {
      r.demarree = true;
      t0 = Date.now();
      clearTimeout(minuteurDemarrage);
      // La surveillance de fin ne démarre qu'APRÈS le démarrage réel.
      // C'est ce qui empêche de confondre « pas encore commencé » et
      // « déjà terminé ».
      veille = setInterval(() => {
        if (!speechSynthesis.speaking && !speechSynthesis.pending) {
          r.terminee = true;
          finir("fin_deduite");
        }
      }, 250);
      minuteurFin = setTimeout(() => finir("fin_non_signalee"),
        Math.max(6000, String(texte).length * 260));
    };

    u.onend = () => { r.terminee = true; finir("fin"); };

    u.onerror = (e) => {
      r.erreur = true;
      // « interrupted » et « canceled » sont des arrêts volontaires,
      // pas des pannes. On les distingue.
      const nom = e?.error || "inconnue";
      r.cause = nom;
      finir(nom);
    };

    try {
      speechSynthesis.speak(u);
      r.demande = true;
    } catch (e) {
      r.erreur = true;
      return finir("speak_exception:" + (e?.message || ""));
    }

    // Aucun démarrage dans le délai : le moteur n'a rien joué. C'est un
    // échec, pas une réussite silencieuse.
    minuteurDemarrage = setTimeout(() => {
      if (!r.demarree) { r.erreur = true; finir("pas_de_demarrage"); }
    }, DELAI_DEMARRAGE_MS);
  });
}

/** Vrai seulement si le moteur a réellement commencé à parler. */
export const aParle = (r) => !!(r && r.demarree);

export const repeter = () => dernier ? dire(dernier.texte, dernier.langue, dernier.facteur) : Promise.resolve(RESULTAT_VIDE());
export const stopper = () => { try { speechSynthesis.cancel(); } catch (_) {} };
const borne = (n, a, b) => Math.max(a, Math.min(b, n));
