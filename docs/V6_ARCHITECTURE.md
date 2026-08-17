# Architecture V6

## Le principe qui gouverne tout le reste

Chaque couche ne connaît que celle du dessous. Aucune ne remonte.

```
  contenu        phrases, dialogues, exercices          aucune dépendance
     ↑
  noyau          preuves, ordonnanceur, séance, état    ne connaît pas l'écran
     ↑
  fournisseurs   reconnaissance, voix du modèle         interchangeables
     ↑
  plateforme     web, natif, mémoire                    contrat unique
     ↑
  interface      app.js, diagnostic                     ne décide de rien
```

Trois tests d'architecture vérifient cette séparation en lisant le
code source, pas en observant un comportement. Un test de comportement
se contourne en ajoutant un chemin parallèle ; un test d'architecture
ferme le chemin.

## Découpage des fichiers

### Contenu — `src/content/`

| Fichier | Rôle |
|---|---|
| `phrases-a.js`, `phrases-b.js` | les 300 phrases, générées, jamais éditées à la main |
| `dialogues.js` | les 10 conversations |
| `parcours.js` | 5 niveaux, 26 paquets, 8 micro-modules |
| `index.js` | seul point de lecture du contenu, index par identifiant |
| `exercices.js` | taxonomie des 13 types, génération du catalogue |
| `version.js` | empreinte du contenu livré |

Le contenu est importé statiquement. Aucun `window.CONTENU`, aucune
dépendance à l'ordre des balises script : c'est ce qui permet aux
tests de charger le contenu réel sans navigateur.

### Noyau — `src/core/`

| Fichier | Rôle |
|---|---|
| `preuve.js` | six dimensions, ce qui a le droit d'écrire, paliers |
| `scheduler.js` | quand une phrase revient, et pour quel exercice |
| `session.js` | flux temporel d'une séance, dosage des nouveautés |
| `file.js` | file par candidatures, espacement sans suppression |
| `state.js` | état, migration, export, vérification du contenu |
| `profil.js` | ce qui résiste à CET apprenant |
| `rng.js` | source unique de hasard, déterministe |
| `restitution.js` | ordre retour → ta voix → modèle |

### Audio — `src/audio/`

`machine.js` tient une machine à états stricte. `mic.js` gère
l'ouverture et la fermeture du flux, avec le correctif du contexte
audio endormi sur iPhone. `vad.js` détecte la parole avec des bornes
physiques. `recorder.js` capture. `lecture.js` distingue six issues de
lecture, dont aucune n'est confondue avec un succès. `tentative.js`
identifie chaque enregistrement. `voix-modele.js` choisit la meilleure
voix disponible, phrase par phrase.

### Reconnaissance — `src/speech/`

`provider.js` fixe le contrat. `engine.js` orchestre et tranche entre
les trois natures d'échec. `prononciation.js` déclare une
indisponibilité, explicitement et de façon testable.

## Ce qui a été repris du GATE 2.5

La couche audio bas niveau est conservée telle quelle : elle était
correcte et couverte par des tests. Sont repris sans modification :
`machine.js`, `mic.js`, `vad.js`, `recorder.js`, `formats.js`,
`lecture.js`, `rythme.js`, `rng.js`, `file.js`, `restitution.js`,
`normalize.js`, `score.js`, `erreurs.js`.

Refaire ce qui fonctionne aurait coûté du temps et introduit des
régressions.

## Ce qui a été réécrit, et pourquoi

| Module | Raison |
|---|---|
| contenu | le parcours commençait par les chiffres |
| `exercices.js` | une phrase n'était pas distinguée d'un exercice |
| `scheduler.js` | il dupliquait le modèle de progression |
| `session.js` | la file portait des expressions, pas des exercices |
| `preuve.js` | paliers en jours depuis minuit, pas de reprise courte |
| `engine.js` | panne et erreur d'apprenant étaient confondues |
| `tentative.js` | une variable unique pour tous les enregistrements |
| `state.js` | accès direct au stockage du navigateur |

## Identifiants

Une phrase porte un identifiant permanent. Un exercice s'identifie par
`ex:<idPhrase>:<type>[:variante]`. Aucun identifiant ne dépend d'une
position dans un tableau : ajouter un type d'exercice n'invalide donc
aucune progression existante.

## Hasard

`Math.random` est interdit partout sauf dans `rng.js`, et un test
d'architecture le vérifie. Une séance construite avec une graine donnée
est reproductible à l'identique, ce qui permet de rejouer un bug.
