# Contenu V6

## Ce qui est livré, en chiffres exacts

| | |
|---|---|
| phrases | **300** |
| dont reprises du corpus existant | 248 |
| dont dérivées par recombinaison | 52 |
| dialogues | 10 |
| paquets par situation | 26 |
| micro-modules | 8 |
| niveaux | 5 |
| exercices générés | **2 759** |
| types d'exercice | 13 |

Statut linguistique : **0 vérifiée, 0 en relecture, 300 à vérifier.**

## La règle qui a limité le volume

**Aucune phrase luxembourgeoise n'a été inventée.**

Deux opérations seulement ont été autorisées.

**1. Reprise.** Les 248 expressions distinctes du corpus existant sont
reprises telles quelles, avec leur identifiant. Un test vérifie
qu'aucune n'a été perdue en route.

**2. Recombinaison stricte.** Une phrase dérivée est la concaténation
d'un CADRE et d'un COMPLÉMENT dont les deux chaînes exactes
apparaissent déjà, mot pour mot, dans une expression attestée.

Les emplacements retenus sont ceux où aucun accord n'est à produire :

- après `ass`, le nom reste au nominatif ;
- après `ass` ou `si`, l'adjectif attribut est invariable ;
- après `bis`, le nom de jour ne change pas ;
- un adverbe placé après le verbe ne change rien ;
- l'inversion verbe-sujet ne modifie ni le verbe ni le pronom.

Tout emplacement demandant un accusatif, un datif, un pluriel ou un
accord d'article a été écarté.

Le script de construction ÉCHOUE si un fragment n'est pas attesté. Il a
effectivement refusé `d'Mamm` : le corpus atteste `Mamm` seul, jamais
avec son article. Deviner l'article aurait été inventer. La forme a été
retirée plutôt que devinée.

**C'est la raison pour laquelle il y a 300 phrases et pas 500.** Aller
plus loin aurait exigé de produire des formes que rien n'atteste.

## Le parcours ne commence plus par les chiffres

Le niveau 1 est composé de six paquets, dans cet ordre :

1. Saluer
2. Merci et s'il vous plaît
3. Quand tu ne comprends pas
4. Oui, non, peut-être
5. Comment ça va
6. Dire qui tu es

Un apprenant qui n'a fait que le niveau 1 peut saluer, remercier, se
présenter et dire qu'il n'a pas compris. C'est ce qui fait tenir une
conversation, pas la connaissance de `siwwenzeg`.

Les chiffres, l'alphabet et les sons deviennent des **micro-modules**
courts, ouverts au moment où un paquet en a besoin. Les quatre modules
de chiffres sont déclenchés par le paquet « Le prix et l'heure ».
L'alphabet est déclenché par « Au téléphone et au guichet », là où on
doit réellement épeler son nom.

## Vérification du contenu

Chaque phrase porte un statut : `unverified`, `reviewing`, `verified`.

Le code ne fait JAMAIS passer une phrase en `verified`. C'est un geste
humain, fait dans l'onglet Phrases, et la source est obligatoire. Une
demande de vérification sans source est refusée, et le refus est
affiché.

Les 300 phrases sont donc à confronter à `lod.lu`, le dictionnaire
officiel du Zenter fir d'Lëtzebuerger Sprooch. Chaque fiche a un lien
direct vers l'entrée correspondante.

## Exercices

Une phrase n'est pas un exercice. Chaque phrase produit huit à dix
exercices, chacun avec la dimension qu'il vise.

| Type | Dimension visée | Nombre |
|---|---|---|
| écoute | aucune | 300 |
| écoute lente | aucune | 300 |
| répétition | production | 300 |
| compréhension | compréhension | 300 |
| rappel | rappel | 300 |
| production | production | 300 |
| contrôle différé | rappel | 300 |
| fluidité | fluidité | 300 |
| discrimination | compréhension | 208 |
| variation | transfert | 93 |
| nombre | compréhension | 30 |
| tour de dialogue | transfert | 18 |
| écoute de dialogue | aucune | 10 |

Aucun type ne vise la prononciation. Un test d'architecture le vérifie.

Aucun type n'exige de regarder l'écran : tous se déroulent à l'oreille
et à la voix. C'est la condition du mode trajet.

## Régénérer le contenu

```
npm run contenu
```

Le script relit le corpus source, reconstruit les fichiers de contenu
et affiche les compteurs. Il refuse de produire quoi que ce soit si une
dérivation n'est pas attestée.
