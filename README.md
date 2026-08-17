# LULU Trajet · V6

Apprendre à parler luxembourgeois pendant les trajets.

Écoute une phrase. Réponds à voix haute. Entends ta voix. Entends le
modèle. Recommence.

---

## Avertissements, à lire avant d'utiliser

**Le contenu n'est pas vérifié.** Les 300 phrases viennent d'un corpus
existant et de recombinaisons de fragments attestés. Aucune n'est
validée par un locuteur. Chaque phrase indique son statut et donne un
lien direct vers `lod.lu`, le dictionnaire officiel.

**La prononciation n'est pas notée.** Aucun outil ne sait aujourd'hui
évaluer la prononciation du luxembourgeois son par son. L'application
le dit plutôt que d'afficher une note inventée.

**La voix du modèle n'est pas luxembourgeoise.** Aucun enregistrement
de locuteur n'est livré dans ce lot. C'est la voix du téléphone qui
parle, et l'application le signale à chaque fois.

**La reconnaissance des mots demande une autorisation** qui n'est pas
encore obtenue. Sans elle, l'application enseigne quand même : écoute,
répétition, écho, modèle. Elle ne prétend simplement pas vérifier ce
que tu dis.

**En navigateur, la voix s'arrête quand l'écran se verrouille.** Garde
l'écran allumé pendant la séance.

---

## Installer

### Sur un serveur

Envoie tous les fichiers à la racine d'un dépôt, en HTTPS. Le micro est
refusé sur toute adresse non sécurisée, c'est une règle du navigateur.

Copie `config.example.js` en `config.js` et renseigne les valeurs. Sans
ce fichier, l'application fonctionne en mode sans reconnaissance.
**`config.js` ne doit jamais être envoyé sur GitHub.**

### Sur iPhone

Ouvre l'adresse **dans Safari**. Bouton Partager, puis « Sur l'écran
d'accueil ». Lance depuis l'icône.

### Sur Android

Ouvre l'adresse dans Chrome. Menu, puis « Installer l'application ».

### Voix du système, une seule fois

**iPhone** : Réglages, Accessibilité, Contenu énoncé, Voix. Télécharge
une voix allemande et une voix française.

**Android** : Réglages, Système, Langues, Synthèse vocale. Installe
l'allemand et le français.

---

## Premier usage

1. Onglet Voix, **Lancer le diagnostic**, à l'arrêt. Chaque ligne dit
   oui ou non, et pourquoi.
2. Onglet Séance, **10 minutes**. Pose le téléphone, réponds à voix
   haute.
3. Onglet Progrès pour voir ce qui est réellement acquis.

Le protocole de test complet est dans `docs/TEST_IPHONE.md`.

---

## Ce que comptent les chiffres

Ils ne comptent pas des leçons terminées. Ils comptent des **preuves**.

| Dimension | Ce qu'elle veut dire |
|---|---|
| Exposition | tu l'as entendue |
| Compréhension | tu sais ce que ça veut dire |
| Rappel | tu retrouves la forme |
| Production | tu la dis |
| Fluidité | tu la dis vite |
| Prononciation | **non mesurée**, faute d'instrument |

Écouter une phrase ne fait monter aucune de ces dimensions.

Une phrase est **solide** quand elle a été retrouvée après un délai
réel : palier de sept jours atteint, au moins trois réussites, et au
moins vingt heures entre la première et la dernière. Une séance
parfaite ne rend aucune phrase solide le jour même.

---

## Développement

```
npm run contenu     régénère le contenu depuis le corpus
npm test            lance la suite complète
npm run verifier    contrôle une livraison extraite
node scripts/verifier-gardes.mjs
                    réintroduit les défauts un par un et exige
                    que la suite échoue
```

Aucune dépendance à installer. Modules ES natifs, tests par le
lanceur intégré de Node.

---

## Documentation

| Fichier | Contenu |
|---|---|
| `docs/V6_ARCHITECTURE.md` | couches, découpage, ce qui a été repris |
| `docs/V6_CONTENU.md` | comment les 300 phrases ont été obtenues |
| `docs/V6_VOIX.md` | reconnaissance, prononciation, voix du modèle |
| `docs/V6_MOBILE.md` | trajet, iPhone, session audio, Bluetooth |
| `docs/V6_CONFIDENTIALITE.md` | enregistrements, réseau, export, secrets |
| `docs/V6_DECISIONS.md` | chaque décision et ce qui a été écarté |
| `docs/TEST_IPHONE.md` | protocole de test en dix étapes |

---

## Après

Institut national des langues Luxembourg, `inll.lu`. Tu n'y arriveras
pas débutant total, mais avec une base orale. La différence est
considérable.
