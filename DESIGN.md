---
name: Mon Budget
description: Suivi de budget et d'épargne, 100 % local.
colors:
  lin-metis: "#ECE7DD"
  toile: "#FBF9F5"
  lin-clair: "#F3EFE8"
  fil: "#DDD5C8"
  encre: "#2B2723"
  encre-douce: "#6B635A"
  indigo: "#2F4A7A"
  indigo-moyen: "#4A6596"
  indigo-voile: "#E4E8F0"
  indigo-fil: "#A9B7D0"
  indigo-pale: "#8FA1C2"
  lin-fonce: "#E3DCCF"
  lin-autres: "#B3AA9C"
  garance: "#A33A2C"
  garance-voile: "#F3E1DC"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 1.9rem + 1.8vw, 3.2rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif"
    fontSize: "clamp(1.4rem, 1.1rem + 1vw, 1.9rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  figure:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    fontFeature: "tnum"
  small:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
rounded:
  mark: "2px"
  control: "8px"
  card: "10px"
spacing:
  hair: "4px"
  tight: "8px"
  row: "10px"
  block: "16px"
  gutter: "20px"
  card: "24px"
  page-end: "56px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "#FFFFFF"
    typography: "{typography.figure}"
    rounded: "{rounded.control}"
    padding: "11px 22px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "#263E68"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.encre}"
    rounded: "{rounded.control}"
    padding: "11px 22px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.lin-clair}"
  button-small:
    rounded: "{rounded.control}"
    padding: "6px 14px"
    height: "34px"
  button-danger:
    backgroundColor: "{colors.garance}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: "11px 22px"
  input:
    backgroundColor: "{colors.toile}"
    textColor: "{colors.encre}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
    height: "40px"
  segmented:
    backgroundColor: "{colors.lin-clair}"
    rounded: "{rounded.control}"
    padding: "3px"
  segmented-active:
    backgroundColor: "{colors.toile}"
    textColor: "{colors.encre}"
    padding: "6px 14px"
  chip-filter:
    backgroundColor: "{colors.indigo-voile}"
    textColor: "{colors.indigo}"
    typography: "{typography.small}"
    rounded: "{rounded.control}"
    padding: "5px 10px 5px 12px"
  card:
    backgroundColor: "{colors.toile}"
    rounded: "{rounded.card}"
    padding: "22px 24px 24px"
  nav-tab:
    textColor: "{colors.encre-douce}"
    height: "56px"
  nav-tab-active:
    textColor: "{colors.encre}"
  link-action:
    textColor: "{colors.indigo}"
    typography: "{typography.figure}"
---

# Design System: Mon Budget

## Overview

**Creative North Star: "Le linge de maison"**

Le budget se range comme du linge de famille : un lin naturel en fond, une toile claire pour les cartes, deux fils de couleur et des liteaux qui ordonnent. L'interface ne fait ni banque ni tableau de bord : pas de tuiles d'indicateurs, pas de vert ni de rouge sur les sommes. Ce qui compte se lit en longueurs (la bande du mois, les rails des enveloppes, les parts de la répartition) et en lignes à filets, comme un registre tenu à la main.

La densité est celle d'un registre domestique : des tableaux à filets d'un pixel, des chiffres alignés, une seule grande valeur par écran (le reste à vivre). Toute la couleur tient en deux fils : l'indigo pour l'actif, la sélection et les données, la garance pour un dépassement ou une perte réelle. Tous les neutres viennent d'une seule rampe de lin, en clair comme en sombre (le sombre est un lin brun nuit, pas un gris).

La signature est le liteau : deux filets indigo parallèles, comme la lisière tissée d'un torchon. Ils bordent la bande du mois, soulignent l'onglet actif et posent chaque total. L'à-venir et le projeté ont leur propre armure : un rayé vertical fin indigo, partout et seulement pour eux.

**Key Characteristics:**
- Fond lin métis, cartes en toile claire à coins de 10px, cernées d'un fil d'un pixel, ombres presque nulles.
- Deux fils de couleur seulement : indigo (données, actif) et garance (dépassement, perte).
- Montants à l'encre, jamais teintés ; le sens passe par un signe, un chevron, une icône et un libellé.
- Liteaux (double filet indigo) sur la bande du mois, l'onglet actif et les totaux.
- Rayé vertical fin indigo pour l'à-venir et le projeté, et pour rien d'autre.
- Police système, graisses 400 / 500 / 600, chiffres tabulaires.

## Colors

Une rampe de lin pour tous les neutres, deux fils pour toute la couleur ; aucune teinte par catégorie.

### Primary
- **Indigo** (`indigo`) : le fil principal. Onglet actif et son liteau, bouton principal, segment de dépense de la bande du mois, longueurs de données (parts, rails de livrets, colonne « aujourd'hui »), liteaux des totaux, liens d'action. En sombre il s'éclaircit en indigo de nuit pour garder le contraste.
- **Indigo moyen** (`indigo-moyen`) : anneau de focus (3px, décalé de 2px), bordure de la zone de dépôt au survol, rails des commerçants.
- **Indigo voile** (`indigo-voile`) : fond du rayé de l'à-venir, pastille de filtre actif, survol des boutons-icônes, ligne modifiée en édition, rail d'une enveloppe dans les clous.
- **Indigo fil** (`indigo-fil`) : soulignement des liens d'action au repos, sélection de texte, bordure pointillée de la zone de dépôt.
- **Indigo pâle** (`indigo-pale`) : l'épargne du mois dans la bande tissée, et elle seule.

### Secondary
- **Garance** (`garance`) : un dépassement réel ou projeté (« Dépassée de … avec l'à-venir »), un reste à vivre négatif, une perte réelle (verdict « Défavorable »), et les actions qui détruisent des données (supprimer, retirer un livret). Toujours avec icône et libellé.
- **Garance voile** (`garance-voile`) : rail d'une enveloppe dépassée, ligne marquée pour suppression.

### Neutral
- **Lin métis** (`lin-metis`) : fond de l'app et de la barre d'app.
- **Toile** (`toile`) : cartes, champs, segment actif, étiquettes posées sur un graphique.
- **Lin clair** (`lin-clair`) : rails vides, survols, conteneur du sélecteur segmenté, encarts de calcul, ligne sélectionnée.
- **Fil** (`fil`) : filets d'un pixel entre les lignes, contour des cartes et des champs, bord des boutons fantômes.
- **Lin foncé** (`lin-fonce`) : la partie libre de la bande du mois, où se pose le montant du reste à vivre.
- **Lin « Autres »** (`lin-autres`) : l'historique et les références (colonnes des mois passés, rail neutre d'un placement de comparaison, « Autres » dans les répartitions).
- **Encre** (`encre`) : texte, tous les montants et écarts, repère « fin des revenus », trait « en euros d'aujourd'hui ».
- **Encre douce** (`encre-douce`) : libellés secondaires, en-têtes de colonnes, notes, onglets inactifs.

### Named Rules
**La règle des deux fils.** L'indigo et la garance sont les seules teintes de l'interface. Tout le reste vient de la rampe de lin. Aucune palette catégorielle : une catégorie se distingue par son nom et sa longueur, jamais par une couleur.

**La règle de l'encre.** Aucune couleur ne juge un montant. Montants et écarts sont à l'encre ; une rentrée est à l'encre avec un signe « + » ; un écart porte un chevron et un signe. Le rendement réel est à l'encre quand il est négatif, indigo quand il est positif, toujours avec chevron et signe.

**La règle sans orange.** « À surveiller » et « Bientôt atteinte » n'ont pas de teinte à eux : les jetons d'avertissement sont des alias de l'indigo, de l'indigo voile et de l'encre. L'icône et le libellé portent l'état.

**La règle de la garance.** La garance ne paraît que pour un dépassement (réel ou avec l'à-venir), une perte réelle ou une destruction de données. Si rien n'est perdu ni dépassé, elle n'est pas à l'écran.

## Typography

**Display Font:** police système (-apple-system, BlinkMacSystemFont, « Segoe UI », system-ui, sans-serif)
**Body Font:** la même
**Label/Mono Font:** la même, avec chiffres tabulaires

**Character:** une seule famille, celle de l'appareil, tenue par trois graisses. La hiérarchie vient de la taille et de la graisse, jamais d'une seconde police, de capitales ou d'espacement élargi.

### Hierarchy
- **Display** (500, clamp 2.4 → 3.2rem, interligne 1, -0.025em) : le reste à vivre posé dans la bande du mois. Une seule fois par écran, en 500 et non en gras.
- **Headline** (600, clamp 1.4 → 1.9rem, interligne 1.15, -0.02em) : titre de page (le mois, « Épargne », « Importer »).
- **Title** (600, 1.25rem, -0.01em) : titre de carte (« Reste à vivre », « Catégories & enveloppes », nom d'un livret).
- **Body** (400, 1rem, interligne 1.45) : texte courant ; aides de carte limitées à 62–70ch.
- **Figure** (600, 1rem, chiffres tabulaires) : montants des lignes, noms de catégories et d'opérations.
- **Small** (400, 0.84–0.9rem) : métadonnées des lignes, aides, légendes.
- **Label** (600, 0.8rem) : en-têtes de colonnes, valeurs posées sur les graphiques, étiquettes de repère.

### Named Rules
**La règle des trois graisses.** 400 pour lire, 500 pour le montant héros et les onglets, 600 pour nommer et chiffrer. Rien au-delà.

**La règle des chiffres alignés.** Toute colonne, équation ou valeur chiffrée passe en chiffres tabulaires.

## Layout

Une colonne centrée de 1120px au plus, gouttière de page de 16px. « Le mois » empile : barre d'app (56px, collante), barre d'outils (titre du mois à gauche, sélecteur segmenté à droite), carte « Reste à vivre », tableau « Catégories & enveloppes » pleine largeur, puis une grille de deux cartes (écart de 20px), puis les opérations pleine largeur. « Épargne » suit la même grammaire : grand-livre pleine largeur, cartes des livrets par deux, tableau de bord en widgets par deux (les larges sur toute la ligne).

Rythme : 4px entre éléments serrés, 8–12px entre contrôles, 10px de hauteur de ligne de tableau, 16px sous un en-tête de carte, 20px entre cartes, 24px de rembourrage de carte, 56px en fin de page.

Responsive : sous 860px les grilles passent à une colonne ; sous 760px les tableaux (catégories, grand-livre) deviennent des piles par ligne, nom et montant en haut, longueur dessous ; sous 560px le rembourrage des cartes tombe à 18 / 16 / 20px, le sélecteur s'étire sur toute la largeur et le nom de l'app disparaît derrière son icône.

## Elevation & Depth

Presque plat. Une carte se détache par un fil d'un pixel (anneau d'ombre à la couleur du fil) et un voile de 2px à 4 % d'encre. Rien ne s'élève au survol ; un survol éclaircit le fond en lin clair. Les bandeaux d'action collants (Annuler / Valider) restent sur la toile, séparés par un filet.

### Shadow Vocabulary
- **Carte** (`box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgb(43 39 35 / 0.04)`) : toutes les cartes.
- **Fil seul** (`box-shadow: 0 0 0 1px var(--border)`) : segment actif, encarts posés sur une carte.
- **Bord fantôme** (`box-shadow: inset 0 0 0 1px var(--border)`) : boutons fantômes, boutons-icônes encadrés.

### Named Rules
**La règle du fil.** La profondeur est un contour, pas une ombre portée. Aucun flou au-delà de 2px, aucune élévation au survol.

## Shapes

Trois rayons. Cartes à 10px, comme un ourlet ; contrôles (boutons, champs, sélecteur, pastilles, encarts) à 8px ; marques de données (rails, segments, barres de graphique) à 2px, des bouts francs comme un fil coupé. Les filets de tableau sont des traits d'un pixel au fil. Les boutons-icônes sont ronds (36px).

**La règle des bouts francs.** Une longueur de donnée garde des coins de 2px ; elle ne s'arrondit jamais en pilule.

## Components

### Buttons
- **Shape :** coins de contrôle (8px), hauteur 44px (34px en petit).
- **Principal :** fond indigo, texte blanc, 600 ; survol indigo plus profond. En sombre, fond indigo de nuit et texte lin brun nuit.
- **Fantôme :** fond transparent, bord d'un pixel au fil, texte encre ; survol lin clair.
- **Danger :** fond garance, seulement pour confirmer une suppression.
- **Pression / désactivé :** échelle 0.97 à l'appui (0.15s) ; 45 % d'opacité désactivé.
- **Lien d'action :** texte indigo 600, soulignement indigo fil décalé de 3px, plein au survol.

### Chips
- **Filtre actif :** pastille indigo voile, texte indigo 600, croix tracée en masque SVG ; un clic la retire. Survol indigo fil.
- **Badges d'import :** encre sur toile inversée par défaut ; « doublon » sur fil ; « appris » en indigo voile.

### Cards / Containers
- **Corner Style :** 10px.
- **Background :** toile sur lin métis.
- **Shadow Strategy :** l'ombre « Carte » (voir Elevation & Depth).
- **Internal Padding :** 22 / 24 / 24px ; 18 / 16 / 20px sur mobile.
- **En-tête :** titre en Title, aide en encre douce dessous, action fantôme à droite.

### Inputs / Fields
- **Style :** toile, fil d'un pixel, 8px, hauteur 40px (36–38px dans les filtres et l'édition en ligne).
- **Focus :** anneau indigo moyen de 3px, décalé de 2px, sur tous les éléments focusables.
- **Erreur :** bord et anneau d'un pixel garance, message 600 sous le champ. Cases à cocher natives teintées indigo.

### Navigation
- **Barre d'app :** fine (56px), sur le lin métis, filet au fil dessous ; icône et nom de l'app à gauche, onglets texte à droite (écart 28px).
- **Onglets :** encre douce 500 au repos, encre au survol ; l'actif passe en encre 600 et porte un liteau dessous, qui se déploie en scaleX (0.25s, courbe 0.16 / 1 / 0.3 / 1).
- **Sélecteur segmenté :** boutons radio natifs habillés ; conteneur lin clair bordé de fil, segment actif en toile cernée d'un fil.

### La bande tissée du mois (signature)
La longueur totale vaut les revenus. Bordée en haut et en bas d'un liteau (filet indigo de 1.5px plus une ligne intérieure d'un pixel à 3px du bord), hauteur 76 → 100px. Segments séparés de 2px : dépensé en indigo plein, à venir en rayé vertical fin (1.5px indigo tous les 5px sur indigo voile), épargné en indigo pâle, libre en lin foncé avec le montant Display posé dedans. Un dépassement ajoute un segment garance et un repère d'encre de 3px à la fin des revenus. L'équation dessous reprend chaque terme avec sa pastille de 12px. Les segments s'étirent depuis zéro en 0.9s, décalés de 0.12 à 0.24s.

### Liteau des totaux
Une ligne de total est bordée d'un double filet indigo de 4px (`border-top: 4px double`) : total du grand-livre des livrets, « Ce que vous gagnez vraiment », total des intérêts face à l'inflation, bandeau d'édition des enveloppes. L'export Excel le reprend : double bordure indigo au-dessus des totaux, en-têtes sur fond indigo en toile 600.

### Tableaux à filets
Catégories & enveloppes, grand-livre, taux, opérations, échéances, bulletin : lignes séparées par un filet d'un pixel au fil, en-têtes en Label encre douce, nombres alignés à droite. Une enveloppe est un rail de 8px (lin clair, rempli d'indigo dans les clous, de garance dépassée), son à-venir rayé, son statut en icône + libellé.

### Graphiques
Les données sont des longueurs indigo ; l'historique et les références en lin « Autres ». Évolution sur 6 mois : mois passés en lin « Autres », mois courant en indigo, enveloppe en trait d'encre douce de 1.5px nommé à droite. Projection : colonne d'aujourd'hui en indigo plein, années projetées en rayé fin, et un trait d'encre de 2.5px pour ce que vaudra le solde en euros d'aujourd'hui. Historique des taux : livrets en lignes indigo (l'un à 55 %), prix en tirets d'encre. La répartition est une liste à filets, la part en longueur indigo ; l'anneau n'est plus dessiné.

### Emoji des catégories
Les emoji sont des données saisies par l'utilisateur ; ils s'affichent désaturés (niveaux de gris, 75 % d'opacité ; en sombre luminosité 1.6 à 90 %) pour qu'aucune couleur ne parle à la place des montants. Question ouverte auprès de l'utilisateur : les remplacer par un jeu d'icônes dessinées. Aucun nouvel élément d'interface ne doit s'appuyer sur un emoji.

### Icône de l'app
Carré violet arrondi (`#6C47FF`), trois barres ascendantes (rose `#F0509A`, lavande `#EDE8FF`, menthe `#0FA89A`) surmontées d'une pièce dorée (`#FFB020`).

## Do's and Don'ts

### Do:
- **Do** tirer chaque neutre de la rampe de lin (lin métis, toile, lin clair, fil, lin foncé, lin « Autres », encre, encre douce), en clair comme en sombre.
- **Do** montrer une quantité par une longueur indigo à bouts francs (2px), jamais par une tuile chiffrée.
- **Do** border chaque total d'un liteau (`4px double` indigo) et l'onglet actif d'un double filet.
- **Do** dessiner l'à-venir et le projeté en rayé vertical fin indigo, et rien d'autre avec ce motif.
- **Do** accompagner chaque état (Dans l'enveloppe, À surveiller, Dépassée, Favorable, Défavorable) d'une icône et d'un libellé.
- **Do** passer chaque chiffre en tabulaire et chaque montant à l'encre, avec signe et chevron quand il y a un sens.
- **Do** garder les cartes à 10px, les contrôles à 8px, les marques à 2px.

### Don't:
- **Don't** colorer un montant en vert ou en rouge, ni donner une teinte à « À surveiller ».
- **Don't** réintroduire une palette catégorielle ou un anneau multicolore : une catégorie n'a pas de couleur.
- **Don't** construire un écran en cartes d'indicateurs (KPI) ; les chiffres se lisent en lignes à filets et en longueurs.
- **Don't** employer la garance hors d'un dépassement, d'une perte réelle ou d'une suppression.
- **Don't** ajouter une ombre portée floue ou une élévation au survol ; la profondeur est un fil.
- **Don't** dépasser la graisse 600 ni ajouter une seconde police.
- **Don't** utiliser le rayé ou le liteau comme simple ornement : chacun a un sens unique.
