/* ===================================================================
   ANALYSE LOCALE DU RYTHME

   Ce module permet à l'application de donner un retour RÉEL sans
   aucun serveur, sans compte, sans configuration.

   Ce qu'il mesure, honnêtement :
     l'utilisateur a-t-il parlé,
     pendant combien de temps,
     avec combien de groupes d'énergie, c'est-à-dire de syllabes,
     à un débit plausible.

   Ce qu'il ne mesure PAS, et ne prétend jamais mesurer :
     les phonèmes, l'accent, la justesse de la prononciation.
     Dire « fënnef » ou « bébé » donne le même nombre de syllabes.

   Le retour est donc formulé comme un constat de tentative, jamais
   comme une note. La progression n'avance que sur l'auto-évaluation
   de l'utilisateur, après qu'il a entendu le modèle puis sa propre
   voix. C'est le fonctionnement des méthodes orales éprouvées.

   L'enveloppe d'énergie provient de la détection de parole, qui
   échantillonne déjà le niveau toutes les trente millisecondes.
   Aucun calcul supplémentaire n'est nécessaire pendant la séance.
   =================================================================== */

export const RYTHME = {
  BON: "rythme_bon",
  COURT: "rythme_court",
  LONG: "rythme_long",
  INDETERMINE: "rythme_indetermine"
};

/** Durée moyenne d'une syllabe en parole lente d'apprentissage. */
export const MS_PAR_SYLLABE = 260;

export const MESSAGE_RYTHME = {
  [RYTHME.BON]: "",
  [RYTHME.COURT]: "Ta réponse était plus courte que le modèle.",
  [RYTHME.LONG]: "Ta réponse était plus longue que le modèle.",
  [RYTHME.INDETERMINE]: ""
};

/**
 * Compte les noyaux syllabiques dans une enveloppe d'énergie.
 *
 * Principe : une syllabe correspond à une bosse d'énergie. On repère
 * les maxima locaux séparés par un creux d'au moins `creuxDb`. Le
 * lissage évite de compter deux fois une même bosse bruitée.
 *
 * @param {{t:number, db:number}[]} enveloppe
 * @param {number} seuilDb  seuil de parole retenu par la détection
 */
export function compterNoyaux(enveloppe, seuilDb, opt = {}) {
  const creuxDb = opt.creuxDb ?? 4;        // profondeur minimale d'un creux
  const ecartMinMs = opt.ecartMinMs ?? 90; // deux syllabes ne se suivent pas plus vite
  if (!Array.isArray(enveloppe) || enveloppe.length < 4) return { noyaux: 0, pics: [] };

  // Lissage sur trois échantillons, environ 90 ms.
  const lisse = enveloppe.map((e, i, a) => {
    const g = a[Math.max(0, i - 1)].db, d = a[Math.min(a.length - 1, i + 1)].db;
    return { t: e.t, db: (g + e.db + d) / 3 };
  });

  const pics = [];
  let montee = false;
  let sommet = null;
  let creuxDepuisSommet = Infinity;

  for (const p of lisse) {
    if (p.db < seuilDb) {
      // Retour sous le seuil : la syllabe en cours est close.
      if (sommet) { pics.push(sommet); sommet = null; }
      montee = false;
      creuxDepuisSommet = Infinity;
      continue;
    }
    if (!sommet) { sommet = p; montee = true; creuxDepuisSommet = 0; continue; }

    if (p.db > sommet.db) {
      // Une remontée franche après un creux marque une nouvelle syllabe.
      if (creuxDepuisSommet >= creuxDb && p.t - sommet.t >= ecartMinMs) {
        pics.push(sommet);
        sommet = p;
        creuxDepuisSommet = 0;
      } else {
        sommet = p;
        creuxDepuisSommet = 0;
      }
    } else {
      creuxDepuisSommet = Math.max(creuxDepuisSommet, sommet.db - p.db);
    }
  }
  if (sommet) pics.push(sommet);

  return { noyaux: pics.length, pics };
}

/**
 * Compare une tentative au modèle attendu.
 *
 * @param {object} mesure  { enveloppe, seuilDb, dureeMs, fiable }
 * @param {number|null} syllabesAttendues  null si non mesurable
 */
export function analyser(mesure, syllabesAttendues) {
  const vide = { verdict: RYTHME.INDETERMINE, noyaux: 0, attendu: syllabesAttendues, dureeMs: 0, dureeAttendueMs: 0, ecart: 0, mesurable: false };

  if (!mesure?.fiable || !mesure.dureeMs) return vide;
  if (syllabesAttendues == null) {
    // Guide de prononciation incomplet pour cette expression.
    // On ne compare rien plutôt que de comparer faux.
    return { ...vide, dureeMs: mesure.dureeMs };
  }

  const { noyaux } = compterNoyaux(mesure.enveloppe, mesure.seuilDb);
  const dureeAttendueMs = syllabesAttendues * MS_PAR_SYLLABE;
  const ratio = mesure.dureeMs / dureeAttendueMs;

  const base = {
    noyaux, attendu: syllabesAttendues,
    dureeMs: Math.round(mesure.dureeMs),
    dureeAttendueMs: Math.round(dureeAttendueMs),
    ecart: noyaux - syllabesAttendues,
    ratio: Number(ratio.toFixed(2)),
    mesurable: true
  };

  // Tolérances larges et volontairement asymétriques. Un apprenant
  // débutant parle lentement : mieux vaut ne rien signaler qu'agacer.
  const tropCourt = ratio < 0.40 || (noyaux > 0 && noyaux <= syllabesAttendues - 2);
  const tropLong = ratio > 2.60 || noyaux >= syllabesAttendues + 3;

  if (tropCourt) return { ...base, verdict: RYTHME.COURT };
  if (tropLong) return { ...base, verdict: RYTHME.LONG };
  return { ...base, verdict: RYTHME.BON };
}

/** Phrase courte, dite à voix haute pendant la séance. */
export function phrase(r) {
  if (!r?.mesurable) return "";
  if (r.verdict === RYTHME.COURT) return "Ta réponse était courte. Écoute encore le modèle.";
  if (r.verdict === RYTHME.LONG) return "Ta réponse était longue. Écoute encore le modèle.";
  return "";
}

/** Détail affiché, factuel, sans jugement de prononciation. */
export function detail(r) {
  if (!r?.mesurable) return "Rythme non mesurable pour cette expression.";
  return `${r.noyaux} groupe${r.noyaux > 1 ? "s" : ""} de son sur ${r.attendu} attendu${r.attendu > 1 ? "s" : ""} · ${(r.dureeMs / 1000).toFixed(1)} s`;
}
