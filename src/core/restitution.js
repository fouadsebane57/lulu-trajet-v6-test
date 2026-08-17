/* ===================================================================
   RESTITUTION APRÈS UNE RÉPONSE ORALE

   Ce module contient la séquence audio réellement jouée après une
   tentative. Il est extrait de app.js pour une raison précise : les
   tests d'intégration doivent exercer L'ORCHESTRATION RÉELLE, pas une
   imitation. Toute divergence entre le testé et l'exécuté finirait par
   laisser passer un défaut, comme cela s'est produit en GATE 2.1.

   Aucune dépendance au DOM. Aucune écriture de progression.

   ------------------------------------------------------------------
   POURQUOI L'ORDRE A CHANGÉ EN GATE 2.2

   Ordre précédent :
     retour -> modèle -> ta voix -> modèle

   Il posait deux problèmes.

   1. Il exigeait la transition PLAYING_PROMPT vers PLAYING_ECHO, que
      la machine refusait. L'écho ne pouvait donc jamais être joué en
      mode local ni sur une réponse cloud incorrecte. Les tests
      passaient parce qu'ils exerçaient la machine isolément, dans un
      ordre qui n'était pas celui du produit.

   2. Il faisait entendre le modèle deux fois et l'enregistrement au
      milieu. Quatre segments audio après chaque réponse, c'est long
      en conduite, et l'attention se dilue.

   Ordre retenu :
     retour -> ta voix -> modèle

   Trois arguments.

   a) La comparaison est plus informative juste après le verdict :
      on sait ce qui est jugé au moment où on s'entend.
   b) Le dernier son entendu est la FORME CIBLE, pas sa propre erreur.
      Terminer sur la production fautive de l'apprenant travaille
      contre l'objectif.
   c) Chaque état n'apparaît qu'une fois par exercice. La machine reste
      stricte, et une seule transition manquait réellement :
      GIVING_FEEDBACK vers PLAYING_ECHO, qui a un sens clair.
   =================================================================== */

/** Ce que la restitution a réellement fait. Sert aux tests et au journal. */
export function rapportVide() {
  return { sequence: [], echoDemande: false, echoJoue: false, echoResultat: null, interrompu: false };
}

/**
 * Joue la restitution.
 *
 * @param {object}   o.audio        machine à états
 * @param {object}   o.item         expression travaillée
 * @param {object}   o.resultat     sortie de evaluerReponse()
 * @param {boolean}  o.echoActive   réglage utilisateur
 * @param {function} o.rejouer      renvoie le résultat de lecture, ou null
 * @param {function} o.vivant       false si la séance a été quittée
 * @param {string}   o.messageVerdict texte du retour pédagogique
 */
export async function restituer(o) {
  const { audio, item, resultat, echoActive, rejouer, vivant, messageVerdict } = o;
  const rapport = rapportVide();
  const encore = () => (typeof vivant === "function" ? vivant() : true);
  const noter = (etape) => rapport.sequence.push(etape);

  // 1. Retour pédagogique. Toujours en premier : l'apprenant doit
  //    savoir ce qui est jugé avant d'entendre quoi que ce soit.
  const texte = resultat.engine === "local"
    ? (resultat.messageRythme || "Écoute ta voix, puis le modèle.")
    : messageVerdict;
  await audio.direRetour(texte);
  noter("retour");
  if (!encore()) { rapport.interrompu = true; return rapport; }

  // 2. Sur une réponse jugée correcte par un moteur fiable, on ne
  //    rejoue rien. Répéter ce qui est acquis coûte du temps de séance
  //    sans rien apporter. Décision explicite, testée comme telle.
  const reponseCorrecte = resultat.engine === "cloud" && resultat.fiable && resultat.correct;
  if (reponseCorrecte) return rapport;

  // 3. Ta voix, si l'écho est activé.
  rapport.echoDemande = !!echoActive;
  if (echoActive) {
    const res = await rejouer(resultat);
    noter("echo");
    rapport.echoResultat = res || null;
    rapport.echoJoue = !!(res && res.etat === "terminee");
    if (!encore()) { rapport.interrompu = true; return rapport; }
  }

  // 4. Le modèle en dernier. C'est la forme cible qui doit rester.
  //    Un échec de lecture de l'écho ne bloque jamais cette étape.
  await audio.direModele(item.lb, "lb", 0.85);
  noter("modele");
  return rapport;
}
