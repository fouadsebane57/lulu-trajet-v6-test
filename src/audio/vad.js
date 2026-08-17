/* ===================================================================
   DÉTECTION DE PAROLE

   CORRECTIF 5.1.0.

   La 5.0.0 laissait le plancher de bruit s'adapter sans limite basse.
   Sur iPhone, contexte audio endormi, il descendait à -587 dB et le
   seuil suivait. Résultat affiché sur l'appareil de l'utilisateur :
   « 2520 ms de parole · seuil -527 dB · signal sur bruit 514 dB ».
   Ces valeurs sont physiquement impossibles. La détection se
   déclenchait sur du silence, puis rien n'était transcrit.

   Règles désormais appliquées :
     le contexte audio doit tourner, sinon on ne mesure pas,
     le plancher reste dans [planchermin, -25 dB],
     le seuil ne descend jamais sous un minimum absolu,
     un pic sous -55 dBFS n'est jamais de la parole,
     une mesure incohérente est signalée, jamais présentée comme valide.
   =================================================================== */

import { analyseur, reveiller, contexteActif, DB_MIN, DB_PAROLE_MINIMALE } from "./mic.js";

export const PROFILS = {
  calme:   { margeDb: 9,  silenceMs: 650, planchermin: -70, seuilAbsolu: -58 },
  voiture: { margeDb: 12, silenceMs: 850, planchermin: -55, seuilAbsolu: -48 }
};

const PLANCHER_MAX = -25;     // au dessus, ce n'est plus du bruit de fond
const CALIBRATION_MS = 400;

/**
 * Écoute jusqu'à la fin de la parole.
 * @param {MediaStream} flux
 * @param {object} opt attenteMaxMs, paroleMaxMs, profil, onNiveau, annule
 */
export async function ecouter(flux, opt = {}) {
  const p = PROFILS[opt.profil] || PROFILS.calme;
  const attenteMaxMs = opt.attenteMaxMs ?? 4500;
  const paroleMaxMs = opt.paroleMaxMs ?? 9000;
  const onNiveau = opt.onNiveau || (() => {});
  const annule = opt.annule || (() => false);

  // Verrou principal : rien ne commence tant que le contexte dort.
  const running = await reveiller();
  if (!running) {
    return resultatVide("contexte_audio_endormi",
      "Le moteur audio du navigateur n'a pas démarré. Touche l'écran puis réessaie.");
  }

  const a = analyseur(flux);
  if (!a) return resultatVide("analyseur_indisponible", "Analyse du signal impossible sur cet appareil.");

  return new Promise((resolve) => {
    const t0 = Date.now();
    let plancher = null;
    const calibration = [];
    // Enveloppe conservée : elle sert à l'analyse locale du rythme,
    // sans aucun calcul supplémentaire pendant la séance.
    const enveloppe = [];
    let debutParole = 0, finParole = 0, dernierSonFort = 0;
    let pic = DB_MIN;
    let etat = "calibration";

    const terminer = (reason) => {
      clearInterval(boucle);
      a.detruire();
      const speechMs = debutParole ? (finParole || Date.now()) - debutParole : 0;
      const noiseFloorDb = borner(plancher ?? DB_MIN);
      const seuilDb = seuilDe(noiseFloorDb, p);
      const snrDb = Math.max(0, pic - noiseFloorDb);

      // Contrôle de cohérence. Un pic trop faible ne peut pas être de la voix,
      // quel que soit le seuil relatif calculé.
      const picSuffisant = pic >= DB_PAROLE_MINIMALE;
      const detectee = speechMs >= 150 && picSuffisant;

      resolve({
        enveloppe: debutParole ? enveloppe.filter((e) => e.t >= debutParole - t0) : [],
        speechDetected: detectee,
        speechMs: detectee ? speechMs : 0,
        noiseFloorDb, peakDb: pic, snrDb, seuilDb,
        totalMs: Date.now() - t0,
        mesureFiable: true,
        reason: detectee ? reason
              : speechMs >= 150 ? "signal_trop_faible" : reason,
        detail: detectee ? ""
              : speechMs >= 150
                ? `Du son a été capté mais il est trop faible pour être de la voix, pic à ${Math.round(pic)} dB. Rapproche le téléphone ou parle plus fort.`
                : ""
      });
    };

    const boucle = setInterval(() => {
      if (annule()) return terminer("annule");
      if (!contexteActif()) return terminer("contexte_audio_interrompu");

      const db = a.rmsDb();
      const maintenant = Date.now();
      const ecoule = maintenant - t0;
      if (db > pic) pic = db;
      enveloppe.push({ t: ecoule, db });

      if (etat === "calibration") {
        calibration.push(db);
        onNiveau({ db, etat, plancher: null });
        if (ecoule >= CALIBRATION_MS) {
          const tries = calibration.slice().sort((x, y) => x - y);
          plancher = borner(tries[Math.floor(tries.length / 2)]);
          etat = "attente";
        }
        return;
      }

      const seuil = seuilDe(plancher, p);
      onNiveau({ db, etat, plancher, seuil });

      if (etat === "attente") {
        if (db > seuil) { etat = "parole"; debutParole = maintenant; dernierSonFort = maintenant; return; }
        if (ecoule > attenteMaxMs + CALIBRATION_MS) return terminer("aucune_parole");
        // Adaptation lente au bruit ambiant, mais TOUJOURS bornée.
        plancher = borner(plancher * 0.94 + db * 0.06);
        return;
      }

      if (etat === "parole") {
        if (db > seuil) { dernierSonFort = maintenant; finParole = 0; return; }
        if (maintenant - dernierSonFort >= p.silenceMs) { finParole = dernierSonFort; return terminer("fin_de_parole"); }
        if (maintenant - debutParole > paroleMaxMs) { finParole = maintenant; return terminer("duree_max"); }
      }
    }, 30);

    function borner(v) {
      if (!Number.isFinite(v)) return p.planchermin;
      return Math.max(p.planchermin, Math.min(PLANCHER_MAX, v));
    }
  });
}

/** Seuil de déclenchement, relatif au bruit mais jamais sous un absolu. */
function seuilDe(plancher, p) {
  return Math.max(p.seuilAbsolu, plancher + p.margeDb);
}

function resultatVide(reason, detail) {
  return {
    speechDetected: false, speechMs: 0,
    noiseFloorDb: DB_MIN, peakDb: DB_MIN, snrDb: 0, seuilDb: DB_MIN,
    enveloppe: [], totalMs: 0, mesureFiable: false, reason, detail
  };
}

export { reveiller };
