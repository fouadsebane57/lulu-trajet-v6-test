/* ===================================================================
   VOIX DU MODÈLE

   Ordre de préférence, du meilleur au moins bon :

     1. AUDIO NATIF     un enregistrement d'un locuteur luxembourgeois
     2. TTS LOCAL       une synthèse luxembourgeoise embarquée
     3. SYNTHÈSE SYSTÈME une voix lb-LU du téléphone, si elle existe
     4. APPROXIMATION   une voix allemande, annoncée comme telle

   POURQUOI CETTE ARCHITECTURE PLUTÔT QU'UN APPEL DIRECT

   Jusqu'ici, l'application appelait la synthèse du système et se
   rabattait sur une voix allemande. C'était honnête mais définitif :
   changer de source demandait de toucher au moteur de séance.

   Ici, la voix est un FOURNISSEUR. Ajouter des enregistrements natifs
   pour cinquante phrases ne change pas une ligne du moteur : les
   phrases concernées passent simplement au niveau 1, les autres
   restent au niveau 4. La bascule est progressive, phrase par phrase.

   CE QUE CETTE VERSION EMBARQUE RÉELLEMENT

   Aucun fichier audio natif n'est livré dans ce lot. Les
   enregistrements de locuteurs luxembourgeois existent en accès
   ouvert, mais leur redistribution à l'intérieur d'une application
   demande une vérification de licence qui n'est pas faite. Livrer des
   fichiers sans cette vérification créerait une dépendance juridique.

   Conséquence assumée et affichée : cette version parle avec la voix
   du système, et le dit à chaque fois qu'elle n'est pas
   luxembourgeoise. Le champ `audio` de chaque phrase est prêt à
   recevoir un fichier, et la couche de lecture le préférera
   automatiquement dès qu'il sera présent.
   =================================================================== */

export const QUALITE = {
  NATIF: "natif",                 // voix humaine luxembourgeoise
  TTS_LOCAL: "tts_local",         // synthèse luxembourgeoise embarquée
  SYSTEME_LB: "systeme_lb",       // voix lb-LU du téléphone
  APPROXIMATION: "approximation", // voix allemande
  ELOIGNEE: "eloignee",           // autre langue germanique
  AUCUNE: "aucune"
};

export const RANG = {
  [QUALITE.NATIF]: 1,
  [QUALITE.TTS_LOCAL]: 2,
  [QUALITE.SYSTEME_LB]: 3,
  [QUALITE.APPROXIMATION]: 4,
  [QUALITE.ELOIGNEE]: 5,
  [QUALITE.AUCUNE]: 9
};

export const LIBELLE = {
  [QUALITE.NATIF]: "Voix luxembourgeoise enregistrée",
  [QUALITE.TTS_LOCAL]: "Synthèse luxembourgeoise embarquée",
  [QUALITE.SYSTEME_LB]: "Voix luxembourgeoise du téléphone",
  [QUALITE.APPROXIMATION]: "Voix allemande, prononciation approchée",
  [QUALITE.ELOIGNEE]: "Voix d'une autre langue, très approximatif",
  [QUALITE.AUCUNE]: "Aucune voix disponible"
};

/** Phrase affichée à l'utilisateur. Jamais de fausse promesse. */
export function avertissement(qualite) {
  if (qualite === QUALITE.NATIF || qualite === QUALITE.TTS_LOCAL || qualite === QUALITE.SYSTEME_LB) return "";
  if (qualite === QUALITE.APPROXIMATION) {
    return "Cette phrase est dite par une voix allemande. La prononciation entendue est approchée, pas luxembourgeoise.";
  }
  if (qualite === QUALITE.ELOIGNEE) {
    return "Aucune voix proche du luxembourgeois n'est installée. Ce que tu entends est très approximatif.";
  }
  return "Aucune voix n'est disponible sur cet appareil.";
}

const registre = [];

/**
 * Contrat d'un fournisseur de voix modèle.
 *
 *   id
 *   nom
 *   qualite            une valeur de QUALITE
 *   async peutDire(phrase, { vitesse })  -> boolean
 *   async dire(phrase, { vitesse, annule }) -> { joue, dureeMs, cause }
 */
export function enregistrer(provider) {
  for (const champ of ["id", "nom", "qualite", "peutDire", "dire"]) {
    if (provider?.[champ] === undefined) throw new Error(`Voix modèle : champ ${champ} manquant.`);
  }
  registre.push(provider);
  registre.sort((a, b) => (RANG[a.qualite] ?? 9) - (RANG[b.qualite] ?? 9));
  return provider;
}

export const fournisseurs = () => registre.slice();
export const reinitialiser = () => { registre.length = 0; };

/**
 * Meilleur fournisseur capable de dire CETTE phrase.
 * Le choix est fait phrase par phrase : une phrase disposant d'un
 * enregistrement natif sera dite par une voix humaine, la suivante par
 * la synthèse, sans que le moteur de séance ait à le savoir.
 */
export async function choisirPour(phrase, opt = {}) {
  for (const p of registre) {
    let ok = false;
    try { ok = await p.peutDire(phrase, opt); } catch (_) { ok = false; }
    if (ok) return p;
  }
  return null;
}

/**
 * Dit une phrase.
 * Renvoie ce qui s'est réellement passé, y compris la qualité employée
 * et l'avertissement à afficher. Ne prétend jamais avoir parlé
 * luxembourgeois avec une voix allemande.
 */
export async function dire(phrase, opt = {}) {
  const p = await choisirPour(phrase, opt);
  if (!p) {
    return { joue: false, qualite: QUALITE.AUCUNE, fournisseur: "",
             avertissement: avertissement(QUALITE.AUCUNE), cause: "aucun_fournisseur", dureeMs: 0 };
  }
  let r;
  try { r = await p.dire(phrase, opt); }
  catch (e) { r = { joue: false, cause: e?.message || "erreur_lecture", dureeMs: 0 }; }
  return {
    joue: !!r?.joue,
    qualite: p.qualite,
    fournisseur: p.id,
    avertissement: avertissement(p.qualite),
    cause: r?.cause || "",
    dureeMs: r?.dureeMs || 0
  };
}

/** État affiché dans le diagnostic. Une ligne par fournisseur. */
export async function etat(phraseTemoin) {
  const out = [];
  for (const p of registre) {
    let dispo = false;
    try { dispo = await p.peutDire(phraseTemoin || { lb: "Moien" }, {}); } catch (_) {}
    out.push({ id: p.id, nom: p.nom, qualite: p.qualite, libelle: LIBELLE[p.qualite], disponible: dispo });
  }
  const meilleur = out.find((x) => x.disponible) || null;
  return {
    fournisseurs: out,
    retenu: meilleur,
    // Vrai uniquement si l'apprenant entend réellement du luxembourgeois.
    luxembourgeoisReel: !!meilleur && [QUALITE.NATIF, QUALITE.TTS_LOCAL, QUALITE.SYSTEME_LB].includes(meilleur.qualite),
    avertissement: meilleur ? avertissement(meilleur.qualite) : avertissement(QUALITE.AUCUNE)
  };
}

/* ===================================================================
   FOURNISSEUR 1 · AUDIO NATIF PRÉENREGISTRÉ
   =================================================================== */

/**
 * Lit un fichier audio attaché à la phrase.
 * `resoudre(phrase, vitesse)` renvoie une URL ou null. Tant qu'aucun
 * fichier n'est livré, ce fournisseur répond simplement « non » et
 * laisse la main au suivant.
 */
export function creerAudioNatif({ resoudre, lecteur }) {
  return {
    id: "audio-natif",
    nom: "Enregistrements de locuteurs luxembourgeois",
    qualite: QUALITE.NATIF,
    async peutDire(phrase, { vitesse = "normal" } = {}) {
      return !!(await resoudre(phrase, vitesse));
    },
    async dire(phrase, { vitesse = "normal", annule } = {}) {
      const url = await resoudre(phrase, vitesse);
      if (!url) return { joue: false, cause: "aucun_fichier", dureeMs: 0 };
      const r = await lecteur(url, { annule });
      return { joue: !!r?.joue, cause: r?.cause || "", dureeMs: r?.dureeMs || 0 };
    }
  };
}

/* ===================================================================
   FOURNISSEUR 2 · SYNTHÈSE DU SYSTÈME
   =================================================================== */

/**
 * S'appuie sur la synthèse du navigateur ou du téléphone.
 * La qualité annoncée dépend de la voix RÉELLEMENT retenue, pas de ce
 * qu'on aimerait avoir.
 */
export function creerSynthese({ tts }) {
  const qualiteDe = () => {
    const q = tts.qualiteVoix?.() || "aucune";
    if (q === "native") return QUALITE.SYSTEME_LB;
    if (q === "regionale" || q === "approximation") return QUALITE.APPROXIMATION;
    if (q === "eloignee") return QUALITE.ELOIGNEE;
    return QUALITE.AUCUNE;
  };
  return {
    id: "synthese-systeme",
    nom: "Synthèse vocale de l'appareil",
    get qualite() { return qualiteDe(); },
    async peutDire() { return !!tts.dispo?.() && qualiteDe() !== QUALITE.AUCUNE; },
    async dire(phrase, { vitesse = "normal" } = {}) {
      const facteur = vitesse === "lent" ? 0.75 : 1;
      const t0 = Date.now();
      await tts.dire(phrase.lb, "lb", facteur);
      return { joue: true, cause: "", dureeMs: Date.now() - t0 };
    }
  };
}
