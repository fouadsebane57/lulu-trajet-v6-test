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
  try { return JSON.parse(localStorage.getItem("lulu:v6") || "{}").settings || {}; }
  catch (_) { return {}; }
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

  remplir("luxVoiceSelect", candidats.map((c) => ({ value: c.voice.name, label: `${c.note} · ${c.voice.name}` })), voixLb?.name);
  remplir("frVoiceSelect", fr.map((v) => ({ value: v.name, label: v.name })), voixFr?.name);
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

export function dire(texte, langue = "lb", facteur = 1) {
  dernier = { texte, langue, facteur };
  return new Promise((resolve) => {
    if (!dispo() || !String(texte).trim()) return resolve();
    try { speechSynthesis.cancel(); } catch (_) {}

    const s = reglages();
    const u = new SpeechSynthesisUtterance(String(texte));
    const base = Number(s.voiceRate || 0.85);

    if (langue === "lb") {
      if (voixLb) { u.voice = voixLb; u.lang = voixLb.lang; }
      else u.lang = "de-DE";
      u.rate = borne(base * facteur, 0.45, 1.25);
    } else {
      if (voixFr) { u.voice = voixFr; u.lang = voixFr.lang; }
      else u.lang = "fr-FR";
      u.rate = borne(base + 0.1, 0.6, 1.3);
    }

    let fini = false;
    const finir = () => { if (fini) return; fini = true; clearInterval(veille); clearTimeout(plafond); resolve(); };
    u.onend = finir;
    u.onerror = finir;

    // Filet : sur certains navigateurs onend ne se déclenche pas.
    // On surveille l'état réel du moteur au lieu d'estimer une durée.
    const veille = setInterval(() => {
      if (!speechSynthesis.speaking && !speechSynthesis.pending) finir();
    }, 250);
    const plafond = setTimeout(finir, Math.max(6000, String(texte).length * 260));

    try { speechSynthesis.speak(u); } catch (_) { finir(); }
  });
}

export const repeter = () => dernier ? dire(dernier.texte, dernier.langue, dernier.facteur) : Promise.resolve();
export const stopper = () => { try { speechSynthesis.cancel(); } catch (_) {} };
const borne = (n, a, b) => Math.max(a, Math.min(b, n));
