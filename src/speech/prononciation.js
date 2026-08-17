/* ===================================================================
   ÉVALUATION DE LA PRONONCIATION

   ÉTAT RÉEL, AOÛT 2026

   Aucun fournisseur grand public n'évalue la prononciation du
   luxembourgeois au niveau du phonème. Vérifié fournisseur par
   fournisseur pendant la préparation de cette version. Les briques
   ouvertes existent, alignement forcé et conversion graphème vers
   phonème, mais aucune n'est calibrée sur de la parole d'apprenant
   francophone. Assembler un score à partir de ces briques sans
   étalonnage produirait un chiffre, pas une mesure.

   DÉCISION

   Cette version n'affiche AUCUN score de prononciation.
   Elle affiche « Analyse phonétique détaillée non disponible ».

   Ce module existe quand même, pour trois raisons :

     il rend l'indisponibilité EXPLICITE et testable, au lieu de la
     laisser à l'état d'absence silencieuse ;
     il fixe l'interface exacte qu'un futur fournisseur devra remplir ;
     il garantit, par un test, qu'aucun code de l'application ne peut
     fabriquer un score de prononciation par un autre chemin.

   CE QUI EST MESURÉ, ET QUI N'EST PAS DE LA PRONONCIATION

   L'analyse locale du rythme mesure la durée de parole et le nombre
   de groupes d'énergie. « fënnef » et « bébé » donnent le même
   résultat. C'est une information sur la TENTATIVE, pas sur les sons.
   Elle est rangée dans les signaux, jamais dans les dimensions.
   =================================================================== */

export const ETAT = {
  DISPONIBLE: "disponible",
  INDISPONIBLE: "indisponible_faute_d_instrument"
};

export const MESSAGE_INDISPONIBLE = "Analyse phonétique détaillée non disponible.";

export const EXPLICATION = [
  "Aucun service ne sait aujourd'hui noter la prononciation du luxembourgeois son par son.",
  "L'application préfère le dire plutôt que d'afficher une note inventée.",
  "Ce que tu peux faire à la place : écouter le modèle, t'écouter, comparer, recommencer."
].join(" ");

let fournisseurActif = null;

/**
 * Contrat qu'un futur fournisseur devra remplir.
 *
 *   id
 *   nom
 *   langue          doit valoir "lb" ou "lb-LU"
 *   async disponible()  -> { ok, cause, resume }
 *   async evaluer({ blob, mimeType, attendu })
 *        -> { phonemes: [{ phoneme, score, debutMs, finMs }],
 *             scoreGlobal, fiable, methode }
 *
 * Tant qu'aucun fournisseur n'est branché, `evaluer()` renvoie
 * systématiquement un résultat INDISPONIBLE. Jamais un score par
 * défaut, jamais zéro, jamais cent.
 */
export function brancher(provider) {
  if (!provider) { fournisseurActif = null; return null; }
  for (const champ of ["id", "nom", "langue", "disponible", "evaluer"]) {
    if (provider[champ] === undefined) throw new Error(`Fournisseur de prononciation : champ ${champ} manquant.`);
  }
  if (!/^lb/i.test(provider.langue)) {
    // Refus net. Un fournisseur allemand branché ici produirait
    // exactement le faux score que cette version interdit.
    throw new Error("Fournisseur de prononciation refusé : la langue doit être le luxembourgeois.");
  }
  fournisseurActif = provider;
  return provider;
}

export const branche = () => fournisseurActif;

export async function etat() {
  if (!fournisseurActif) {
    return {
      etat: ETAT.INDISPONIBLE,
      disponible: false,
      message: MESSAGE_INDISPONIBLE,
      explication: EXPLICATION,
      fournisseur: null
    };
  }
  let d;
  try { d = await fournisseurActif.disponible(); }
  catch (e) { d = { ok: false, resume: e?.message || "Erreur inattendue." }; }
  return {
    etat: d.ok ? ETAT.DISPONIBLE : ETAT.INDISPONIBLE,
    disponible: !!d.ok,
    message: d.ok ? "Analyse phonétique disponible." : MESSAGE_INDISPONIBLE,
    explication: d.ok ? (d.resume || "") : EXPLICATION,
    fournisseur: fournisseurActif.id
  };
}

/**
 * Évalue une tentative.
 * Renvoie TOUJOURS un objet. `fiable` est false tant qu'aucun
 * fournisseur luxembourgeois n'est branché et opérationnel.
 */
export async function evaluer(entree = {}) {
  const e = await etat();
  if (!e.disponible) {
    return {
      disponible: false,
      fiable: false,
      scoreGlobal: null,        // null, jamais 0 : l'absence de mesure
      phonemes: [],             // n'est pas une mauvaise note
      methode: "aucune",
      message: MESSAGE_INDISPONIBLE,
      explication: EXPLICATION
    };
  }
  const r = await fournisseurActif.evaluer(entree);
  return {
    disponible: true,
    fiable: !!r.fiable,
    scoreGlobal: r.fiable ? r.scoreGlobal : null,
    phonemes: Array.isArray(r.phonemes) ? r.phonemes : [],
    methode: r.methode || fournisseurActif.id,
    message: r.fiable ? "" : MESSAGE_INDISPONIBLE,
    explication: r.fiable ? "" : EXPLICATION
  };
}

export function reinitialiser() { fournisseurActif = null; }
