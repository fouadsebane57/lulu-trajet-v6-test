/* ===================================================================
   FOURNISSEURS DE RECONNAISSANCE VOCALE

   Interface unique, fournisseurs interchangeables.

   Pourquoi cette abstraction est nécessaire ici et pas ailleurs :
   le luxembourgeois est une langue peu dotée. Aucun fournisseur n'est
   durablement acquis. LuxASR, développé à l'Université du Luxembourg,
   est aujourd'hui la seule solution réellement spécialisée, mais son
   accès est encadré et son API peut changer. Coller l'application à un
   fournisseur serait une erreur d'architecture.

   CONTRAT

   Un fournisseur expose :

     id            identifiant court, stable
     nom           libellé affiché
     langue        code réellement traité
     enLigne       true si un réseau est nécessaire
     specialise    true si le moteur connaît réellement le lb
     probant       true si sa transcription a le droit d'écrire une
                   preuve pédagogique. C'est le champ décisif.
     disponible()  état réel, avec cause
     transcrire()  renvoie un RESULTAT normalisé

   RÉSULTAT NORMALISÉ

     { providerId, transcripts: [{text, confidence}], cause, error,
       latencyMs, lang, model }

   RÈGLE NON NÉGOCIABLE

   `probant` est false pour tout moteur qui ne connaît pas le
   luxembourgeois. Un moteur allemand qui reconnaît « Moien » comme
   « Mohen » ne prouve rien et ne doit jamais faire baisser une
   progression. Il peut encourager, jamais sanctionner.
   =================================================================== */

import { CAUSE } from "./erreurs.js";

/** Résultat vide, normalisé. Aucun fournisseur ne renvoie autre chose. */
export function resultatVide(providerId, cause, error = "") {
  return {
    providerId, transcripts: [], cause, error,
    latencyMs: 0, lang: "", model: "", httpStatus: 0
  };
}

const registre = new Map();
let ordre = [];

export function enregistrer(provider) {
  if (!provider?.id) throw new Error("Fournisseur sans identifiant.");
  for (const champ of ["nom", "langue", "transcrire", "disponible"]) {
    if (provider[champ] === undefined) throw new Error(`Fournisseur ${provider.id} : champ ${champ} manquant.`);
  }
  registre.set(provider.id, provider);
  if (!ordre.includes(provider.id)) ordre.push(provider.id);
  return provider;
}

export const fournisseur = (id) => registre.get(id) || null;
export const tous = () => ordre.map((id) => registre.get(id)).filter(Boolean);
export const reinitialiser = () => { registre.clear(); ordre = []; };

/**
 * Ordre de préférence. Le premier disponible ET probant gagne.
 * Modifiable par configuration, sans toucher au reste du code.
 */
export function definirOrdre(ids) {
  ordre = ids.filter((id) => registre.has(id));
  for (const id of registre.keys()) if (!ordre.includes(id)) ordre.push(id);
  return ordre;
}

/**
 * Choisit un fournisseur.
 *
 * @param {object} o
 * @param {string} o.prefere    identifiant forcé par l'utilisateur, ou "auto"
 * @param {boolean} o.enLigne   état réseau observé
 * @param {boolean} o.exigeProbant  n'accepter qu'un moteur probant
 */
export async function choisir({ prefere = "auto", enLigne = true, exigeProbant = false } = {}) {
  const candidats = [];
  for (const id of ordre) {
    const p = registre.get(id);
    if (!p) continue;
    if (prefere !== "auto" && prefere !== id) continue;
    if (p.enLigne && !enLigne) { candidats.push({ p, etat: { ok: false, cause: CAUSE.RESEAU, resume: "Aucun réseau." } }); continue; }
    if (exigeProbant && !p.probant) { candidats.push({ p, etat: { ok: false, cause: CAUSE.MOTEUR_ABSENT, resume: "Moteur non probant." } }); continue; }
    const etat = await p.disponible();
    candidats.push({ p, etat });
    if (etat.ok) return { provider: p, etat, essais: candidats.map(resume) };
  }
  return { provider: null, etat: candidats[0]?.etat || { ok: false, cause: CAUSE.MOTEUR_ABSENT, resume: "Aucun fournisseur configuré." }, essais: candidats.map(resume) };
}

const resume = ({ p, etat }) => ({ id: p.id, nom: p.nom, ok: !!etat.ok, cause: etat.cause, resume: etat.resume });

/** Tableau d'état, affiché tel quel dans le diagnostic. */
export async function etatComplet() {
  const out = [];
  for (const p of tous()) {
    let etat;
    try { etat = await p.disponible(); }
    catch (e) { etat = { ok: false, cause: CAUSE.MOTEUR_ABSENT, resume: e?.message || "Erreur inattendue." }; }
    out.push({
      id: p.id, nom: p.nom, langue: p.langue,
      enLigne: !!p.enLigne, specialise: !!p.specialise, probant: !!p.probant,
      ok: !!etat.ok, cause: etat.cause, resume: etat.resume
    });
  }
  return out;
}

export { CAUSE };
