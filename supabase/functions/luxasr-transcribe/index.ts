/* ===================================================================
   RELAIS LuxASR

   Rôle : absorber trois choses que le navigateur ne doit pas porter.

   1. LE SECRET
      Toute clé d'accès reste ici, dans les secrets de la fonction.
      Le client n'envoie que son jeton de session et son audio.

   2. LA FILE D'ATTENTE
      LuxASR ne répond pas en un appel. On dépose un travail, on
      interroge son état, puis on récupère le résultat. Faire cela
      depuis le téléphone multiplierait les allers-retours sur un
      réseau de voiture, souvent instable.

   3. L'ORIGINE
      Un appel direct depuis le navigateur serait bloqué par la
      politique d'origine croisée.

   ÉTAT DE CETTE FONCTION

   Elle n'a JAMAIS été exécutée contre le service réel : l'autorisation
   d'intégration n'est pas obtenue. Les noms de champs et les chemins
   sont donc des HYPOTHÈSES DE TRAVAIL, à confronter à la documentation
   au moment où l'accès sera accordé. Ils sont regroupés en tête de
   fichier pour qu'un seul endroit soit à corriger.

   Tant que LUXASR_TOKEN est absent, la fonction répond 503 avec une
   cause explicite. Elle ne simule jamais une transcription.

   CONFIDENTIALITÉ
   L'audio n'est ni journalisé ni conservé. Seuls sont tracés la durée
   de traitement et le code de retour.
   =================================================================== */

// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ---------- Hypothèses de travail, à confirmer ---------- */
const LUXASR_BASE = Deno.env.get("LUXASR_BASE") || "https://luxasr.uni.lu";
const CHEMIN_DEPOT = Deno.env.get("LUXASR_SUBMIT_PATH") || "/asr2";
const CHEMIN_ETAT = Deno.env.get("LUXASR_JOB_PATH") || "/v3/asr/jobs";
const MODELE = Deno.env.get("LUXASR_MODEL") || "";

const ATTENTE_MAX_MS = 45000;
const INTERVALLE_MS = 1200;
const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;

const ENTETES = {
  "Access-Control-Allow-Origin": Deno.env.get("ORIGINE_AUTORISEE") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const repondre = (corps, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: ENTETES });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: ENTETES });
  if (req.method !== "POST") return repondre({ error: "Méthode non autorisée." }, 405);

  const debut = Date.now();

  /* --- 1. Authentification de l'utilisateur --- */
  const autorisation = req.headers.get("Authorization") || "";
  if (!autorisation.startsWith("Bearer ")) {
    return repondre({ error: "Connecte-toi pour utiliser la reconnaissance." }, 401);
  }

  const urlSupabase = Deno.env.get("SUPABASE_URL");
  const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!urlSupabase || !cleService) {
    return repondre({ error: "Fonction mal configurée : variables Supabase absentes." }, 500);
  }

  const supabase = createClient(urlSupabase, cleService, { auth: { persistSession: false } });
  const { data: utilisateur, error: erreurAuth } =
    await supabase.auth.getUser(autorisation.replace("Bearer ", ""));
  if (erreurAuth || !utilisateur?.user) {
    return repondre({ error: "Session expirée. Reconnecte-toi." }, 401);
  }

  /* --- 2. Autorisation d'accès au service --- */
  const jetonLuxasr = Deno.env.get("LUXASR_TOKEN");
  if (!jetonLuxasr) {
    // Situation actuelle. On le dit, on ne simule rien.
    return repondre({
      error: "La reconnaissance luxembourgeoise n'est pas encore autorisée pour cette application. "
           + "L'autorisation d'intégration doit être demandée à l'Université du Luxembourg.",
      cause: "autorisation_absente"
    }, 503);
  }

  /* --- 3. Lecture de la demande --- */
  let corps;
  try { corps = await req.json(); }
  catch (_) { return repondre({ error: "Requête illisible." }, 400); }

  const { audioBase64, mimeType, prompt } = corps || {};
  if (!audioBase64) return repondre({ error: "Aucun enregistrement reçu." }, 400);

  let octets;
  try { octets = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0)); }
  catch (_) { return repondre({ error: "Enregistrement illisible." }, 400); }

  if (octets.byteLength > TAILLE_MAX_OCTETS) {
    return repondre({ error: "Enregistrement trop long. Parle moins longtemps." }, 413);
  }

  /* --- 4. Dépôt du travail --- */
  try {
    const formulaire = new FormData();
    formulaire.append("file", new Blob([octets], { type: mimeType || "audio/webm" }), "reponse.webm");
    if (MODELE) formulaire.append("model", MODELE);
    // Le guidage par vocabulaire attendu est le principal levier de
    // qualité sur une langue peu dotée. Il est transmis s'il est
    // accepté ; sinon le service l'ignore, sans conséquence.
    if (prompt) formulaire.append("prompt", String(prompt).slice(0, 900));

    const depot = await fetch(`${LUXASR_BASE}${CHEMIN_DEPOT}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jetonLuxasr}` },
      body: formulaire
    });

    if (!depot.ok) {
      const detail = await depot.text().catch(() => "");
      return repondre({
        error: `Le service de reconnaissance a refusé la demande (${depot.status}).`,
        detail: detail.slice(0, 300)
      }, depot.status === 429 ? 429 : 502);
    }

    const reponseDepot = await depot.json().catch(() => ({}));

    // Certains services répondent directement. On accepte les deux cas.
    const direct = extraireTexte(reponseDepot);
    if (direct) {
      return repondre({
        transcripts: [{ text: direct, confidence: 0 }],
        lang: "lb", model: MODELE || "luxasr",
        ipa: reponseDepot.ipa || "",
        dureeMs: Date.now() - debut
      });
    }

    const idTravail = reponseDepot.job_id || reponseDepot.id || reponseDepot.jobId;
    if (!idTravail) {
      return repondre({ error: "Le service n'a pas renvoyé d'identifiant de travail." }, 502);
    }

    /* --- 5. Attente du résultat --- */
    const limite = debut + ATTENTE_MAX_MS;
    while (Date.now() < limite) {
      await new Promise((r) => setTimeout(r, INTERVALLE_MS));

      const etat = await fetch(`${LUXASR_BASE}${CHEMIN_ETAT}/${idTravail}`, {
        headers: { Authorization: `Bearer ${jetonLuxasr}` }
      });
      if (!etat.ok) continue;

      const donnees = await etat.json().catch(() => ({}));
      const statut = String(donnees.status || donnees.state || "").toLowerCase();

      if (statut.includes("error") || statut.includes("fail")) {
        return repondre({ error: "Le service n'a pas pu traiter cet enregistrement." }, 502);
      }
      if (!statut || statut.includes("done") || statut.includes("complet") || statut.includes("finish")) {
        const texte = extraireTexte(donnees) || await recupererResultat(idTravail, jetonLuxasr);
        if (!texte) continue;
        return repondre({
          transcripts: [{ text: texte, confidence: 0 }],
          lang: "lb", model: MODELE || "luxasr",
          ipa: donnees.ipa || "",
          dureeMs: Date.now() - debut
        });
      }
    }

    return repondre({
      error: "Le service de reconnaissance met trop de temps à répondre. Réessaie plus tard.",
      cause: "delai_depasse"
    }, 504);

  } catch (e) {
    return repondre({ error: "Le service de reconnaissance est injoignable.", detail: String(e?.message || e).slice(0, 200) }, 502);
  }
});

function extraireTexte(o) {
  if (!o || typeof o !== "object") return "";
  const candidats = [o.text, o.transcript, o.transcription, o.result?.text, o.result?.transcript];
  for (const c of candidats) if (typeof c === "string" && c.trim()) return c.trim();
  return "";
}

async function recupererResultat(idTravail, jeton) {
  try {
    const r = await fetch(`${LUXASR_BASE}${CHEMIN_ETAT}/${idTravail}/result`, {
      headers: { Authorization: `Bearer ${jeton}` }
    });
    if (!r.ok) return "";
    const type = r.headers.get("content-type") || "";
    if (type.includes("json")) return extraireTexte(await r.json().catch(() => ({})));
    const texte = await r.text();
    return texte.trim();
  } catch (_) { return ""; }
}
