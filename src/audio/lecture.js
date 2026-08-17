/* ===================================================================
   LECTURE D'UN ENREGISTREMENT

   Remplace `lireBlob()`, qui transformait tout échec en succès :

       audio.onerror = fin;
       audio.play().catch(fin);

   La promesse se résolvait de la même façon que la lecture ait eu lieu
   ou non. L'application affirmait donc avoir joué la voix de
   l'utilisateur alors qu'elle n'avait rien joué du tout.

   Ici, six états distincts, comme demandé. Aucun n'est confondu avec
   un succès.
   =================================================================== */

export const LECTURE = {
  TERMINEE: "terminee",              // démarrée puis arrivée à son terme
  DEMARREE_INTERROMPUE: "interrompue", // a commencé, coupée avant la fin
  BLOQUEE_IOS: "bloquee_navigateur", // play() refusée faute de geste utilisateur
  DECODAGE: "erreur_decodage",       // format non lisible par ce navigateur
  INAUDIBLE: "inaudible",            // volume nul ou sortie muette
  AUCUN_AUDIO: "aucun_audio"         // rien à lire
};

export const MESSAGE = {
  [LECTURE.TERMINEE]: "",
  [LECTURE.DEMARREE_INTERROMPUE]: "La lecture de ta voix a été interrompue.",
  [LECTURE.BLOQUEE_IOS]: "Le navigateur a refusé de jouer l'enregistrement sans un appui à l'écran.",
  [LECTURE.DECODAGE]: "Ce navigateur ne sait pas relire le format enregistré.",
  [LECTURE.INAUDIBLE]: "L'enregistrement a été joué mais le volume était nul.",
  [LECTURE.AUCUN_AUDIO]: "Enregistrement impossible : aucun audio à relire."
};

export const reussie = (r) => r?.etat === LECTURE.TERMINEE;

/**
 * Joue un enregistrement et rend compte de ce qui s'est réellement passé.
 *
 * @param {Blob} blob
 * @param {object} opt
 * @param {number} opt.volume        0 à 1
 * @param {function} opt.annule      renvoie true pour interrompre
 * @param {number} opt.plafondMs     garde-fou absolu
 */
export function jouer(blob, opt = {}) {
  const plafondMs = opt.plafondMs ?? 15000;

  return new Promise((resolve) => {
    if (!blob || !blob.size) {
      return resolve({ etat: LECTURE.AUCUN_AUDIO, message: MESSAGE[LECTURE.AUCUN_AUDIO],
                       demarree: false, dureeMs: 0 });
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let demarree = false;
    let fini = false;
    let t0 = 0;

    const nettoyer = () => {
      clearTimeout(plafond);
      audio.onplaying = audio.onended = audio.onerror = audio.onpause = null;
      try { audio.pause(); } catch (_) {}
      audio.removeAttribute("src");
      try { audio.load(); } catch (_) {}
      // Révocation APRÈS l'arrêt : révoquer pendant la lecture la coupe.
      URL.revokeObjectURL(url);
    };

    const terminer = (etat, detail) => {
      if (fini) return;
      fini = true;
      nettoyer();
      resolve({
        etat, message: detail || MESSAGE[etat] || "",
        demarree, dureeMs: t0 ? Math.round(performance.now() - t0) : 0
      });
    };

    // Sur iOS, lire en ligne évite le passage en plein écran.
    audio.playsInline = true;
    audio.preload = "auto";
    audio.volume = opt.volume ?? 1;
    audio.muted = false;
    audio.src = url;

    audio.onplaying = () => { demarree = true; t0 = performance.now(); };
    audio.onended = () => {
      if (audio.volume === 0 || audio.muted) return terminer(LECTURE.INAUDIBLE);
      terminer(LECTURE.TERMINEE);
    };
    audio.onerror = () => {
      const code = audio.error?.code;
      // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED : le conteneur n'est pas décodable.
      terminer(code === 4 ? LECTURE.DECODAGE : LECTURE.DEMARREE_INTERROMPUE,
        code === 4 ? `${MESSAGE[LECTURE.DECODAGE]} Format ${blob.type || "inconnu"}.` : "");
    };

    if (typeof opt.annule === "function") {
      const veille = setInterval(() => {
        if (fini) return clearInterval(veille);
        if (opt.annule()) { clearInterval(veille); terminer(LECTURE.DEMARREE_INTERROMPUE); }
      }, 120);
    }

    const plafond = setTimeout(() => {
      terminer(demarree ? LECTURE.DEMARREE_INTERROMPUE : LECTURE.BLOQUEE_IOS);
    }, plafondMs);

    const p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        const n = err?.name || "";
        // NotAllowedError : politique de lecture automatique du navigateur.
        if (n === "NotAllowedError" || n === "SecurityError") return terminer(LECTURE.BLOQUEE_IOS);
        if (n === "NotSupportedError") return terminer(LECTURE.DECODAGE);
        terminer(LECTURE.DEMARREE_INTERROMPUE, err?.message || "");
      });
    }
  });
}
