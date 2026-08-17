# Voix, reconnaissance et prononciation

## Ce que cette version sait faire, et ce qu'elle ne sait pas faire

| | État |
|---|---|
| Faire entendre un modèle | oui, par la voix du téléphone |
| Faire entendre un modèle **luxembourgeois** | non dans ce lot |
| Enregistrer la voix de l'apprenant | oui |
| Rejouer exactement cette tentative | oui |
| Vérifier les mots prononcés | seulement si LuxASR est autorisé |
| Noter la prononciation son par son | **non, et aucun outil ne le sait** |

## La prononciation n'est pas notée

Aucun fournisseur grand public n'évalue la prononciation du
luxembourgeois au niveau du phonème. Cela a été vérifié fournisseur par
fournisseur pendant la préparation de cette version.

Les briques ouvertes existent — alignement forcé, conversion graphème
vers phonème — mais aucune n'est calibrée sur de la parole d'apprenant
francophone. Les assembler sans étalonnage produirait un chiffre, pas
une mesure.

L'application affiche donc, en toutes lettres :

> Analyse phonétique détaillée non disponible.

Trois garde-fous rendent cette absence impossible à contourner :

1. la dimension `prononciation` est déclarée non mesurable, et toute
   tentative d'écriture est refusée avec sa raison ;
2. aucun type d'exercice ne vise cette dimension ;
3. le module d'évaluation refuse tout fournisseur qui ne déclare pas le
   luxembourgeois comme langue.

Un score absent vaut `null`, jamais `0`. L'absence de mesure n'est pas
une mauvaise note.

### Ce qui EST mesuré, et qui n'est pas de la prononciation

L'analyse locale du rythme mesure la durée de parole et le nombre de
groupes d'énergie. « fënnef » et « bébé » donnent le même résultat.
C'est une information sur la TENTATIVE, pas sur les sons. Elle est
rangée dans les signaux, jamais dans les dimensions, et n'est affichée
que lorsqu'aucune transcription n'est disponible.

## Trois natures d'échec

C'est la règle fondatrice de la version.

**Erreur de l'apprenant.** Un moteur qui connaît réellement le
luxembourgeois a transcrit autre chose que la forme attendue. C'est la
seule situation où une progression peut baisser.

**Incertitude du moteur.** Le moteur n'a pas su, ou n'était pas
qualifié, ou le signal était trop faible. Aucune écriture, ni dans un
sens ni dans l'autre. L'application le dit : « Je n'ai pas pu vérifier
tes mots. Ta progression n'est pas touchée. »

**Panne technique.** Micro refusé, réseau coupé, format rejeté, service
en erreur. Aucune écriture, et la panne n'est jamais formulée comme une
faute de l'apprenant.

Le défaut corrigé est précis : un service indisponible et une mauvaise
réponse aboutissaient tous deux à « on réessaie », et une transcription
réussie par un moteur allemand pouvait faire monter une dimension.

## Le champ décisif : `probant`

Chaque fournisseur de reconnaissance déclare s'il est PROBANT, c'est-à-
dire si sa transcription a le droit d'écrire une preuve pédagogique.

| Fournisseur | Probant | Pourquoi |
|---|---|---|
| LuxASR | oui | seul moteur spécialisé en luxembourgeois |
| Reconnaissance du navigateur | **non** | transcrit en allemand |
| Sans reconnaissance | non | ne transcrit rien |

Un moteur non probant peut encourager. Il ne peut jamais sanctionner.
Deux barrières indépendantes le garantissent dans le code, et la
mutation qui retire les deux fait échouer la suite de tests.

## LuxASR

LuxASR est développé à l'Université du Luxembourg. C'est le fournisseur
de référence de cette application.

**Trois faits à connaître.**

1. **L'accès n'est pas libre.** L'intégration dans une autre
   application demande une autorisation préalable. Elle n'est pas
   obtenue. Le fournisseur est donc déclaré indisponible et affiche
   cette cause exacte. Il ne prétend jamais fonctionner.

2. **L'API est une file d'attente**, pas un appel unique. Un relais
   serveur absorbe cette mécanique, pour que le client n'ait qu'un
   appel à faire et qu'aucun identifiant d'accès n'atteigne le
   navigateur.

3. **Les taux d'erreur publiés portent sur de la parole NATIVE.**
   Aucune mesure publique n'existe sur la parole d'un apprenant
   francophone. La qualité réelle pour cet usage est **inconnue** tant
   qu'elle n'a pas été mesurée sur l'appareil. Le fournisseur porte
   cette réserve, et elle est affichée avec le verdict.

Le code du fournisseur et le relais serveur sont écrits, testés pour ce
qui peut l'être sans accès, et prêts. Le jour où l'autorisation est
obtenue, deux choses changent : le secret est ajouté aux variables de
la fonction, et `autorise` renvoie `true`.

## Le mode sans reconnaissance

Ce n'est pas un mode dégradé, c'est un mode à part entière.

Sans réseau, sans compte et sans autorisation d'API, la séance
continue : écoute, écoute lente, répétition, écho de la tentative,
modèle. L'apprenant s'entend, puis entend la forme cible. C'est le
fonctionnement des méthodes orales éprouvées.

Ce qui change : aucune dimension ne monte, et l'application le dit. Le
bilan de séance annonce alors « Aucune réponse n'a pu être vérifiée par
un moteur. Ta progression n'a pas bougé pour autant. »

Un test de parcours complet vérifie qu'une séance de dix minutes sans
aucun moteur joue bien tous ses exercices et laisse des tentatives
réécoutables.

## Voix du modèle

Quatre niveaux de qualité, choisis phrase par phrase :

1. enregistrement d'un locuteur luxembourgeois ;
2. synthèse luxembourgeoise embarquée ;
3. voix `lb-LU` du téléphone, si elle existe ;
4. voix allemande, **annoncée comme approximative**.

**Aucun fichier audio natif n'est livré dans ce lot.** Des
enregistrements de locuteurs luxembourgeois existent en accès ouvert,
mais leur redistribution à l'intérieur d'une application demande une
vérification de licence qui n'est pas faite. Livrer ces fichiers sans
cette vérification créerait une dépendance juridique.

Conséquence assumée et affichée : cette version parle avec la voix du
système, et le dit chaque fois qu'elle n'est pas luxembourgeoise.

Le champ `audio` de chaque phrase est prêt à recevoir un fichier. Dès
qu'il est présent, la couche de lecture le préfère automatiquement,
sans qu'aucun autre module ne change. La bascule peut se faire phrase
par phrase.
