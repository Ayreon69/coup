# Coup

**Deux lettres scellées, et une cour de menteurs.**

👉 **Jouer : adresse à venir** (la première ouverture pourra prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu multijoueur en ligne de bluff et d'intrigues, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après *Coup*, de Rikki Tahta (La Mame Games, Indie Boards & Cards), paru en français sous le nom *Complots* chez Ferti (création de fans, non officielle, avec ses propres visuels).

## Règles en bref

- De 2 à 6 joueurs. Chacun reçoit deux personnages face cachée, ses deux influences, et 2 ducats. Le paquet compte 15 cartes : trois exemplaires de chacun des cinq personnages. Le reste forme la Cour.
- À son tour, on choisit une action. Revenu : +1. Aide étrangère : +2, bloquable par la Duchesse. Coup d'État : 7 ducats, la cible perd une influence, imparable, obligatoire à partir de 10 ducats.
- Ou l'on prétend être un personnage, qu'on l'ait ou non. **Duchesse** : Taxe, +3. **Assassin** : paie 3, la cible perd une influence, bloquable par la Comtesse. **Capitaine** : Vol de 2 ducats (1 si la cible n'en a qu'un), bloquable par le Capitaine ou l'Ambassadeur. **Ambassadeur** : Échange, pioche 2 cartes et en rend 2. **Comtesse** : bloque l'Assassinat.
- Seule la cible bloque un Assassinat ou un Vol ; n'importe qui bloque l'Aide étrangère.
- Toute prétention, blocage compris, peut être contestée par n'importe qui. S'il avait la carte, le joueur contesté la montre, la remet dans la Cour, en pioche une autre, et le contestataire perd une influence. Sinon, c'est lui qui en perd une et son action tombe : les 3 ducats d'un Assassinat démasqué sont rendus. Ceux d'un Assassinat bloqué restent dépensés.
- Qui perd une influence choisit la carte qu'il retourne. Sans carte cachée, il est exilé et ses ducats retournent au Trésor. Le dernier joueur avec de l'influence gagne.
- À deux joueurs, celui qui commence n'a qu'un ducat. Le vainqueur d'une partie commence la suivante.

Ces règles viennent du livret de *Coup* et de sa traduction française, *Complots*, à laquelle ce jeu emprunte les noms : la Duchesse y remplace le Duc de l'édition anglaise, la pioche s'appelle la Cour et la banque le Trésor. On garde le nom anglais du jeu et de son action à 7 ducats, le Coup d'État, que *Complots* appelle « Assassinat » au risque de la confondre avec le pouvoir de l'Assassin.

Sont des choix de ce jeu :
- **Le premier qui réagit l'emporte.** Le livret le dit des contestations ; on l'étend aux blocages. Après une prétention, chaque joueur concerné peut contester, bloquer ou laisser passer. La fenêtre se ferme dès que quelqu'un conteste ou bloque, ou dès que tout le monde a laissé passer, et au plus tard au bout d'un délai réglable par l'hôte : le silence laisse passer.
- **Un blocage met fin aux contestations de l'action.** Si la cible bloque d'emblée, elle accepte la prétention de l'acteur ; on ne peut plus contester que son blocage. Si quelqu'un conteste l'action et perd, la cible garde le droit de bloquer.
- **Le joueur contesté qui a la carte la montre d'office.** Le livret lui permet de refuser, ce qui ne lui rapporterait rien.
- **On ne vole pas un joueur sans le sou.**
- **À deux joueurs, on distribue les cartes comme à plusieurs.** La variante du livret, où chacun choisit une carte parmi les cinq personnages, n'est pas reprise.
- Les ducats du Trésor sont illimités ; la boîte en compte 50, une limite qu'aucune partie n'atteint.
- Un joueur présent qui laisse filer son temps de réflexion est remplacé par le pilote automatique, qui ne bluffe jamais à sa place.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Bots aux personnalités variées (menteurs, méfiants, agressifs, distraits), qui bluffent, contestent et bloquent avec des délais humains, sans jamais voir une carte cachée : ils ne connaissent que leur main, les cartes retournées et ce qu'ils ont entendu. Partie d'entraînement en un clic, à quatre ou en duel
- Aucune aide au calcul ni à la mémoire : ni historique, ni journal, ni probabilités. Seuls l'action en cours et son dénouement s'affichent ; qui a prétendu quoi, c'est à chacun de s'en souvenir. Le serveur n'envoie que le tour en cours
- Fenêtres de réaction claires : « Contester », « Bloquer en tant que … », « Laisser passer », avec la jauge du temps qui reste ; on voit qui hésite et qui laisse passer
- Visuels originaux : portraits de profil des cinq personnages à la manière des médailles de la Renaissance, sceaux de cire, ducats et blasons, tous dessinés en SVG
- Reprise automatique après une coupure, pilote automatique si un joueur s'absente, spectateurs
- Temps de réflexion et temps de réaction réglables par l'hôte
- Réactions et petites phrases, distinctions de fin de partie
- Sons synthétisés et vibrations, animations brèves qui respectent `prefers-reduced-motion`

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3080
npm run dev:client   # interface sur http://localhost:5180
npm test             # règles, contestations, bots, secrets et parties simulées
npm run typecheck
npm run build && npm run e2e   # partie complète avec de vrais clients connectés
```

`CP_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur (`protocol.ts`), personnages, actions et la règle qui dit si une action est permise (`actionError`), la même des deux côtés
- `server/` : Express + Socket.IO, moteur de table (`room.ts`), bots (`bots.ts`). Le serveur fait autorité : une carte cachée ne sort que vers son propriétaire, la Cour jamais, et chaque carte reçoit un numéro neuf en entrant dans une main pour qu'on ne puisse pas la suivre. Les bots reçoivent une vue construite à part, sans aucune carte cachée des autres
- `client/` : React + Vite + Framer Motion. Portraits, sceaux, ducats et blasons dans `components/Art.tsx`, la table dans `screens/Table.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
