/* ===================================================================
   CHOIX DU FORMAT D'ENREGISTREMENT

   Position méthodologique.

   Le bug d'écho observé sur iPhone a une explication PLAUSIBLE liée au
   conteneur WebM, mais elle n'est pas démontrée sur cet appareil.
   Ce module ne s'appuie donc sur AUCUNE règle du type
   « si Safari alors MP4 ». Il mesure les capacités réelles de
   l'appareil au moment de l'exécution, et il affiche ce qu'il a mesuré.

   Trois critères, évalués séparément :

     enregistrable   MediaRecorder.isTypeSupported()
     relisible       canPlayType() sur l'élément audio
     transcription   compatibilité du service Speech To Text

   Une seule propriété par donnée. Les anciens noms de critères ont été
   supprimés : recorder.js exposait `relisible` pendant que choisir()
   renvoyait un autre nom pour la même information. Deux noms pour une
   même donnée sont une source d'erreur.

   Un format n'est retenu que s'il satisfait A, B et C. À défaut, on
   descend explicitement en priorité et on dit ce qui a été sacrifié.

   Le résultat peut différer d'un appareil à l'autre, et c'est voulu.
   =================================================================== */

/**
 * Compatibilité avec Google Speech-to-Text V2, AutoDetectDecodingConfig.
 * WEBM_OPUS, OGG_OPUS, MP4_AAC et M4A_AAC figurent parmi les formats
 * officiellement pris en charge par la détection automatique.
 *
 * `officiel` signifie : documenté par le fournisseur.
 * `aTester` signifie : le fichier réellement produit par CE navigateur
 * n'a pas encore été soumis au service.
 */
export const STT = {
  OFFICIEL: "officiel",
  A_TESTER: "a_tester",
  INCONNU: "inconnu"
};

export const CANDIDATS = [
  {
    mime: "audio/mp4",
    lecture: ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", "audio/x-m4a"],
    stt: STT.OFFICIEL,          // MP4_AAC et M4A_AAC
    note: "MP4 AAC"
  },
  {
    mime: "audio/webm;codecs=opus",
    lecture: ["audio/webm;codecs=opus", "audio/webm"],
    stt: STT.OFFICIEL,          // WEBM_OPUS
    note: "WebM Opus"
  },
  {
    mime: "audio/ogg;codecs=opus",
    lecture: ["audio/ogg;codecs=opus", "audio/ogg"],
    stt: STT.OFFICIEL,          // OGG_OPUS
    note: "Ogg Opus"
  },
  { mime: "audio/webm", lecture: ["audio/webm"], stt: STT.OFFICIEL, note: "WebM générique" },
  { mime: "audio/mpeg", lecture: ["audio/mpeg"], stt: STT.OFFICIEL, note: "MP3" },
  { mime: "audio/aac", lecture: ["audio/aac", "audio/mp4"], stt: STT.A_TESTER, note: "AAC brut" }
];

/** Critère A. */
export function enregistrable(mime) {
  return typeof MediaRecorder !== "undefined" && !!MediaRecorder.isTypeSupported?.(mime);
}

/** Critère B. Mesuré, jamais supposé à partir du nom du navigateur. */
export function relisible(types) {
  if (typeof document === "undefined") return false;
  let audio;
  try { audio = document.createElement("audio"); } catch (_) { return false; }
  return types.some((t) => {
    const r = audio.canPlayType(t);
    return r === "probably" || r === "maybe";
  });
}

/** Critère C. */
export const transcriptible = (c) => c.stt === STT.OFFICIEL || c.stt === STT.A_TESTER;

/**
 * Sélectionne le format. Renvoie toujours un objet exploitable, avec
 * le détail des trois critères et ce qui a éventuellement été sacrifié.
 */
export function choisir() {
  if (typeof MediaRecorder === "undefined") {
    return {
      mime: null, note: "Enregistrement impossible",
      enregistrable: false, relisible: false, transcription: STT.INCONNU,
      complet: false, cause: "mediarecorder_absent",
      explication: "Ce navigateur ne sait pas enregistrer de son."
    };
  }

  const evalues = CANDIDATS.map((c) => ({
    ...c,
    estEnregistrable: enregistrable(c.mime),
    estRelisible: relisible(c.lecture),
    transcription: c.stt
  }));

  const parfait = evalues.find((c) => c.estEnregistrable && c.estRelisible && transcriptible(c));
  if (parfait) {
    return {
      mime: parfait.mime, note: parfait.note,
      enregistrable: true, relisible: true, transcription: parfait.stt,
      complet: true, cause: "ok",
      explication: `${parfait.note}. Enregistrable, relisible sur cet appareil, et pris en charge par le service de transcription.`
    };
  }

  // Aucun format ne satisfait les trois. On privilégie la transcription,
  // qui est l'objectif pédagogique, et on annonce la perte.
  const transcrivable = evalues.find((c) => c.estEnregistrable && transcriptible(c));
  if (transcrivable) {
    return {
      mime: transcrivable.mime, note: transcrivable.note,
      enregistrable: true, relisible: false, transcription: transcrivable.stt,
      complet: false, cause: "non_relisible_localement",
      explication: `${transcrivable.note}. Cet appareil sait l'enregistrer mais pas le relire : la réécoute de ta voix sera indisponible. La transcription reste possible.`
    };
  }

  const premier = evalues.find((c) => c.estEnregistrable);
  if (premier) {
    return {
      mime: premier.mime, note: premier.note,
      enregistrable: true, relisible: premier.estRelisible, transcription: premier.stt,
      complet: false, cause: "compatibilite_transcription_inconnue",
      explication: `${premier.note}. Compatibilité avec le service de transcription à confirmer sur cet appareil.`
    };
  }

  return {
    mime: "", note: "Format par défaut du navigateur",
    enregistrable: true, relisible: relisible(["audio/mp4", "audio/webm", "audio/ogg"]), transcription: STT.INCONNU,
    complet: false, cause: "defaut_navigateur",
    explication: "Aucun format connu n'est annoncé comme supporté. Le navigateur choisira seul."
  };
}

/** Inventaire complet, affiché dans le diagnostic. */
export function inventaire() {
  return CANDIDATS.map((c) => ({
    mime: c.mime, note: c.note,
    enregistrable: enregistrable(c.mime),
    relisible: relisible(c.lecture),
    stt: c.stt
  }));
}

/** Résumé lisible des trois critères, pour l'écran de diagnostic. */
export function resume(f = choisir()) {
  const oui = (b) => (b ? "compatible" : "non compatible");
  const sttTexte = { [STT.OFFICIEL]: "compatible", [STT.A_TESTER]: "à tester", [STT.INCONNU]: "inconnue" };
  return {
    enregistrement: f.mime || "par défaut",
    lectureLocale: oui(f.relisible),
    speechToText: sttTexte[f.transcription] || "inconnue",
    complet: f.complet,
    explication: f.explication
  };
}
