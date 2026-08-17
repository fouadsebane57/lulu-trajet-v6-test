# Décisions de la V6

Chaque décision indique ce qui a été écarté et pourquoi.

---

## 1. Ne pas inventer de luxembourgeois

**Écarté :** générer 500 phrases par analogie grammaticale.

Produire des phrases par analogie aurait donné le volume demandé, au
prix d'un risque : des formes fausses, apprises par cœur, puis dites à
un collègue luxembourgeois. Une phrase fausse apprise coûte plus cher
qu'une phrase manquante.

**Retenu :** 248 expressions reprises, 52 dérivées par recombinaison de
fragments attestés mot pour mot, dans des emplacements sans accord à
produire. Total : 300.

**Conséquence assumée :** 300 phrases et non 500.

---

## 2. Une écoute ne prouve rien

**Écarté :** faire monter une progression quand une phrase a été
entendue.

C'est ce qui produit l'illusion de progresser. Un compteur qui monte
parce qu'on a écouté ne dit rien de ce qu'on sait dire.

**Retenu :** six dimensions distinctes. L'exposition est comptée dans
les signaux, jamais dans les dimensions. Seule une transcription peut
écrire une preuve.

---

## 3. La prononciation n'est pas notée

**Écarté :** assembler un score à partir des briques ouvertes
disponibles.

Aucune n'est calibrée sur de la parole d'apprenant francophone. Le
résultat aurait été un chiffre, pas une mesure. Un apprenant qui voit
72 % croit à une mesure.

**Retenu :** dire « Analyse phonétique détaillée non disponible », et
rendre l'indisponibilité impossible à contourner par trois garde-fous
testés.

---

## 4. Trois natures d'échec, jamais confondues

**Écarté :** traiter toute réponse non reconnue comme une erreur.

Un service indisponible et une mauvaise réponse aboutissaient tous deux
à « on réessaie ». L'apprenant croyait avoir mal parlé alors que le
réseau était coupé.

**Retenu :** erreur de l'apprenant, incertitude du moteur, panne
technique. Seule la première peut faire baisser une progression, et
seulement si le moteur connaît le luxembourgeois.

---

## 5. Un moteur allemand ne juge pas du luxembourgeois

**Écarté :** utiliser la reconnaissance du navigateur comme si elle
faisait autorité.

**Retenu :** le champ `probant`. Un moteur non probant peut encourager,
jamais sanctionner. Deux barrières indépendantes dans le code, et une
mutation qui retire les deux fait échouer la suite.

---

## 6. Les paliers commencent à dix minutes

**Écarté :** conserver des intervalles en jours, calculés depuis
minuit.

Une phrase vue à neuf heures ne pouvait pas revenir avant le lendemain.
C'est précisément la reprise quelques minutes plus tard qui fait tenir
une phrase.

**Retenu :** 10 minutes, 1 jour, 3, 7, 14, 30, 60 jours, en temps
absolu.

---

## 7. Réussir en avance ne repousse pas l'échéance

**Écarté :** faire monter le palier à chaque réussite.

Défaut découvert pendant les tests de parcours : cinq reprises réussies
dans la même séance envoyaient la phrase au palier de soixante jours.
Elle ne revenait plus jamais, sans avoir jamais été retrouvée après le
moindre oubli.

**Retenu :** un palier ne monte que si la reprise a lieu à son échéance
ou après. La réussite anticipée est enregistrée, elle nourrit la
facilité et le profil, elle ne repousse rien. Un échec, lui, compte
toujours.

---

## 8. La solidité exige un délai réel

**Écarté :** déclarer une phrase solide sur son seul palier.

Deux réussites à une minute d'intervalle ne prouvent rien de la mémoire
à long terme.

**Retenu :** palier atteint, au moins trois réussites, et au moins
vingt heures entre la première et la dernière. Une séance parfaite ne
rend aucune phrase solide le jour même, et un test de parcours le
vérifie.

---

## 9. La réserve de fin de séance

**Écarté :** clore la séance quand la file est vide.

Défaut découvert pendant les tests de parcours : une toute première
séance s'arrêtait au bout de quatre minutes. Cinq phrases découvertes,
quinze exercices, plus rien.

**Retenu :** une réserve composée des phrases déjà connues ET des
phrases ouvertes pendant cette séance. Au moment où elle est consommée,
chacune a été entendue, dite lentement et répétée. C'est la reprise à
dix minutes, celle pour laquelle le premier palier existe.

---

## 10. Le dialogue ne coupe pas une découverte

**Écarté :** insérer le dialogue au milieu de la séance sans regarder
où l'on tombe.

Défaut découvert pendant les tests : l'insertion pouvait tomber entre
l'écoute et la répétition d'une phrase neuve. L'apprenant devait
répéter une phrase entendue cinq minutes plus tôt.

**Retenu :** l'insertion avance jusqu'à sortir de toute séquence
soudée.

---

## 11. Chaque enregistrement est identifié

**Écarté :** une variable « dernier enregistrement ».

Si la capture suivante démarrait avant la relecture, l'écho rejouait la
mauvaise tentative. Un enregistrement vide écrasait silencieusement un
enregistrement valide.

**Retenu :** un registre par identifiant. L'écho ne reçoit plus « le
dernier », mais « celui de CETTE tentative ». Le blob d'un identifiant
inconnu vaut `null`, jamais un blob approchant.

---

## 12. Le parcours commence par parler

**Écarté :** commencer par les chiffres, l'alphabet et les sons.

Un apprenant qui a fait dix leçons de chiffres ne sait toujours pas
saluer.

**Retenu :** niveau 1 entièrement composé de situations de parole. Les
chiffres et l'alphabet deviennent des micro-modules, ouverts au moment
où un paquet en a besoin.

---

## 13. Les tests d'architecture

**Écarté :** se contenter de tests de comportement.

Trois régressions passées sont revenues par la même porte : quelqu'un a
ajouté un appel direct là où une couche existait déjà. Un test de
comportement se contourne en ajoutant un chemin parallèle.

**Retenu :** seize tests qui lisent le code source. Interdiction de
`Math.random` hors de `rng.js`, porte d'écriture unique des preuves,
aucun accès direct au stockage hors de la couche plateforme, aucun
message d'erreur générique.

---

## 14. Prouver que les gardes savent échouer

**Écarté :** affirmer qu'un test couvre un défaut.

Un test qui passe ne prouve rien tant qu'on n'a pas vérifié qu'il sait
échouer.

**Retenu :** `scripts/verifier-gardes.mjs` réintroduit treize défauts,
un par un, relance la suite et exige qu'elle tombe. Ce script a
effectivement révélé que quatre gardes étaient insuffisantes ; elles
ont été renforcées.
