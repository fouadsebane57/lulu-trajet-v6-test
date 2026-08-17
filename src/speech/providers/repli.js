/* ===================================================================
   FOURNISSEURS DE REPLI

   Deux fournisseurs, deux rôles très différents.

   NAVIGATEUR
   La reconnaissance intégrée au navigateur ne connaît PAS le
   luxembourgeois. Elle transcrit en allemand ce qu'elle entend. Elle
   est donc déclarée NON PROBANTE : elle peut confirmer qu'une
   tentative ressemble à la forme attendue, jamais l'infirmer.
   C'est la règle qui empêche l'application de sanctionner un
   apprenant pour une limite de l'outil.

   AUCUN
   Ce n'est pas un fournisseur inutile. C'est le mode qui garantit que
   l'application continue d'enseigner sans réseau, sans compte et sans
   autorisation d'API. Il ne transcrit rien et ne le cache pas. La
   séance continue avec écoute, répétition, écho et modèle, et
   l'ordonnanceur s'appuie alors sur les seules preuves disponibles.
   =================================================================== */

import { resultatVide } from "../provider.js";
import { CAUSE } from "../erreurs.js";
import { liberer, fluxOuvert } from "../../audio/mic.js";

/* ---------- Navigateur ---------- */

const API = () => (typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
  : null);

export function creerNavigateur({ langue = "de-DE" } = {}) {
  return {
    id: "navigateur",
    nom: "Reconnaissance du navigateur",
    langue,
    enLigne: true,
    specialise: false,
    // NON PROBANT. Ne connaît pas le luxembourgeois.
    probant: false,
    reserve: "Ce moteur transcrit en allemand. Il peut encourager, il ne peut pas juger le luxembourgeois.",

    async disponible() {
      if (!API()) return { ok: false, cause: CAUSE.MOTEUR_ABSENT, resume: "Ce navigateur n'a pas de reconnaissance vocale." };
      return { ok: true, cause: CAUSE.OK, resume: `Disponible, mais en ${langue}, pas en luxembourgeois.` };
    },

    async transcrire({ dureeMaxMs = 6000 } = {}) {
      const Rec = API();
      const t0 = Date.now();
      if (!Rec) return resultatVide("navigateur", CAUSE.MOTEUR_ABSENT, "Reconnaissance indisponible.");

      // Sur iOS, la reconnaissance du navigateur ne peut pas ouvrir le
      // micro tant qu'un flux le retient. Il faut le libérer avant.
      if (fluxOuvert()) await liberer();

      return new Promise((resolve) => {
        let rec, fini = false;
        const out = [];
        const finir = (cause, error = "") => {
          if (fini) return;
          fini = true;
          try { rec?.stop(); } catch (_) {}
          resolve({
            providerId: "navigateur",
            transcripts: out,
            cause: out.length ? CAUSE.OK : cause,
            error: out.length ? "" : error,
            latencyMs: Date.now() - t0,
            lang: langue, model: "navigateur", httpStatus: 0
          });
        };
        try { rec = new Rec(); } catch (e) { return finir(CAUSE.MOTEUR_ABSENT, e?.message); }
        rec.lang = langue;
        rec.interimResults = false;
        rec.maxAlternatives = 5;
        rec.continuous = false;
        rec.onresult = (e) => {
          try {
            const r = e.results[e.results.length - 1];
            for (let i = 0; i < r.length; i++) out.push({ text: r[i].transcript, confidence: r[i].confidence || 0 });
          } catch (_) {}
          finir(CAUSE.OK);
        };
        rec.onerror = (e) => finir(causeNavigateur(e.error), messageNavigateur(e.error));
        rec.onend = () => finir(CAUSE.TRANSCRIPTION_VIDE, "Le navigateur n'a retourné aucun texte.");
        try { rec.start(); }
        catch (e) { return finir(CAUSE.MOTEUR_ABSENT, "Démarrage refusé : " + e?.message); }
        setTimeout(() => finir(CAUSE.TIMEOUT, "Le navigateur n'a pas répondu dans le délai."), dureeMaxMs);
      });
    }
  };
}

const causeNavigateur = (c) => ({
  "not-allowed": CAUSE.AUTH, "service-not-allowed": CAUSE.AUTH,
  "network": CAUSE.RESEAU, "no-speech": CAUSE.TRANSCRIPTION_VIDE,
  "audio-capture": CAUSE.MOTEUR_ABSENT
}[c] || CAUSE.MOTEUR_ABSENT);

const messageNavigateur = (c) => ({
  "no-speech": "Le navigateur n'a entendu aucune parole.",
  "audio-capture": "Le navigateur n'a pas pu accéder au micro.",
  "not-allowed": "Autorisation refusée pour la reconnaissance du navigateur.",
  "service-not-allowed": "Le navigateur refuse d'utiliser son service de reconnaissance.",
  "network": "Le service de reconnaissance du navigateur est injoignable.",
  "aborted": "Reconnaissance interrompue."
}[c] || ("Erreur de reconnaissance : " + c));

/* ---------- Aucun moteur ---------- */

export function creerAucun() {
  return {
    id: "aucun",
    nom: "Sans reconnaissance",
    langue: "",
    enLigne: false,
    specialise: false,
    probant: false,
    reserve: "Aucune vérification des mots. L'apprentissage continue par l'écoute, la répétition et la comparaison.",
    async disponible() {
      return { ok: true, cause: CAUSE.OK, resume: "Mode autonome. Aucun mot n'est vérifié, la séance continue." };
    },
    async transcrire() {
      return resultatVide("aucun", CAUSE.MOTEUR_ABSENT, "Aucune reconnaissance demandée.");
    }
  };
}
