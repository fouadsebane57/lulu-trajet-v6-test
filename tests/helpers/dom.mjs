/* ===================================================================
   DOM MINIMAL POUR LES TESTS

   Raison d'être : le test de démarrage dépendait de jsdom, absent du
   ZIP livré. Il était donc IGNORÉ à l'exécution réelle, et le décompte
   annoncé ne correspondait pas au décompte obtenu.

   Ce module fournit exactement ce dont les modules ont besoin, et rien
   de plus. Aucune dépendance à installer, une seule commande de test.

   Ce n'est pas un navigateur. Il ne remplace pas un test sur appareil
   réel, et ne prétend pas le faire.
   =================================================================== */

/** Élément minimal : attributs, classes, dataset, enfants. */
class Element {
  constructor(tag = "div", attrs = {}) {
    this.tagName = String(tag).toUpperCase();
    this._attrs = { ...attrs };
    this.children = [];
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = "hidden" in this._attrs;
    this.style = { setProperty() {}, removeProperty() {} };
    this.dataset = {};
    for (const [k, v] of Object.entries(this._attrs)) {
      if (k.startsWith("data-")) {
        this.dataset[k.slice(5).replace(/-(.)/g, (_, c) => c.toUpperCase())] = v;
      }
    }
    const self = this;
    this.classList = {
      _set: new Set(String(this._attrs.class || "").split(/\s+/).filter(Boolean)),
      contains(c) { return this._set.has(c); },
      add(c) { this._set.add(c); self._attrs.class = [...this._set].join(" "); },
      remove(c) { this._set.delete(c); self._attrs.class = [...this._set].join(" "); },
      toggle(c, on) { on === undefined ? (this.contains(c) ? this.remove(c) : this.add(c)) : (on ? this.add(c) : this.remove(c)); }
    };
  }
  getAttribute(n) { return n === "class" ? (this._attrs.class ?? null) : (this._attrs[n] ?? null); }
  setAttribute(n, v) { this._attrs[n] = String(v); if (n === "hidden") this.hidden = true; }
  removeAttribute(n) { delete this._attrs[n]; if (n === "hidden") this.hidden = false; }
  hasAttribute(n) { return n in this._attrs; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener() {}
  removeEventListener() {}
  focus() {}
  canPlayType(type) { return (this._lisibles || []).some((x) => String(type).startsWith(x)) ? "probably" : ""; }
  play() { return Promise.reject(Object.assign(new Error("pas de son en test"), { name: "NotAllowedError" })); }
  pause() {}
  load() {}
}

/** Extrait les balises <section ...> d'un HTML, sans analyseur complet. */
function lireSections(html) {
  const out = [];
  const re = /<section\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    const ra = /([a-zA-Z-]+)(?:="([^"]*)")?/g;
    let a;
    while ((a = ra.exec(m[1]))) attrs[a[1]] = a[2] ?? "";
    if (attrs["data-view"]) out.push(new Element("section", attrs));
  }
  return out;
}

const lireIds = (html) => [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);

/** Stockage local conforme à ce qu'attendent les modules. */
function creerStockage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null
  };
}

/**
 * Installe un environnement minimal et le pose sur globalThis.
 * @param {string} html contenu de index.html
 * @param {object} opt  lisibles: types acceptés par canPlayType
 */
export function installer(html = "", opt = {}) {
  const sections = lireSections(html);
  const ids = new Set(lireIds(html));
  const parId = new Map();

  const document = {
    _html: html,
    hidden: false,
    body: new Element("body"),
    documentElement: new Element("html"),
    getElementById(id) {
      if (!ids.has(id)) return null;
      if (!parId.has(id)) parId.set(id, new Element("div", { id }));
      return parId.get(id);
    },
    createElement(tag) {
      const el = new Element(tag);
      if (tag === "audio") el._lisibles = opt.lisibles || [];
      return el;
    },
    querySelector(sel) {
      const m = /\[data-view="([a-z]+)"\]/.exec(sel);
      if (m) return sections.find((s) => s.dataset.view === m[1]) || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel.includes("data-view")) return sections;
      if (sel === ".view" || sel === "section[data-view]") return sections;
      return [];
    },
    addEventListener() {}, removeEventListener() {}
  };

  const window = {
    document,
    localStorage: creerStockage(),
    location: { protocol: "https:", hostname: "exemple.test", href: "https://exemple.test/lulu/", search: "", pathname: "/lulu/" },
    navigator: { userAgent: "Test", onLine: true, mediaDevices: undefined, permissions: undefined },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
    scrollTo() {}, alert() {}, confirm: () => false,
    fetch: async () => { throw new Error("réseau désactivé en test"); },
    speechSynthesis: { getVoices: () => [], cancel() {}, speak() {}, speaking: false, pending: false },
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    AudioContext: undefined, MediaRecorder: undefined,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    console
  };
  window.window = window;

  const poser = (nom, valeur) =>
    Object.defineProperty(globalThis, nom, { value: valeur, configurable: true, writable: true });
  for (const [nom, valeur] of Object.entries({
    window, document, navigator: window.navigator, location: window.location,
    localStorage: window.localStorage,
    SpeechSynthesisUtterance: window.SpeechSynthesisUtterance,
    speechSynthesis: window.speechSynthesis,
    MediaMetadata: class {}
  })) poser(nom, valeur);

  return { window, document, sections, ids: [...ids], Element };
}

/** Simule les capacités audio d'un appareil, pour formats.js. */
export function simulerAppareilAudio({ enregistrables = [], lisibles = [] } = {}) {
  Object.defineProperty(globalThis, "MediaRecorder", {
    value: { isTypeSupported: (m) => enregistrables.some((x) => String(m).startsWith(x)) },
    configurable: true, writable: true
  });
  Object.defineProperty(globalThis, "document", {
    value: { createElement: () => ({ canPlayType: (t) => lisibles.some((x) => String(t).startsWith(x)) ? "probably" : "" }) },
    configurable: true, writable: true
  });
}
export function retirerAppareilAudio() {
  delete globalThis.MediaRecorder;
  delete globalThis.document;
}
