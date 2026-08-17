/* =====================================================================
   LULU TRAJET · CONFIGURATION PUBLIQUE

   MODE D'EMPLOI
   1. Renseigne les valeurs marquées À REMPLIR.
   2. Enregistre ce fichier sous le nom exact  config.js
   3. Place-le à la racine, à côté de index.html.

   config.js n'est JAMAIS livré dans le ZIP et ne doit jamais être
   envoyé sur GitHub. Un test de livraison échoue s'il est présent.

   Ce fichier est PUBLIC. Il ne contient que des valeurs publiques.
   Ne jamais y mettre :
     une clé secrète Supabase, sb_secret_ ou service_role
     un secret de webhook, whsec_
     une clé privée de compte de service

   Ces valeurs vont uniquement dans les secrets des Edge Functions.

   SANS CE FICHIER
   L'application fonctionne. Elle bascule simplement en mode sans
   reconnaissance : écoute, répétition, écho et modèle continuent, et
   le diagnostic affiche la valeur exacte qui manque.
   ===================================================================== */
window.LULU_CONFIG = {
  appVersion: "6.0.0",
  appName: "LULU Trajet",

  // À REMPLIR · Supabase, Project Settings, section Data API.
  supabaseUrl: "",

  // À REMPLIR · Supabase, Project Settings, API Keys.
  // La clé PUBLIABLE, sb_publishable_… Elle est publique par
  // conception et protégée par les règles d'accès côté serveur.
  supabaseAnonKey: "",

  // À REMPLIR · l'adresse ci-dessus suivie de /functions/v1
  functionsBaseUrl: "",

  supportEmail: "",
  legalBusinessName: "À COMPLÉTER"
};

// Compatibilité avec les versions précédentes.
window.LETZ_CONFIG = window.LULU_CONFIG;
