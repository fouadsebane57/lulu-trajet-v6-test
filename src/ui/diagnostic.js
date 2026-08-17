/* ===================================================================
   DIAGNOSTIC

   Objectif : savoir en moins de trente secondes ce qui marche et ce
   qui bloque, ligne par ligne, sans message générique.

   Règle de rédaction appliquée partout ici : un échec nomme SA cause
   et l'action exacte. « Une erreur est survenue » est interdit.

   Chaque ligne porte un état parmi quatre :
     oui           vérifié à l'instant, sur cet appareil
     non           vérifié à l'instant, ne fonctionne pas
     indisponible  la fonction n'existe pas encore, et on dit pourquoi
     a_verifier    ne peut pas être vérifié ici, seulement sur appareil
   =================================================================== */

import * as Micro from "../audio/mic.js";
import * as Formats from "../audio/formats.js";
import * as Tts from "../audio/tts.js";
import * as VoixModele from "../audio/voix-modele.js";
import * as Tentatives from "../audio/tentative.js";
import * as Providers from "../speech/provider.js";
import * as Prononciation from "../speech/prononciation.js";
import { capturer } from "../audio/recorder.js";
import { jouer, reussie } from "../audio/lecture.js";

export const ETAT = { OUI: "oui", NON: "non", INDISPONIBLE: "indisponible", A_VERIFIER: "a_verifier" };

const ligne = (cle, titre, etat, detail = "", action = "") => ({ cle, titre, etat, detail, action });

/**
 * Diagnostic complet.
 * @param {object} o
 * @param {object} o.plateforme  adaptateur de plateforme
 * @param {function} o.progres   appelée à chaque ligne, pour l'affichage
 */
export async function lancer(o = {}) {
  const lignes = [];
  const pousser = (l) => { lignes.push(l); o.progres?.(l, lignes); return l; };

  /* --- Contexte --- */
  const cadre = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();
  const secure = typeof window !== "undefined" && ("isSecureContext" in window ? window.isSecureContext : location.protocol === "https:");
  const p = o.plateforme;
  const cap = p?.capacites?.() || {};

  pousser(ligne("plateforme", "Plateforme", ETAT.OUI, p?.nom || "inconnue"));
  pousser(ligne("https", "Adresse sécurisée", secure ? ETAT.OUI : ETAT.NON,
    secure ? location.protocol : "Le micro est refusé hors HTTPS.",
    secure ? "" : "Ouvre l'application depuis son adresse en https, pas depuis un fichier local."));
  if (cadre) {
    pousser(ligne("cadre", "Page autonome", ETAT.NON,
      "La page s'affiche dans un aperçu intégré, où le micro est bloqué.",
      "Ouvre l'application dans un onglet normal ou depuis son icône."));
  }

  /* --- Micro --- */
  let flux = null;
  try {
    flux = await Micro.ouvrir();
    pousser(ligne("micro_autorise", "Micro autorisé", ETAT.OUI, Micro.infosFlux()?.label || ""));
  } catch (e) {
    pousser(ligne("micro_autorise", "Micro autorisé", ETAT.NON, e?.message || "Refus",
      "Ouvre les réglages du site et autorise le micro, puis relance ce test."));
  }

  if (flux) {
    const infos = Micro.infosFlux();
    if (infos?.qualiteReduite) {
      pousser(ligne("micro_qualite", "Qualité du micro", ETAT.NON,
        `Micro en mode mains libres, ${infos.sampleRate || "?"} Hz. La reconnaissance se dégrade nettement.`,
        "Débranche le Bluetooth pendant la répétition, ou accepte une reconnaissance moins fiable."));
    }
    const mesure = await Micro.mesurerNiveau(1200);
    pousser(ligne("micro_son", "Le micro reçoit du son",
      mesure.ok ? ETAT.OUI : ETAT.NON,
      mesure.fiable ? `Pic ${Math.round(mesure.picDb)} dB` : "Mesure impossible, contexte audio endormi.",
      mesure.ok ? "" : "Parle pendant le test, vérifie que rien n'obstrue le micro."));
  }

  /* --- Enregistrement, format, réécoute --- */
  const format = Formats.choisir();
  pousser(ligne("format", "Format d'enregistrement",
    format.mime ? ETAT.OUI : ETAT.NON,
    `${format.note}. ${format.explication}`));

  if (flux && o.avecEnregistrement !== false) {
    const cap2 = await capturer({ profil: "calme", attenteMaxMs: 3000, paroleMaxMs: 4000 });
    const octets = cap2.octets || 0;
    pousser(ligne("enregistrement", "Enregistrement",
      octets > 0 ? ETAT.OUI : ETAT.NON,
      octets > 0 ? `${octets} octets, ${cap2.mimeType}` : (cap2.error || "Aucun audio capté."),
      octets > 0 ? "" : "Parle pendant les trois secondes du test."));

    if (cap2.blob) {
      const t = Tentatives.enregistrer({
        idSession: "diag", idExercice: "diag", idPhrase: "diag",
        blob: cap2.blob, mimeType: cap2.mimeType, dureeMs: cap2.vad?.speechMs || 0
      });
      const rejoue = await jouer(Tentatives.blobDe(t.attemptId));
      pousser(ligne("reecoute", "Réécoute de ta voix",
        reussie(rejoue) ? ETAT.OUI : ETAT.NON,
        reussie(rejoue) ? `Tentative ${t.attemptId}, ${rejoue.dureeMs} ms` : rejoue.message,
        reussie(rejoue) ? "" : "Monte le volume, puis relance. Si le format n'est pas lisible, la ligne Format l'indique."));
      await Tentatives.supprimer(t.attemptId);
    }
  }

  /* --- Reconnaissance --- */
  const etats = await Providers.etatComplet();
  for (const e of etats) {
    pousser(ligne(`stt_${e.id}`, `Reconnaissance · ${e.nom}`,
      e.ok ? ETAT.OUI : ETAT.NON,
      [e.resume, e.probant ? "Peut faire évoluer ta progression." : "Ne peut jamais faire baisser ta progression."].filter(Boolean).join(" "),
      e.ok ? "" : e.resume));
  }
  const probantOk = etats.some((e) => e.ok && e.probant);
  pousser(ligne("stt_luxembourgeois", "Reconnaissance luxembourgeoise",
    probantOk ? ETAT.OUI : ETAT.NON,
    probantOk
      ? "Un moteur spécialisé est disponible."
      : "Aucun moteur spécialisé n'est actif. Les mots ne sont pas vérifiés, la séance continue quand même.",
    probantOk ? "" : "L'application reste utilisable en mode sans reconnaissance."));

  /* --- Prononciation --- */
  const pron = await Prononciation.etat();
  pousser(ligne("prononciation", "Correction phonétique",
    pron.disponible ? ETAT.OUI : ETAT.INDISPONIBLE,
    pron.message, pron.explication));

  /* --- Voix du modèle --- */
  Tts.chargerVoix?.();
  const vm = await VoixModele.etat({ lb: "Moien" });
  pousser(ligne("voix_modele", "Voix du modèle",
    vm.retenu ? (vm.luxembourgeoisReel ? ETAT.OUI : ETAT.NON) : ETAT.NON,
    vm.retenu ? `${vm.retenu.nom} · ${vm.retenu.libelle}` : "Aucune voix utilisable.",
    vm.avertissement));

  /* --- Réseau --- */
  const enLigne = typeof navigator !== "undefined" ? navigator.onLine !== false : false;
  pousser(ligne("reseau", "Réseau", enLigne ? ETAT.OUI : ETAT.NON,
    enLigne ? "" : "Hors ligne. Écoute, répétition, écho et progression continuent de fonctionner."));

  /* --- Conservation de la voix --- */
  const inv = Tentatives.inventaire();
  pousser(ligne("voix_conservee", "Enregistrements conservés",
    inv.consentement ? ETAT.OUI : ETAT.NON,
    inv.consentement
      ? `${inv.epinglees} conservés, ${inv.enMemoire} en mémoire, ${Math.round(inv.octets / 1024)} ko.`
      : "Aucun enregistrement n'est conservé. Tout disparaît à la fermeture."));

  /* --- Arrière-plan et écran verrouillé --- */
  pousser(ligne("arriere_plan", "Audio écran verrouillé",
    cap.audioArrierePlan ? ETAT.A_VERIFIER : ETAT.NON,
    cap.audioArrierePlan
      ? "Annoncé par la plateforme native. Non vérifié sur un appareil réel."
      : "En navigateur, la synthèse s'arrête au verrouillage de l'écran.",
    cap.audioArrierePlan ? "" : "Garde l'écran allumé, ou utilise la version native."));

  /* --- Micro refermé --- */
  await Micro.liberer();
  pousser(ligne("micro_libere", "Micro refermé après le test",
    Micro.fluxOuvert() ? ETAT.NON : ETAT.OUI,
    Micro.fluxOuvert() ? "Le flux est resté ouvert." : "Aucun flux actif."));

  return {
    lignes,
    resume: resumer(lignes),
    // Le point de blocage le plus haut dans la liste. Le premier
    // problème rencontré est presque toujours la cause des suivants.
    premierBlocage: lignes.find((l) => l.etat === ETAT.NON) || null
  };
}

function resumer(lignes) {
  const c = { oui: 0, non: 0, indisponible: 0, a_verifier: 0 };
  for (const l of lignes) c[l.etat] = (c[l.etat] || 0) + 1;
  return c;
}
