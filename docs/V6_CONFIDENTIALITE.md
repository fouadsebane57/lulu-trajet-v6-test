# Confidentialité

## Enregistrements de la voix

**Par défaut, rien n'est conservé.**

Une tentative vit en mémoire le temps de la séance, puis disparaît à la
fermeture de l'application. Rien n'est écrit sur le disque.

La conservation durable exige un consentement explicite, donné dans
l'onglet Voix, et révocable à tout moment. Le retirer efface
immédiatement tout ce qui avait été conservé.

Une tentative de conservation sans consentement est **refusée**, avec
sa raison. Ce n'est pas un silence, c'est un refus, et un test le
vérifie. La mutation qui retire ce contrôle fait échouer la suite.

L'inventaire est visible dans l'application : combien de tentatives, de
quelle taille, lesquelles sont épinglées, et un bouton pour tout
effacer.

## Ce qui part sur le réseau, et quand

| Situation | Ce qui sort |
|---|---|
| Mode sans reconnaissance | **rien** |
| Hors ligne | **rien** |
| Reconnaissance active | l'audio de la tentative, et lui seul |

Quand la reconnaissance est active, l'audio est envoyé au relais
serveur, qui le transmet à LuxASR. LuxASR est hébergé à l'Université du
Luxembourg. Aucun autre service n'est appelé.

L'audio n'est ni journalisé ni conservé par le relais. Seuls sont
tracés la durée de traitement et le code de retour.

Le diagnostic affiche l'état de la reconnaissance, y compris le fait
qu'elle nécessite un réseau.

## Export

L'export de progression contient : preuves, profil, réglages,
vérifications de contenu.

Il ne contient **aucun enregistrement audio**. Un test le vérifie.

## Ce qui reste sur l'appareil

Tout, sauf l'audio envoyé à la reconnaissance quand elle est active. La
progression, le profil vocal, les réglages et les vérifications vivent
dans le stockage local et ne sont jamais transmis.

## Secrets

Aucune clé n'est présente dans le code livré. La configuration passe
par `config.js`, qui n'est **jamais** inclus dans le ZIP ni envoyé sur
GitHub. Un modèle `config.example.js` est fourni.

Le vérificateur de livraison échoue si un secret est trouvé, et si
`config.js` est présent dans l'archive.

Les identifiants d'accès à LuxASR restent dans les variables
d'environnement de la fonction serveur. Ils n'atteignent jamais le
navigateur.

## Suppression

L'onglet Voix permet d'effacer tous les enregistrements, immédiatement
et définitivement. L'écran de remise à zéro efface la progression, le
profil et les enregistrements ensemble.
