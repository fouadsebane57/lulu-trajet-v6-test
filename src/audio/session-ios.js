/* ===================================================================
   SESSION AUDIO iOS / SAFARI

   Safari sur iPhone peut changer la catégorie AVAudioSession quand
   getUserMedia() ouvre le micro. Le symptôme observé sur appareil réel
   est typique : le son fonctionne avant la première capture, puis les
   lectures deviennent muettes ou partent vers l'écouteur interne.

   Depuis iOS 17+, WebKit expose navigator.audioSession. On l'utilise
   quand il existe, sans jamais rendre l'application dépendante de
   cette API : les autres navigateurs continuent simplement sans elle.
   =================================================================== */

export const TYPE = {
  AUTO: "auto",
  LECTURE: "playback",
  CAPTURE: "play-and-record"
};

let sessionInjectee;

function session() {
  if (sessionInjectee !== undefined) return sessionInjectee;
  try { return globalThis.navigator?.audioSession || null; }
  catch (_) { return null; }
}

/** Injection réservée aux tests automatisés. `undefined` rend la main au navigateur. */
export function injecterPourTest(valeur = undefined) { sessionInjectee = valeur; }

export function disponible() { return !!session(); }

export function etat() {
  const s = session();
  if (!s) return { supporte: false, type: "indisponible", etat: "" };
  let type = "", state = "";
  try { type = s.type || ""; } catch (_) {}
  try { state = s.state || ""; } catch (_) {}
  return { supporte: true, type, etat: state };
}

export function appliquer(type) {
  const s = session();
  if (!s) return { supporte: false, demande: type, type: "indisponible", etat: "", erreur: "" };
  try {
    s.type = type;
    const e = etat();
    return { ...e, demande: type, erreur: "" };
  } catch (err) {
    const e = etat();
    return { ...e, demande: type, erreur: err?.name || err?.message || String(err) };
  }
}

/** Mode adapté à une sortie audible, y compris téléphone en silencieux. */
export function preparerLecture() { return appliquer(TYPE.LECTURE); }

/** Mode adapté à l'ouverture du micro. */
export function preparerCapture() { return appliquer(TYPE.CAPTURE); }

/** Rend le choix de catégorie au navigateur quand LULU a fini. */
export function reinitialiser() { return appliquer(TYPE.AUTO); }
