# Correctif audio P0

Constaté sur iPhone réel, Safari privé, GitHub Pages.

Ce qui marchait : HTTPS, permission, micro détecté, son reçu à
environ -12 dB, MediaRecorder en `audio/mp4; codecs=mp4a.40.2`,
blob de 15 à 17 ko, tentative et identifiant présents, micro refermé.

**Ce qui ne marchait pas : rien n'était audible, et la séance avançait
quand même.** Ni la voix de l'apprenant, ni le modèle, y compris après
un appui manuel sur « Écouter ».

---

## Les cinq causes

### 1. La synthèse déclarait un succès sans preuve

`src/audio/tts.js`, fonction `dire()`.

La promesse se résolvait de la même façon dans quatre situations :
`onend`, `onerror`, exception de `speak()`, et surveillance.

Pire, la surveillance interrogeait `speechSynthesis.speaking` toutes
les 250 ms en supposant qu'un énoncé démarre immédiatement. Sur iOS,
quand l'activation utilisateur a été perdue, `speak()` ne démarre
jamais : `speaking` reste faux, la surveillance conclut « terminé » au
bout de 250 ms, et l'application enchaîne.

**C'est la cause directe du défilement en silence.**

### 2. La voix du modèle retournait « joué » sans savoir

`src/audio/voix-modele.js`, `creerSynthese().dire()`.

Elle faisait `await tts.dire(...)` puis retournait `joue: true`. Un
moteur muet était donc rapporté comme ayant parlé.

### 3. L'activation utilisateur était perdue avant le premier son

`src/app.js`, chaîne du clic sur « 10 minutes ».

L'ordre était : clic, puis `Micro.reveiller()` avec jusqu'à 1500 ms
d'attente, puis `Voix.preparer()` avec jusqu'à 800 ms, puis la session
de plateforme, puis le verrou d'écran, **puis** le premier énoncé.

Sur iOS, l'autorisation de produire du son n'existe que dans la pile
d'appels issue du toucher. Après ces `await`, elle n'existe plus.

### 4. La session audio restait en mode enregistrement

`src/audio/mic.js`.

L'AudioContext était créé une fois et **jamais fermé**. Arrêter les
pistes du flux ne suffit pas.

Apple documente le comportement : après un appel à `getUserMedia`, la
lecture d'un élément audio part dans l'écouteur interne, et aucune
sélection de sortie n'est exposée sur iOS
(`developer.apple.com/forums/thread/657321`).

Côté WebKit, le projet `webrtc/samples` a établi que seule la
fermeture de l'AudioContext rend les ressources audio du système
(`github.com/webrtc/samples/issues/1514`, WebKit `bugs.webkit.org/236350`).

**C'est la cause la plus probable du « j'appuie sur Écouter et je
n'entends rien » : le son sortait par l'écouteur, pas par le
haut-parleur.**

### 5. Quatre propriétaires du son, aucun arbitrage

`src/app.js`, gestionnaire `data-ecouter` ; `src/ui/diagnostic.js` ;
la machine de séance ; la voix du modèle.

Le bouton « Écouter » appelait la lecture directement, hors machine,
pendant que la boucle de séance continuait. Changer d'onglet
n'arrêtait rien. Deux lectures pouvaient partir en même temps.

---

## Les corrections

### Un coordinateur audio, propriétaire unique

`src/audio/coordinateur.js`, nouveau.

- **Un seul élément audio**, créé au premier geste et conservé. Plus
  de `new Audio()` par lecture : un élément neuf n'est pas déverrouillé
  sur iOS. Un test d'architecture interdit désormais toute création
  d'élément audio ailleurs.
- **Un verrou d'exclusivité.** Séance, écoute manuelle et diagnostic
  demandent le son. Un refus est explicite et journalisé.
- **Un déverrouillage synchrone**, appelé dans le geste, sans aucun
  `await` avant : lecture d'un WAV silencieux sur l'élément persistant,
  et énoncé vide à volume nul pour la synthèse.
- **Réutilisation propre** : pause, affectation de la nouvelle URL,
  `load()`, `play()`, attente de `playing`, attente de `ended`, puis
  révocation de l'ancienne ObjectURL.
- **Dix événements observés** : `loadedmetadata`, `loadeddata`,
  `canplay`, `playing`, `pause`, `ended`, `error`, `abort`, `stalled`,
  `waiting`. Trois seulement décident ; les autres servent à savoir ce
  que Safari fait réellement.

### La synthèse ne ment plus

`dire()` renvoie un objet :

```
{ demande, demarree, terminee, erreur, cause, dureeMs, voix }
```

`demarree` vient **exclusivement** de `onstart`. Aucune heuristique,
aucune estimation de durée ne peut le mettre à vrai. La surveillance
de fin ne démarre qu'après le démarrage réel. Sans `onstart` dans un
délai de 1,6 s, le résultat est un échec avec sa cause.

### Autorisé n'est pas entendu

Le résultat de lecture distingue :

| Champ | Signification |
|---|---|
| `autorise` | la promesse de `play()` a été tenue |
| `demarree` | l'événement `playing` a été reçu |
| `terminee` | l'événement `ended` a été reçu |

Une promesse tenue sans `playing` n'est pas un succès. Un test le
verrouille.

### Le contexte audio est rendu au système

`Micro.fermerContexte()` et `Micro.rendreAudioAuSysteme()`, appelés
après **chaque** capture et avant **chaque** écho.

### On n'avance plus sans son

`src/core/restitution.js` distingue segments facultatifs et
obligatoires.

| Segment | Obligatoire | Raison |
|---|---|---|
| retour | non | l'information est déjà à l'écran |
| écho | **oui** | sans lui, l'apprenant ne s'entend pas |
| modèle | **oui** | sans lui, la forme cible n'est pas entendue |

Un segment obligatoire muet produit `blocageAudio` avec le segment
fautif et sa cause. `src/app.js` renvoie alors `ISSUE.AUDIO_BLOQUE`,
et **`terminerExercice` n'est pas appelé**. L'index ne bouge pas,
l'historique ne bouge pas, l'estimation de durée ne bouge pas.

### Pas de boucle infinie

L'écran affiche « Son bloqué », nomme le segment, et propose un bouton
**Réactiver le son**. Ce bouton refait le déverrouillage dans le
geste, puis la séance reprend au même exercice.

### Un seul propriétaire à la fois

- Changer d'onglet pendant une séance la met en pause.
- « Écouter » et « Écouter la phrase » refusent de jouer si une séance
  tourne, et prennent le verrou sinon.
- Ces lectures amorcent `play()` sans `await` préalable.

---

## Les deux tests P0 isolés

`src/audio/test-p0.js`, onglet Voix.

Ce module **n'importe** ni la session, ni l'état, ni l'ordonnanceur, ni
un moteur de reconnaissance, ni le contenu. La contrainte est
structurelle, pas déclarative, et un test d'architecture le vérifie.

### 1. Mon enregistrement, en deux appuis

Premier appui : enregistrer trois secondes, fermer le micro **et** le
contexte audio, afficher identifiant, format, taille, durée. **Aucune
lecture automatique.**

Second appui : lire. L'appel à `play()` part directement du clic.

Le rapport affiche : blob présent, déverrouillage, `play()` appelée,
lecture autorisée, lecture démarrée, lecture terminée, durée du média,
durée réelle, `readyState`, `networkState`, code d'erreur, volume,
muet, et la liste des événements observés.

### 2. La voix du modèle seule

Un appui, une phrase courte. Le rapport affiche le fournisseur, la
voix, la locale, `speak()` appelée, `onstart`, `onend`, `onerror`, la
cause et la durée réelle.

**Sans `onstart`, le résultat est un échec.**

---

## Ce qui reste impossible à prouver sans l'appareil

Aucune API web ne dit qu'un son a été **entendu**. Le code peut
seulement affirmer qu'il a été autorisé, qu'il a démarré, et qu'il est
allé à son terme.

Trois points ne peuvent être tranchés que sur l'iPhone :

1. le routage réel de la sortie, écouteur ou haut-parleur, après la
   fermeture du contexte audio ;
2. le comportement exact de la synthèse en navigation privée ;
3. le maintien de l'autorisation entre le déverrouillage et le
   premier énoncé.

C'est précisément ce que les deux tests isolés permettront de savoir,
étape par étape, au lieu de conclure « c'est Safari ».
