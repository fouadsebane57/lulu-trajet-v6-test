# Test sur iPhone

À faire **à l'arrêt**, moteur coupé, une seule fois. Compte vingt
minutes. Note ce qui bloque, avec le numéro de l'étape.

---

## 1. Installer

Ouvre l'adresse **dans Safari**, pas dans une autre application.
Bouton Partager, puis « Sur l'écran d'accueil ». Lance l'application
depuis l'icône.

**Attendu :** l'écran d'accueil affiche « LULU Trajet » et trois
boutons de séance.

---

## 2. Lancer le diagnostic

Onglet Voix, bouton « Lancer le diagnostic ». Autorise le micro quand
iOS le demande. Parle quand l'application te le demande.

**Attendu :** une liste de lignes, chacune avec ✓, ✕, — ou ?

**Note les lignes ✕.** Chacune dit sa cause et l'action à faire.

Lignes qui doivent être ✓ :
- Adresse sécurisée
- Micro autorisé
- Le micro reçoit du son
- Format d'enregistrement
- Enregistrement
- Réécoute de ta voix
- Micro refermé après le test

Lignes qui seront ✕ ou —, et c'est normal :
- Reconnaissance luxembourgeoise → autorisation non obtenue
- Correction phonétique → aucun outil ne sait le faire
- Voix du modèle → voix allemande, pas luxembourgeoise
- Audio écran verrouillé → limite du navigateur

---

## 3. Écouter un exemple

Onglet Phrases, bouton « Écouter » sur la première phrase.

**Attendu :** tu entends la phrase. Un avertissement précise que la
voix est allemande.

**Si tu n'entends rien :** vérifie le bouton silencieux sur le côté du
téléphone, puis le volume.

---

## 4. Faire une séance de dix minutes

Onglet Séance, bouton « 10 minutes ». Pose le téléphone, écran allumé.
Réponds à voix haute à chaque fois qu'on te le demande.

**Attendu :** la séance enchaîne seule. Après chaque réponse : le
retour, ta voix, puis le modèle.

**Le point à vérifier absolument : entends-tu bien TA voix, et est-ce
bien la phrase que tu viens de dire ?**

---

## 5. Tester Pause et Suivant

Pendant la séance, appuie sur Pause, attends cinq secondes, reprends.
Puis appuie sur Suivant.

**Attendu :** Pause coupe le son immédiatement. Reprendre continue au
même endroit. Suivant passe à l'exercice d'après, sans répéter le
même.

---

## 6. Tester une interruption

Pendant la séance, quitte l'application par le bouton d'accueil.
Attends dix secondes. Reviens.

**Attendu :** la séance s'est mise en pause. Elle ne repart pas toute
seule.

---

## 7. Verrouiller l'écran

Pendant la séance, verrouille l'écran.

**Attendu, et c'est la limite connue :** la voix s'arrête. Déverrouille
et reprends.

**Note le comportement exact :** s'arrête tout de suite, après quelques
secondes, ou pas du tout.

---

## 8. Tester en Bluetooth

Connecte le téléphone à la voiture, moteur coupé. Relance une séance de
dix minutes.

**Attendu :** le son sort par les haut-parleurs. Quand l'application
t'écoute, le son passe en mono, plus sourd. C'est le fonctionnement du
Bluetooth, pas un défaut.

**Note :** la reconnaissance de ta voix marche-t-elle mieux ou moins
bien qu'avec le micro du téléphone ?

---

## 9. Tester hors ligne

Active le mode avion. Lance une séance de dix minutes.

**Attendu :** tout fonctionne. Écoute, répétition, écho, modèle. Le
bilan précise qu'aucune réponse n'a pu être vérifiée.

**Si l'application ne se lance pas hors ligne :** c'est un vrai
problème, note-le.

---

## 10. Vérifier la progression

Onglet Progrès.

**Attendu :** des chiffres qui correspondent à ce que tu viens de
faire. « Rencontrées » a augmenté. « Solides » reste à zéro : c'est
normal, une phrase n'est solide qu'après plusieurs jours.

Onglet Voix, bas de page : la liste de tes enregistrements. Appuie sur
« Écouter » sur l'un d'eux.

**Attendu :** tu entends bien cette tentative-là.

---

## Ce qu'il faut me renvoyer

Pour chaque étape : ✓ ou le problème exact.

Pour l'étape 2, la liste complète des lignes ✕ avec leur texte.

Pour l'étape 4, la réponse à une question : **est-ce que tu pourrais
faire ça en conduisant ?**
