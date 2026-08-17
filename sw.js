/* ===================================================================
   SERVICE WORKER

   Stratégie : le contenu et le code sont mis en cache à l'installation
   pour que la séance fonctionne sans réseau. Les appels aux
   fournisseurs de reconnaissance ne sont JAMAIS mis en cache : une
   transcription périmée serait pire qu'une absence de transcription.

   Le numéro de version doit changer à chaque livraison, sinon les
   téléphones gardent l'ancienne.
   =================================================================== */
const VERSION = "lulu-v6-0-0";

const FICHIERS = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest",
  "./src/app.js",
  "./src/content/index.js", "./src/content/phrases-a.js", "./src/content/phrases-b.js",
  "./src/content/dialogues.js", "./src/content/parcours.js", "./src/content/version.js",
  "./src/content/exercices.js",
  "./src/core/rng.js", "./src/core/file.js", "./src/core/preuve.js", "./src/core/scheduler.js",
  "./src/core/session.js", "./src/core/state.js", "./src/core/profil.js",
  "./src/core/restitution.js", "./src/core/config.js",
  "./src/audio/machine.js", "./src/audio/mic.js", "./src/audio/recorder.js",
  "./src/audio/formats.js", "./src/audio/vad.js", "./src/audio/lecture.js",
  "./src/audio/rythme.js", "./src/audio/tts.js", "./src/audio/tentative.js",
  "./src/audio/voix-modele.js",
  "./src/speech/engine.js", "./src/speech/score.js", "./src/speech/normalize.js",
  "./src/speech/erreurs.js", "./src/speech/provider.js", "./src/speech/prononciation.js",
  "./src/speech/providers/index.js", "./src/speech/providers/luxasr.js", "./src/speech/providers/repli.js",
  "./src/platform/index.js", "./src/ui/diagnostic.js",
  "./icon-192.png", "./icon-512.png", "./favicon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll échoue en bloc si un seul fichier manque. On installe
      // fichier par fichier pour qu'une ressource absente ne prive pas
      // l'application de tout son cache.
      .then((c) => Promise.all(FICHIERS.map((f) => c.add(f).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((x) => x !== VERSION).map((x) => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Jamais de cache sur les appels de reconnaissance vocale.
  if (url.pathname.includes("/functions/") || url.pathname.includes("transcribe")) return;

  e.respondWith(
    caches.match(e.request).then((rep) => {
      if (rep) return rep;
      return fetch(e.request).then((net) => {
        const copie = net.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copie)).catch(() => {});
        return net;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
