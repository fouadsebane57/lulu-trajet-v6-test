# Test sur iPhone

**Version audio corrigée. Fais ces cinq étapes AVANT tout le reste.**

À faire à l'arrêt, moteur coupé. Compte dix minutes.

**Vide d'abord le cache de Safari**, ou ouvre une fenêtre privée
neuve : sinon le service worker sert l'ancienne version.

---

## Étape 1 · Le son de base

Onglet **Voix**, section **Test du son, isolé**, deuxième bouton :
**Tester uniquement la voix du modèle**.

**Renvoie-moi les huit lignes affichées.** La ligne décisive est
« Démarrage réel ».

- ✓ Démarrage réel → la synthèse fonctionne.
- ✕ Démarrage réel → rien n'est prononcé, et la cause est affichée.

---

## Étape 2 · Mon enregistrement, sans lecture

Même section, premier bouton : **Commencer l'enregistrement**.
Parle trois secondes.

**Renvoie-moi les six lignes.** Attendu : format `audio/mp4`, taille
supérieure à 10 000 octets, micro et contexte audio fermés.

Aucun son ne doit sortir à cette étape. C'est normal et voulu.

---

## Étape 3 · Lire mon enregistrement

Un bouton **Lire mon enregistrement** est apparu. Appuie dessus.

**C'est l'étape la plus importante du test.**

**Renvoie-moi les treize lignes.** Les trois qui comptent :

- **Lecture autorisée** : le navigateur a accepté de démarrer.
- **Lecture démarrée** : le son est réellement parti.
- **Lecture terminée** : il est allé au bout.

Et surtout : **as-tu entendu ta voix, oui ou non ?**

Si les trois lignes sont ✓ et que tu n'entends rien, le son sort
probablement par l'écouteur du haut de l'écran. Colle le téléphone à
ton oreille et recommence pour le confirmer. Cette information est
décisive.

---

## Étape 4 · Le premier son d'une séance

Onglet **Séance**, bouton **10 minutes**.

Deux issues, toutes deux utiles :

- tu entends « On commence, réponds à voix haute » → le déverrouillage
  fonctionne ;
- l'écran affiche **Son bloqué** avec un bouton **Réactiver le son** →
  le déverrouillage a échoué. Appuie sur le bouton et dis-moi si le
  son revient.

**La séance ne doit plus jamais défiler en silence.** Si elle le fait,
dis-le-moi immédiatement : le correctif serait incomplet.

---

## Étape 5 · Un tour complet

Laisse la séance aller jusqu'à une question. Réponds à voix haute.

Attendu, dans cet ordre : le retour, **ta voix**, puis **le modèle**.

Dis-moi lesquels de ces trois sons tu entends, et lesquels manquent.

---

# CE QU'IL FAUT ME RENVOYER

1. Les huit lignes de l'étape 1.
2. Les six lignes de l'étape 2.
3. Les treize lignes de l'étape 3, **et** si tu as entendu ta voix.
4. Ce qui se passe à l'étape 4 : son, ou écran « Son bloqué ».
5. Lesquels des trois sons de l'étape 5 tu entends.

Avec ça, je saurai exactement où le son s'arrête.

---

# NOTES

**Bluetooth.** Fais ce premier test sans Bluetooth, haut-parleur du
téléphone. Le Bluetooth ajoute une variable qu'on traitera après.

**Écran verrouillé.** Limite connue du navigateur : la synthèse
s'arrête. Garde l'écran allumé.

**Mode avion.** Une fois les cinq étapes faites, refais l'étape 4 en
mode avion. Tout doit fonctionner à l'identique : aucun son ne dépend
du réseau.
