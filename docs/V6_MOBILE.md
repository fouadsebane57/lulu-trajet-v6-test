# Mobile, trajet et iPhone

## L'usage visé

Conduire environ une heure. Poser le téléphone. Ne plus y toucher.
Écouter, répondre à voix haute, s'entendre, recommencer.

Cet usage a une conséquence directe : **aucun exercice ne peut exiger
de regarder l'écran.** Les treize types d'exercice se déroulent à
l'oreille et à la voix. Un test le vérifie.

## Ce que le navigateur ne sait pas faire

| Besoin | Navigateur | Application native |
|---|---|---|
| Jouer écran verrouillé | **non** | oui |
| Continuer en arrière-plan | **non** | oui |
| Choisir la catégorie de session audio | **non** | oui |
| Reprendre après un appel | partiel | oui |

Ce sont des limites du navigateur, pas de l'application. L'adaptateur
web les déclare telles quelles dans ses capacités, et le diagnostic les
affiche : « En navigateur, la synthèse s'arrête au verrouillage de
l'écran. »

**Conséquence pratique aujourd'hui : garde l'écran allumé pendant la
séance.** L'application demande le verrou d'écran quand le navigateur
le permet.

## Architecture native

Le cœur pédagogique ne sait pas sur quoi il tourne. Tout ce qui dépend
de la plateforme passe par un adaptateur au contrat unique :

```
  stockage    lire, ecrire, supprimer, lister
  audio       preparerSession, libererSession, gardeEveil
  capacites   ce que la plateforme sait réellement faire
```

Trois adaptateurs existent : web, natif Capacitor, mémoire pour les
tests. Le fichier `capacitor.config.json` est livré.

### Session audio iOS

L'adaptateur natif configure la session selon l'usage :

| Usage | Catégorie | Mode |
|---|---|---|
| lecture seule | `playback` | `spokenAudio` |
| lecture et micro | `playAndRecord` | `voiceChat` |

**Conséquence connue et inévitable du Bluetooth.** Tant que le micro
est actif, une liaison Bluetooth bascule en mains libres, donc en mono
de qualité réduite. Ce n'est pas un défaut de l'application, c'est le
fonctionnement du Bluetooth. Le diagnostic le signale quand il détecte
un micro en mode mains libres, et propose de débrancher le Bluetooth
pendant la répétition.

## État réel de la couche native

**L'adaptateur natif n'a jamais été exécuté sur un iPhone réel dans ce
lot.** Aucun test automatique ne peut le prouver.

Ses capacités sont donc déclarées comme « annoncées par la plateforme,
non vérifiées sur appareil », et le diagnostic affiche cette ligne avec
l'état « à vérifier », distinct de « oui » et de « non ».

C'est aussi la raison pour laquelle `docs/TEST_IPHONE.md` existe : la
vérification passe par un appareil réel, elle ne peut pas être
simulée.

## Ce qui fonctionne déjà en web

- séance complète, du lancement au bilan ;
- capture, réécoute de la tentative, modèle ;
- commandes du volant, via les contrôles de lecture du système ;
- reprise après interruption : appel, Siri, passage en arrière-plan ;
- fonctionnement hors ligne complet, service worker ;
- installation sur l'écran d'accueil.
