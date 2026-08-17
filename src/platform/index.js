/* ===================================================================
   ADAPTATEURS DE PLATEFORME

   Le cœur pédagogique ne sait pas sur quoi il tourne. Tout ce qui
   dépend de la plateforme passe par un adaptateur au contrat unique.

   CONTRAT

     id
     nom
     stockage      { lire, ecrire, supprimer, lister }
     audio         { preparerSession, libererSession, gardeEveil }
     capacites()   ce que la plateforme sait réellement faire

   POURQUOI CETTE SÉPARATION EST NÉCESSAIRE ICI

   Le produit vise l'iPhone en voiture, écran verrouillé, audio en
   Bluetooth. Le navigateur ne sait pas tenir cet usage : la synthèse
   s'arrête au verrouillage, la session audio n'est pas pilotable, et
   l'application est suspendue en arrière-plan. Ce sont des limites du
   navigateur, pas de l'application.

   L'adaptateur natif expose les mêmes fonctions et laisse la couche
   iOS gérer la catégorie de session audio, les interruptions et la
   lecture en arrière-plan. Le reste du code ne change pas.

   ÉTAT DE LIVRAISON, DIT SANS DÉTOUR

   L'adaptateur web est complet et fonctionne.
   L'adaptateur natif est présent, avec sa configuration Capacitor,
   mais il n'a jamais été exécuté sur un iPhone réel dans ce lot.
   Aucun test automatique ne peut le prouver. Il est déclaré comme
   « à vérifier sur appareil », et le diagnostic l'affiche ainsi.
   =================================================================== */

export const PLATEFORME = { WEB: "web", NATIVE: "native", MEMOIRE: "memoire" };

/* ===================================================================
   WEB
   =================================================================== */

export function creerWeb() {
  const dispo = () => {
    try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; }
    catch (_) { return false; }
  };
  const memoire = new Map();
  const ok = typeof localStorage !== "undefined" && dispo();

  let verrou = null;

  return {
    id: PLATEFORME.WEB,
    nom: "Navigateur",

    stockage: {
      async lire(cle) {
        if (!ok) return memoire.get(cle) ?? null;
        try { return localStorage.getItem(cle); } catch (_) { return null; }
      },
      async ecrire(cle, valeur) {
        if (!ok) { memoire.set(cle, valeur); return true; }
        try { localStorage.setItem(cle, valeur); return true; }
        catch (_) { memoire.set(cle, valeur); return false; }
      },
      async supprimer(cle) {
        memoire.delete(cle);
        if (ok) { try { localStorage.removeItem(cle); } catch (_) {} }
        return true;
      },
      async lister(prefixe = "") {
        if (!ok) return [...memoire.keys()].filter((k) => k.startsWith(prefixe));
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefixe)) out.push(k);
        }
        return out;
      }
    },

    audio: {
      /**
       * Le navigateur ne donne aucun contrôle sur la session audio.
       * On le dit au lieu de faire semblant.
       */
      async preparerSession() {
        return { ok: true, pilotee: false,
                 note: "Le navigateur ne permet pas de choisir la catégorie de session audio." };
      },
      async libererSession() { return true; },
      async gardeEveil(actif) {
        if (!actif) { try { await verrou?.release(); } catch (_) {} verrou = null; return false; }
        try {
          if (!("wakeLock" in navigator)) return false;
          verrou = await navigator.wakeLock.request("screen");
          return true;
        } catch (_) { return false; }
      }
    },

    capacites() {
      const a = typeof document !== "undefined" ? document.createElement("audio") : null;
      return {
        stockageDurable: ok,
        microphone: !!(navigator?.mediaDevices?.getUserMedia),
        enregistrement: typeof MediaRecorder !== "undefined",
        // Limites réelles du navigateur, énoncées telles quelles.
        audioArrierePlan: false,
        ecranVerrouille: false,
        sessionAudioPilotable: false,
        syntheseSysteme: typeof speechSynthesis !== "undefined",
        lectureFichier: !!a,
        note: "En web, la synthèse vocale s'arrête au verrouillage de l'écran. Pour un usage en conduite, la version native est nécessaire."
      };
    }
  };
}

/* ===================================================================
   NATIF · Capacitor
   =================================================================== */

/**
 * @param {object} pont  objet Capacitor injecté. Aucun import direct :
 *                       le paquet n'est pas présent en web, et un
 *                       import statique casserait le chargement.
 */
export function creerNatif(pont) {
  const prefs = pont?.Preferences || null;
  const session = pont?.SessionAudio || null;

  return {
    id: PLATEFORME.NATIVE,
    nom: "Application native",

    stockage: {
      async lire(cle) {
        if (!prefs) return null;
        const { value } = await prefs.get({ key: cle });
        return value ?? null;
      },
      async ecrire(cle, valeur) { if (!prefs) return false; await prefs.set({ key: cle, value: valeur }); return true; },
      async supprimer(cle) { if (!prefs) return false; await prefs.remove({ key: cle }); return true; },
      async lister(prefixe = "") {
        if (!prefs) return [];
        const { keys } = await prefs.keys();
        return (keys || []).filter((k) => k.startsWith(prefixe));
      }
    },

    audio: {
      /**
       * Catégorie et mode de la session audio iOS.
       *
       * playAndRecord avec voiceChat est le réglage qui permet
       * d'alterner lecture et enregistrement. Conséquence connue et
       * inévitable : tant que le micro est actif, une liaison
       * Bluetooth bascule en mains libres, donc en mono de qualité
       * réduite. Ce n'est pas un défaut de l'application, c'est le
       * fonctionnement du Bluetooth.
       */
      async preparerSession(usage = "mixte") {
        if (!session) return { ok: false, pilotee: false, note: "Pont audio natif absent." };
        const config = usage === "lecture"
          ? { categorie: "playback", mode: "spokenAudio", options: ["allowBluetoothA2DP"] }
          : { categorie: "playAndRecord", mode: "voiceChat", options: ["allowBluetooth", "defaultToSpeaker", "duckOthers"] };
        try {
          await session.configurer(config);
          return { ok: true, pilotee: true, config,
                   note: usage === "mixte" ? "Pendant l'enregistrement, le Bluetooth passe en mains libres, en mono." : "" };
        } catch (e) {
          return { ok: false, pilotee: false, note: e?.message || "Configuration refusée." };
        }
      },
      async libererSession() { try { await session?.liberer(); return true; } catch (_) { return false; } },
      async gardeEveil() {
        // Inutile en natif : l'audio d'arrière-plan continue écran éteint.
        return true;
      }
    },

    capacites() {
      return {
        stockageDurable: !!prefs,
        microphone: true,
        enregistrement: true,
        audioArrierePlan: true,
        ecranVerrouille: true,
        sessionAudioPilotable: !!session,
        syntheseSysteme: true,
        lectureFichier: true,
        verifieSurAppareil: false,
        note: "Capacités annoncées par la plateforme. Aucune n'a été vérifiée sur un iPhone réel dans ce lot."
      };
    }
  };
}

/* ===================================================================
   MÉMOIRE · tests
   =================================================================== */

export function creerMemoire() {
  const m = new Map();
  return {
    id: PLATEFORME.MEMOIRE,
    nom: "Mémoire",
    stockage: {
      async lire(c) { return m.has(c) ? m.get(c) : null; },
      async ecrire(c, v) { m.set(c, v); return true; },
      async supprimer(c) { m.delete(c); return true; },
      async lister(p = "") { return [...m.keys()].filter((k) => k.startsWith(p)); }
    },
    audio: {
      async preparerSession() { return { ok: true, pilotee: false, note: "" }; },
      async libererSession() { return true; },
      async gardeEveil() { return false; }
    },
    capacites() {
      return { stockageDurable: true, microphone: false, enregistrement: false,
               audioArrierePlan: false, ecranVerrouille: false, sessionAudioPilotable: false,
               syntheseSysteme: false, lectureFichier: false, note: "Adaptateur de test." };
    }
  };
}

/* ---------- Détection ---------- */

export function detecter(pont = null) {
  if (pont?.estNatif) return creerNatif(pont);
  if (typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.()) {
    return creerNatif({
      estNatif: true,
      Preferences: window.Capacitor?.Plugins?.Preferences || null,
      SessionAudio: window.Capacitor?.Plugins?.SessionAudio || null
    });
  }
  if (typeof window !== "undefined") return creerWeb();
  return creerMemoire();
}
