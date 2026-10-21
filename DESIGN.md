---
name: Notre Budget
description: Le budget à deux, 100 % local — chaleureux, lisible en un coup d'œil.
colors:
  creme-bg: "#FBF6EF"
  surface: "#FFFFFF"
  surface-2: "#F7F0E8"
  border: "#E8DDD2"
  text: "#2B2420"
  text-muted: "#7A6E66"
  accent: "#E07A5F"
  accent-strong: "#B9502F"
  accent-soft: "#FBEAE3"
  accent-line: "#EDB9A8"
  positive: "#3E8657"
  positive-soft: "#E3F1E7"
  positive-field: "#CFE7D7"
  warning: "#E9A23B"
  warning-soft: "#FDF3E1"
  warning-ink: "#8A5600"
  danger: "#B0153F"
  danger-soft: "#FBE3EA"
  series-1: "#2A78D6"
  series-2: "#EB6834"
  series-3: "#1BAF7A"
  series-4: "#EDA100"
  series-5: "#E87BA4"
  series-other: "#B5ABA2"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Rounded\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "clamp(3rem, 2.2rem + 2.6vw, 4.25rem)"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Rounded\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "clamp(1.4rem, 1.1rem + 1vw, 1.9rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Rounded\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  subtitle:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Rounded\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 700
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Rounded\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  small:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Rounded\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 400
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Rounded\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 650
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Rounded\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 650
    letterSpacing: "0.02em"
  figure:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Rounded\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 700
    fontFeature: "tnum"
rounded:
  key: "4px"
  hover: "10px"
  control: "12px"
  bar: "14px"
  card: "18px"
  pill: "999px"
spacing:
  gutter: "16px"
  stack: "20px"
  card-x: "24px"
  card-y: "22px"
  row: "10px"
components:
  button-primary:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
  button-small:
    rounded: "{rounded.pill}"
    padding: "6px 14px"
    height: "34px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    size: "36px"
  icon-button-hover:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "22px 24px 24px"
  segmented:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "4px"
  segmented-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
  monthbar:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.bar}"
    height: "clamp(84px, 66px + 3.2vw, 112px)"
  meter:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.pill}"
    height: "8px"
  chip:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "5px 10px 5px 12px"
  chip-hover:
    backgroundColor: "{colors.accent-line}"
    textColor: "{colors.text}"
  category-row-selected:
    backgroundColor: "{colors.surface-2}"
  category-button:
    textColor: "{colors.text}"
    rounded: "{rounded.hover}"
    padding: "4px 8px"
  category-button-active:
    textColor: "{colors.accent-strong}"
  envelope-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    width: "7.5em"
    height: "36px"
  envelope-bar:
    backgroundColor: "{colors.surface}"
    padding: "14px 24px"
  trend-bar:
    backgroundColor: "{colors.series-other}"
    width: "min(44px, 70%)"
  trend-bar-current:
    backgroundColor: "{colors.accent-strong}"
  merchant-rail:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.pill}"
    height: "6px"
  switch:
    backgroundColor: "{colors.border}"
    rounded: "{rounded.pill}"
    width: "38px"
    height: "22px"
  switch-on:
    backgroundColor: "{colors.accent-strong}"
  link-button:
    textColor: "{colors.accent-strong}"
---

# Design System: Notre Budget

## Overview

**Creative North Star: "La barre du mois"**

Notre Budget est un carnet de compte posé sur une table de cuisine, pas un logiciel de comptabilité. Le fond crème chaud, les cartes blanches très arrondies qui flottent sur des ombres douces et la terracotta de la dépense donnent une interface domestique, calme, qui se lit en un coup d'œil. Le tableau de bord descend du plus global au plus fin : la barre du mois, puis le tableau des catégories et de leurs enveloppes, puis une grille de quatre cartes d'analyse, puis la liste des opérations. Chaque carte répond à une seule question.

Le système raisonne en **longueurs plutôt qu'en tuiles chiffrées**. Le mois est une seule barre dont la longueur totale vaut les revenus ; le dépensé, l'à-venir et le libre en sont des segments, et le reste à vivre est écrit dans la partie libre. Les enveloppes, les barres d'évolution et les rails des commerçants reprennent la même grammaire en petit. Un même code visuel — plein pour ce qui est passé, hachuré pour ce qui est prévu — traverse la barre, les enveloppes, l'équation et les échéances.

Le thème suit le système (clair / sombre via `prefers-color-scheme`) ; chaque jeton a sa valeur sombre, consignée dans `.impeccable/design.json`. Les couleurs ne portent jamais seules le sens : un statut s'accompagne toujours d'une icône et d'un libellé, un écart d'une flèche et d'un signe, une part de l'anneau d'un nom et d'un montant écrits.

**Key Characteristics:**
- Fond crème chaud, cartes blanches à 18px, ombres diffuses à deux couches.
- Terracotta pour la dépense, le mois courant et l'action ; vert pour le libre ; carmin pour le dépassement.
- Hachure à 135° = « à venir », partout et seulement pour cela.
- Police système Apple, chiffres en `tabular-nums`, un seul gros chiffre par écran.
- Remplissage simultané de toutes les longueurs depuis zéro, en ease-out exponentiel.
- Formes en pilule pour tout ce qui se touche ou qui mesure (boutons, segments, filtres, rails, interrupteur).

## Colors

Une palette chaude et terreuse à un seul accent (terracotta), doublée d'un trio de statuts et d'un jeu catégoriel séparé, réservé à l'anneau.

### Primary
- **Terracotta brûlée** (accent-strong) : la dépense passée (segment plein de la barre, pastille de l'équation), la barre du mois courant dans l'évolution, la catégorie sélectionnée, le bouton principal, l'interrupteur actif, les liens-actions, le texte des filtres actifs. En sombre, elle s'éclaircit et le texte du bouton principal passe en brun très foncé.
- **Terracotta** (accent) : anneau de focus (3px), traits de la hachure « à venir », remplissage des rails des commerçants, bordure active de la zone de dépôt.
- **Terracotta pâle** (accent-soft) : fond de la hachure, fond des filtres actifs, de la zone de dépôt et de l'état IA, survol des boutons-icônes, sélection de texte.
- **Trait terracotta** (accent-line) : soulignement des liens-actions, survol des filtres actifs, pointillés de la zone de dépôt.

### Secondary
- **Vert sauge** (positive) / **Vert pâle** (positive-soft) / **Champ vert** (positive-field) : « dans l'enveloppe », dépense en baisse par rapport à la moyenne, montants d'entrée, mention de confidentialité. Le champ vert remplit la partie libre de la barre du mois.
- **Ambre** (warning) / **Ambre pâle** (warning-soft) / **Encre ambre** (warning-ink) : enveloppe « bientôt atteinte » (75–100 %), dépense en hausse par rapport à la moyenne, lignes d'import à vérifier. Le texte d'avertissement utilise toujours l'encre ambre, jamais l'ambre vif.
- **Carmin** (danger) / **Carmin pâle** (danger-soft) : enveloppe dépassée, reste à vivre négatif, segment « au-delà des revenus », champ invalide.

### Tertiary
- **Jeu catégoriel de l'anneau** (series-1 à series-5 + series-other) : bleu, orange, vert d'eau, or, rose, puis gris « Autres ». Jeu validé pour la vision des couleurs (validateur dataviz) contre la surface claire (#FFFFFF) et la surface sombre (#2A2521), avec des valeurs sombres dédiées. En clair, les teintes 3 à 5 passent sous 3:1 contre la surface ; c'est compensé par une légende toujours visible qui écrit nom, montant et part.
- **Gris « Autres »** (series-other) sert aussi de ton neutre pour ce qui est désaccentué : les mois passés de l'évolution, le remplissage d'une enveloppe sans statut.

### Neutral
- **Crème** (creme-bg) : fond de page et de la barre d'application collante.
- **Blanc carte** (surface) : cartes, champs, segment sélectionné, pied d'édition des enveloppes.
- **Crème profonde** (surface-2) : rails vides (barre, enveloppes, commerçants, anneau), conteneur des segments, ligne de catégorie sélectionnée, survols, lignes du tableau d'import.
- **Lin** (border) : séparateurs de lignes (1px), ligne de base de l'évolution, contour des champs, interrupteur éteint, barré des échéances non retrouvées.
- **Brun encre** (text) / **Taupe** (text-muted) : texte principal / secondaire. Les montants sont en brun encre, leurs libellés en taupe. Le taupe trace aussi le trait de référence de l'enveloppe dans l'évolution.

### Named Rules
**La règle de la hachure.** Le motif `repeating-linear-gradient(135deg, accent 0 2px, transparent 2px 7px)` sur accent-soft signifie « à venir / projeté » et rien d'autre. Il apparaît dans la barre du mois, les enveloppes, la pastille de l'équation et devant le montant des échéances à venir (en version fine 1.5px / 5px). Ne jamais l'utiliser comme décor.

**La règle du jamais seul.** Vert, ambre et carmin ne sont jamais le seul porteur d'un sens : un statut d'enveloppe a son icône SVG et son libellé (« Dans l'enveloppe », « Bientôt atteinte », « Dépassée de … ») ; un écart à la moyenne a son chevron SVG et son signe (+ / −), ou le texte « ≈ comme d'habitude » en taupe. Le rail de l'enveloppe prend la version pâle de la couleur d'état.

**La règle des deux palettes.** La terracotta et les statuts parlent de l'argent ; les teintes catégorielles (series-1 à series-5) parlent des catégories et ne servent qu'à l'anneau et à sa légende. Seul le gris « Autres » sert aussi de ton neutre pour l'historique et les remplissages sans statut. Ne pas croiser les deux.

**La règle de l'emphase unique.** Dans une série (évolution sur 6 mois), un seul élément porte la terracotta brûlée — le mois affiché ; les autres restent en gris « Autres ». L'accent désigne, il ne décore pas.

## Typography

**Display Font:** police système Apple (`-apple-system`, BlinkMacSystemFont, « SF Pro Rounded », Segoe UI, system-ui)
**Body Font:** la même pile système

**Character:** une seule famille, native de l'appareil, qui travaille par la graisse et l'approche plutôt que par le contraste de polices : les grands chiffres sont lourds (750) et resserrés, le reste reste léger et lisible.

### Hierarchy
- **Display** (750, clamp 3rem → 4.25rem, interligne 1, approche -0.035em) : uniquement le montant du reste à vivre, posé dans la partie libre de la barre. Un seul par écran.
- **Headline** (700, clamp 1.4rem → 1.9rem, 1.15) : le titre du mois entre les flèches ; titre de la page d'import (jusqu'à 2.2rem).
- **Title** (700, 1.25rem, -0.01em) : titres de toutes les cartes, héros compris.
- **Subtitle** (700, 0.95rem) : sous-groupes d'une carte (« À venir », « Non retrouvées »).
- **Body** (400, 1rem, 1.45) : texte courant ; les aides de carte en 0.88rem taupe, limitées à 62ch.
- **Small** (400–650, 0.84–0.86rem) : ligne d'enveloppe, écarts « ≈ », filtres actifs, interrupteur, liens-actions secondaires, méta des opérations.
- **Caption** (650, 0.8rem, taupe ; 0.75rem pour les notes de graphique) : en-têtes de colonnes du tableau, mois de l'évolution, moyennes, « non importé », étiquette du trait d'enveloppe.
- **Label** (650, 0.82rem, +0.02em, casse normale) : en-tête de la liste des opérations, en taupe.
- **Figure** (700, 0.92–0.95rem, chiffres tabulaires) : montants du tableau, de l'équation, des opérations, des commerçants et de la légende ; valeurs des barres d'évolution en 0.8rem.

### Named Rules
**La règle des chiffres alignés.** Tout montant, date ou pourcentage utilise `font-variant-numeric: tabular-nums`, sans exception ; le tableau des catégories l'impose sur toute la table.

**La règle du chiffre unique.** Le poids 750 au-delà de 2rem est réservé au reste à vivre ; le centre de l'anneau utilise 750 mais plafonne à 1.5rem.

## Layout

Colonne centrée de 1120px maximum, gouttière de page de 16px (plus les zones sûres iOS). Les blocs s'empilent avec un écart de 20px. Ordre du tableau de bord : barre d'outils (mois à gauche, sélecteur de vue à droite) ; carte héros pleine largeur ; carte « Catégories & enveloppes » pleine largeur (tableau Catégorie | Ce mois | Par rapport à la moyenne | Enveloppe, colonnes 30 / 14 / 14 / 38 %) ; grille 2×2 à colonnes égales (Évolution sur 6 mois, Répartition, Principaux commerçants, Échéances mensualisées) ; carte des opérations pleine largeur. Les en-têtes de carte peuvent porter une action à droite (bouton fantôme ou filtre actif). Les cartes ont un rembourrage de 22px 24px 24px ; les lignes de tableau et de liste 8–10px verticaux séparées par un filet de 1px.

Points de rupture observés : 860px (la grille passe à une colonne), 760px (chaque ligne du tableau des catégories devient un bloc nom / montant, enveloppe, écart ; le tableau d'import devient une pile de cartes), 560px (barre d'outils empilée, segments répartis, cartes à 18px 16px, opération sur deux lignes, anneau centré au-dessus de sa légende).

## Elevation & Depth

Système à élévation douce : les cartes flottent sur le crème grâce à une ombre diffuse à deux couches teintée de brun, jamais grise ni dure. Une seconde ombre, plus courte, sert aux éléments « posés » à l'intérieur d'une carte : segment sélectionné, onglet actif, médaillon de la zone de dépôt, message d'état. En sombre, les ombres passent au noir avec plus d'opacité. Les rails, sous-zones, survols et lignes sélectionnées sont en ton sur ton (surface-2), sans ombre. Les pieds collants (édition des enveloppes, validation d'import) sont plats : un filet lin en haut, pas d'ombre.

### Shadow Vocabulary
- **Carte** (`0 1px 2px rgb(60 40 30 / 0.06), 0 8px 28px rgb(60 40 30 / 0.07)`) : toutes les cartes et la zone de validation.
- **Posé** (`0 1px 2px rgb(60 40 30 / 0.08), 0 3px 10px rgb(60 40 30 / 0.06)`) : segment ou onglet sélectionné, pastilles et messages au-dessus d'un fond teinté.

### Named Rules
**La règle de l'ombre chaude.** Les ombres sont toujours diffuses et teintées de brun (rgb 60 40 30) en clair ; aucune ombre décalée nette.

## Shapes

Formes généreuses et douces. Les cartes sont à 18px, les champs à 12px, la barre du mois à 14px, les zones de survol cliquables (bouton de catégorie, ligne de légende) à 10px, les pastilles de légende et le bout des barres d'évolution à 4px. Petits rayons locaux : colonne survolée de l'évolution 8px en haut seulement, lien-action 6px, repère hachuré 3px. Tout ce qui se touche ou qui mesure est en pilule (999px) : boutons, segments, onglets, filtres actifs, rails (enveloppes 8px, commerçants 6px), interrupteur, badges. Les boutons-icônes sont ronds. Les segments d'une longueur sont séparés par un vide (3px dans la barre, 2px dans les enveloppes et entre les arcs de l'anneau), jamais par un trait.

## Components

### Buttons
- **Shape :** pilule (999px), hauteur minimale 44px (34px en petit).
- **Primary :** terracotta brûlée, texte blanc (brun foncé en sombre), graisse 600, 11px 22px.
- **Ghost :** transparent avec contour intérieur lin de 1px ; survol en crème profonde. En petit, c'est l'action d'en-tête de carte (« Ajuster les enveloppes »).
- **Press / Disabled :** `scale(0.97)` à l'appui (0.15s) ; désactivé à 45 % d'opacité.
- **Icon button :** rond de 36px, taupe ; survol terracotta sur terracotta pâle.
- **Link button :** texte terracotta brûlée 600, souligné accent-line décalé de 3px, soulignement plein au survol. Sert aux actions de ligne (« Pas ce mois-ci », « Ne plus mensualiser »).

### Chips
- **Filtre actif :** pilule terracotta pâle, texte terracotta brûlée 650 en Small, 5px 10px 5px 12px ; survol en trait terracotta avec texte brun encre. Placée dans l'en-tête de carte, elle nomme la catégorie choisie et la retire d'un clic.
- **Badges d'import :** pilules 0.74rem 600 ; « à vérifier » ambre, « doublon » lin, « appris » et « IA » terracotta sur terracotta pâle, « IA en attente » contour seul.

### Cards / Containers
- **Corner Style :** 18px.
- **Background :** blanc carte sur fond crème.
- **Shadow Strategy :** ombre « Carte ».
- **Border :** aucune.
- **Internal Padding :** 22px 24px 24px (18px 16px 20px sous 560px).

### Inputs / Fields
- **Style :** blanc carte, contour lin 1px, 12px, hauteur minimale 40px, 0.95rem.
- **Focus :** anneau terracotta de 3px décalé de 2px (règle globale `:focus-visible`).
- **Error :** contour et halo carmin de 1px.
- **Champ d'enveloppe :** 7.5em, 36px de haut, aligné à droite en chiffres tabulaires, suivi de « € / mois » en Small taupe ; l'indication « ≈ N » (moyenne arrondie) en taupe à 60 %.
- **Switch « Mensualiser » :** case native au rôle switch, 38×22px, éteint en lin, allumé en terracotta brûlée, pastille blanche qui glisse de 16px en 0.2s.

### Navigation
- **Onglets d'application et sélecteur de vue :** conteneur pilule crème profonde, rembourrage 4px ; éléments 600 taupe ; l'élément actif devient une pilule blanche avec l'ombre « Posé ». Le sélecteur de vue (Tous / personnes) est fait de boutons radio natifs habillés et règle aussi la portée des enveloppes : foyer pour « Tous », personnelle sinon. La barre d'application est collante sur le fond crème.

### La barre du mois (signature)
Rail crème profonde de 84–112px de haut, rayon 14px. Segments : dépensé (terracotta brûlée pleine), à venir (hachure), libre (champ vert, porte le montant Display), dépassement (carmin) avec un repère vertical de 3px marquant la fin des revenus. Dessous, l'équation « revenus − déjà dépensés − à venir = libre » avec une pastille de 12px par terme. Si le mois est négatif, le montant et le résultat passent en carmin.

### Catégories & enveloppes
Tableau pleine largeur, lignes séparées par un filet lin, en-têtes de colonne en Caption taupe. La catégorie est un bouton (survol crème profonde à 10px, sélection en terracotta brûlée et ligne entière en crème profonde) qui filtre l'évolution et les opérations. « Ce mois » : montant en Figure, à venir en Caption dessous. « Par rapport à la moyenne » : chevron SVG 13px + écart signé, en encre ambre à la hausse, en vert sauge à la baisse, « ≈ comme d'habitude » en taupe Small quand l'écart est faible ; moyenne en Caption dessous. « Enveloppe » : rail pilule de 8px teinté du statut, remplissage plein puis à-venir hachuré, puis une ligne Small statut (icône + libellé + pourcentage) à gauche et « reste N € » à droite ; « Pas d'enveloppe » en taupe sinon. En mode édition, la colonne devient un champ d'enveloppe et un pied collant plat (filet lin, blanc carte, coins bas à 18px) affiche le total et les actions « Compléter d'après mes derniers mois » / « Annuler » (fantômes) / « Enregistrer » (principal), toutes en petit.

### Évolution sur 6 mois
Six colonnes de barres HTML (hauteur 190px, ligne de base lin) : mois passés en gris « Autres », mois affiché en terracotta brûlée (emphase unique), bouts arrondis à 4px. La valeur est écrite au-dessus du mois affiché et du maximum, et de toute colonne survolée ou focalisée ; un mois sans relevé affiche « non importé » en Caption. L'enveloppe de la catégorie choisie est un trait plein taupe de 1.5px nommé à droite. Une ligne de lecture taupe sous le graphique répète la valeur de la colonne survolée ou focalisée.

### Principaux commerçants
Liste ordonnée : icône, nom (600, tronqué), nombre d'opérations en Caption, montant en Figure ; dessous, un rail pilule de 6px en crème profonde rempli de terracotta, aligné sur le nom.

### Échéances mensualisées
Deux sous-groupes en Subtitle avec une aide Small taupe : « À venir » (montant précédé du repère hachuré de 10px) et « Non retrouvées » (montant taupe barré d'un trait lin). Chaque ligne : date taupe, nom 600, montant en Figure, puis des liens-actions Small.

### Anneau de répartition
SVG sans bibliothèque, épaisseur 22, arcs séparés de 2px, piste crème profonde. Survol ou focus d'une part : les autres passent à 28 % d'opacité, la part s'épaissit à 26 et le centre affiche son montant et sa part. La légende (pastille, nom, montant, part) est toujours visible et sert de tableau.

### Opérations
Une seule liste : date, icône, nom et méta, montant, et une colonne « Mensualiser » (interrupteur) annoncée une fois dans l'en-tête Label. Entrées en vert sauge, opérations hors budget en taupe. Un filtre actif dans l'en-tête de carte restreint la liste à la catégorie choisie.

### Motion
**La règle du remplissage commun.** Au chargement et à chaque changement de mois ou de vue, toutes les longueurs — barre du mois, enveloppes, barres d'évolution, rails des commerçants, arcs de l'anneau — partent de zéro et se remplissent ensemble en `cubic-bezier(0.16, 1, 0.3, 1)` sur 0.9s ; dans la barre, l'à-venir suit à 0.12s, le libre à 0.2s, le dépassement à 0.24s ; dans les enveloppes, l'à-venir suit à 0.12s. Les mises à jour locales (enveloppe, interrupteur, filtre) transitionnent depuis l'état courant, sans repartir de zéro. Tout est coupé sous `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** exprimer une quantité d'argent par une longueur dans un rail ou une barre plutôt que par une tuile chiffrée.
- **Do** réserver la hachure à 135° (accent sur accent-soft) au « à venir / projeté », dans tous les composants.
- **Do** accompagner chaque couleur de statut ou de tendance d'une icône SVG et d'un libellé ou d'un signe écrits.
- **Do** ne mettre en terracotta brûlée qu'un seul élément d'une série (le mois affiché) et laisser les autres en gris « Autres ».
- **Do** garder la légende de l'anneau toujours visible, avec nom, montant et part.
- **Do** utiliser les chiffres tabulaires pour tout montant, date ou pourcentage.
- **Do** donner sa valeur sombre à tout nouveau jeton, dans le même bloc `prefers-color-scheme`.
- **Do** couper toute animation sous `prefers-reduced-motion`.

### Don't:
- **Don't** utiliser la hachure comme texture décorative ou pour un autre sens que « à venir ».
- **Don't** utiliser les teintes catégorielles (series-1 à series-5) hors de l'anneau et de sa légende, ni la terracotta pour une catégorie.
- **Don't** poser du texte d'avertissement en ambre vif : utiliser l'encre ambre.
- **Don't** dessiner un rail d'enveloppe pour une catégorie qui n'en a pas : écrire « Pas d'enveloppe ».
- **Don't** utiliser d'ombre dure ou décalée, ni d'ombre grise neutre.
- **Don't** charger de police ou de ressource externe (CSP `'self'`) : la pile système est la typographie.
