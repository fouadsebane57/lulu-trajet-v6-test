/* ===================================================================
   FOURNISSEUR · LuxASR

   LuxASR est développé à l'Université du Luxembourg. C'est le seul
   moteur réellement spécialisé dans le luxembourgeois. Il est donc le
   fournisseur PROBANT de référence de cette application.

   TROIS FAITS À CONNAÎTRE AVANT DE LIRE LE CODE

   1. L'accès n'est pas libre. L'intégration dans une autre application
      demande une autorisation préalable. Tant qu'elle n'est pas
      obtenue, ce fournisseur reste déclaré indisponible et l'annonce
      la cause exacte. Il ne prétend jamais fonctionner.

   2. L'API n'est pas un appel unique. C'est une file : on dépose, on
      interroge, on récupère. Le relais serveur absorbe cette
      mécanique pour que le client n'ait qu'un appel à faire, et pour
      qu'aucun identifiant d'accès n'atteigne le navigateur.

   3. Les taux d'erreur publiés portent sur de la parole NATIVE.
      Aucune mesure publique n'existe sur de la parole d'apprenant
      francophone. La qualité réelle pour cet usage est donc INCONNUE
      tant qu'elle n'a pas été mesurée sur l'appareil. Le diagnostic le
      dit, et le verdict pédagogique en tient compte.

   Le client n'appelle jamais luxasr.uni.lu directement : origine
   croisée, et surtout aucune autorisation d'accès côté navigateur.
   =================================================================== */

import { resultatVide } from "../provider.js";
import { CAUSE } from "../erreurs.js";
import { blobEnBase64 } from "../../audio/recorder.js";
import * as Cfg from "../../core/config.js";

export const TIMEOUT_MS = 20000;

/**
 * @param {object} o
 * @param {function} o.jeton       renvoie le jeton de session, ou ""
 * @param {function} o.autorise    true si l'autorisation LuxASR est acquise
 * @param {function} o.fetchImpl   injectable pour les tests
 */
export function creer({ jeton = async () => "", autorise = () => false, fetchImpl = null } = {}) {
  const appel = fetchImpl || ((...a) => fetch(...a));

  return {
    id: "luxasr",
    nom: "LuxASR, Université du Luxembourg",
    langue: "lb",
    enLigne: true,
    specialise: true,
    // Seul moteur autorisé à écrire une preuve pédagogique.
    probant: true,

    /**
     * Précision affichée partout où le verdict est expliqué.
     * Ce n'est pas une clause de style : elle change la façon dont un
     * échec doit être interprété.
     */
    reserve: "Taux d'erreur publié sur parole native. Aucune mesure publique n'existe sur la parole d'un apprenant francophone.",

    async disponible() {
      if (!autorise()) {
        return {
          ok: false, cause: CAUSE.NON_CONNECTE,
          resume: "LuxASR n'est pas encore autorisé pour cette application. L'autorisation d'intégration doit être demandée à l'Université du Luxembourg."
        };
      }
      const v = Cfg.verifier();
      if (!v.ok) return { ok: false, cause: v.cause, resume: v.resume };
      const j = await jeton();
      if (!j) return { ok: false, cause: CAUSE.NON_CONNECTE, resume: "Connecte-toi pour utiliser la reconnaissance luxembourgeoise." };
      return { ok: true, cause: CAUSE.OK, resume: "LuxASR, relais serveur, traitement au Luxembourg." };
    },

    async transcrire({ blob, mimeType, attendu, acceptees, contexte }) {
      const t0 = Date.now();
      const echec = (cause, error, extra = {}) => ({
        ...resultatVide("luxasr", cause, error),
        latencyMs: Date.now() - t0, ...extra
      });

      const dispo = await this.disponible();
      if (!dispo.ok) return echec(dispo.cause, dispo.resume);
      if (!blob || !blob.size) return echec(CAUSE.TRANSCRIPTION_VIDE, "Aucun enregistrement à envoyer.");

      const url = `${Cfg.functionsBaseUrl()}/luxasr-transcribe`;
      const controleur = new AbortController();
      const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);

      try {
        const audioBase64 = await blobEnBase64(blob);
        const res = await appel(url, {
          method: "POST",
          signal: controleur.signal,
          headers: {
            "Content-Type": "application/json",
            apikey: Cfg.supabaseAnonKey(),
            Authorization: `Bearer ${await jeton()}`
          },
          body: JSON.stringify({
            audioBase64,
            mimeType: mimeType || "audio/webm",
            // Le guidage par le vocabulaire attendu est le principal
            // levier de qualité sur une langue peu dotée.
            prompt: [attendu, ...(acceptees || []), ...(contexte || [])].filter(Boolean).slice(0, 40).join(" · ").slice(0, 850)
          })
        });

        const texte = await res.text();
        let data = {};
        try { data = texte ? JSON.parse(texte) : {}; }
        catch (_) {
          return echec(CAUSE.FONCTION_INTROUVABLE,
            `Réponse inattendue (${res.status}) à l'adresse ${url}.`, { httpStatus: res.status });
        }
        if (!res.ok) {
          const { causeDeReponse } = await import("../erreurs.js");
          return echec(causeDeReponse(res.status, data), data.error || `Erreur HTTP ${res.status}`, { httpStatus: res.status });
        }

        const transcripts = Array.isArray(data.transcripts) ? data.transcripts : [];
        if (!transcripts.length) {
          return echec(CAUSE.TRANSCRIPTION_VIDE, "LuxASR a répondu sans reconnaître de mot.", { httpStatus: 200 });
        }
        return {
          providerId: "luxasr",
          transcripts,
          cause: CAUSE.OK, error: "",
          latencyMs: Date.now() - t0,
          lang: data.lang || "lb",
          model: data.model || "luxasr",
          httpStatus: 200,
          // Transcription phonétique, quand le service la renvoie.
          // Affichée à titre indicatif, jamais convertie en note.
          ipa: data.ipa || ""
        };
      } catch (err) {
        const { causeDException } = await import("../erreurs.js");
        return echec(causeDException(err), err?.message || "Appel interrompu.");
      } finally {
        clearTimeout(minuteur);
      }
    }
  };
}
