/* ===================================================================
   CONFIGURATION

   La 5.0.0 se contentait de dire « non configurée » sans jamais dire
   POURQUOI. Sur l'appareil de l'utilisateur, config.js était bien
   présent mais contenait trois chaînes vides, héritées de la v4.
   L'application avait raison, elle était juste inutilisable.

   Ce module vérifie la configuration champ par champ et sait dire
   exactement ce qui manque et à quoi ressemble une valeur correcte.

   Compatibilité : window.LULU_CONFIG est le nom retenu. L'ancien
   window.LETZ_CONFIG reste accepté pour ne casser aucun déploiement.
   =================================================================== */

import { CAUSE } from "../speech/erreurs.js";

export const brut = () => window.LULU_CONFIG || window.LETZ_CONFIG || null;

const REQUIS = [
  {
    cle: "supabaseUrl",
    libelle: "Adresse Supabase",
    exemple: "https://xxxxxxxx.supabase.co",
    valide: (v) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(v).trim())
  },
  {
    cle: "supabaseAnonKey",
    libelle: "Clé publiable Supabase",
    exemple: "sb_publishable_… ou une clé anon commençant par eyJ",
    valide: (v) => {
      const s = String(v).trim();
      return s.length > 20 && (s.startsWith("sb_publishable_") || s.startsWith("eyJ"));
    }
  },
  {
    cle: "functionsBaseUrl",
    libelle: "Adresse des fonctions",
    exemple: "https://xxxxxxxx.supabase.co/functions/v1",
    valide: (v) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/?$/i.test(String(v).trim())
  }
];

/**
 * Contrôle complet. Renvoie l'état, la cause et le détail par champ.
 * Utilisé par le diagnostic et par le moteur vocal.
 */
export function verifier() {
  const c = brut();
  if (!c) {
    return {
      ok: false, cause: CAUSE.CONFIG_ABSENTE, champs: [],
      resume: "config.js n'a pas été chargé."
    };
  }
  const champs = REQUIS.map((r) => {
    const valeur = c[r.cle];
    const vide = valeur === undefined || valeur === null || String(valeur).trim() === "";
    return {
      cle: r.cle, libelle: r.libelle, exemple: r.exemple,
      vide,
      formatOk: !vide && r.valide(valeur),
      apercu: vide ? "" : masquer(String(valeur))
    };
  });

  const manquants = champs.filter((x) => x.vide);
  const malformes = champs.filter((x) => !x.vide && !x.formatOk);

  if (manquants.length) {
    return {
      ok: false, cause: CAUSE.CONFIG_INCOMPLETE, champs, manquants, malformes,
      resume: `${manquants.length} valeur${manquants.length > 1 ? "s" : ""} vide${manquants.length > 1 ? "s" : ""} dans config.js : ${manquants.map((m) => m.cle).join(", ")}.`
    };
  }
  if (malformes.length) {
    return {
      ok: false, cause: CAUSE.CONFIG_INCOMPLETE, champs, manquants, malformes,
      resume: `Format inattendu pour ${malformes.map((m) => m.cle).join(", ")}.`
    };
  }
  return { ok: true, cause: CAUSE.OK, champs, manquants: [], malformes: [], resume: "Configuration complète." };
}

/** Aperçu sûr d'une valeur. Ne révèle jamais une clé entière. */
function masquer(v) {
  if (v.length <= 24) return v;
  return `${v.slice(0, 14)}…${v.slice(-4)} (${v.length} caractères)`;
}

/* ---------- Accès aux valeurs, avec repli sûr ---------- */

const c = () => brut() || {};

export const version = () => c().appVersion || "5.1.0";
export const nomApp = () => c().appName || "LULU Trajet";
export const supabaseUrl = () => String(c().supabaseUrl || "").trim().replace(/\/$/, "");
export const supabaseAnonKey = () => String(c().supabaseAnonKey || "").trim();
export const functionsBaseUrl = () => String(c().functionsBaseUrl || "").trim().replace(/\/$/, "");
export const tarifs = () => c().pricing || { monthly: 7.99, yearly: 59.99, currency: "EUR" };
export const gratuit = () => c().free || { lessons: 8, maxSessionMinutes: 20 };
export const emailSupport = () => c().supportEmail || "";

export const configureeSupabase = () => {
  const v = verifier();
  return v.ok;
};

/** Texte prêt à coller dans un message d'assistance. */
export function rapport() {
  const v = verifier();
  const lignes = [`Configuration : ${v.resume}`];
  for (const ch of v.champs) {
    lignes.push(`  ${ch.cle} : ${ch.vide ? "VIDE" : ch.formatOk ? "ok" : "format inattendu"}`);
  }
  return lignes.join("\n");
}
