# Product

## Platform

web

## Users
Toute personne souhaitant suivre son budget, son épargne et son patrimoine simplement, en solo ou à plusieurs (second profil et/ou compte commun activables à la demande). Usage sur ordinateur (import des relevés PDF, analyse du mois, projections patrimoniales) et sur smartphone en PWA installée.

## Product Purpose
« Mon Budget » : savoir où en est le mois (combien il reste pour vivre, quelles catégories dérapent, où part l'argent) et piloter l'étendue de son patrimoine actuel et futur (Livrets réglementés et PEA) à partir des relevés bancaires PDF, sans jamais envoyer de données personnelles sur Internet. Succès : un coup d'œil suffit pour savoir si le mois est tenu et comment évolue le patrimoine.

## Positioning
100 % local : relevés lus dans le navigateur, catégorisation par mots-clés et règles apprises, données dans IndexedDB. Aucun compte, aucun serveur, aucune synchronisation bancaire.

## Operating Context
- Les opérations arrivent par import de relevés PDF bancaires, validées dans une zone tampon avant enregistrement.
- Mode solo par défaut (« Moi »), extensible à la demande avec un second profil (« + Profil ») et/ou un compte partagé (« + Compte commun »), ainsi qu'une vue consolidée (« Tous »).
- Rituel mensuel : importer le relevé, vérifier, regarder le mois.

## Capabilities and Constraints
- Montants en centimes ; mois indexés « YYYY-MM ».
- Catégories : base + étendues + perso (cadeaux, vêtements, coiffeur, café, travail, parking, commun).
- Reste à vivre = revenus du mois − dépenses déjà passées − dépenses mensualisées pas encore passées ce mois-ci.
- Une opération cochée « Mensualiser » est attendue chaque mois au même montant ; tant qu'aucune opération du même commerçant n'est apparue ce mois-ci, elle compte comme « à venir » (détection automatique).
- L'épargne et les virements internes sont exclus des dépenses, des jauges, de la répartition et du reste à vivre.
- Budgets : plafond mensuel par catégorie et par profil ; jauge verte < 75 %, orange 75 à 100 %, rouge > 100 %.
- Écran « Épargne » : Livret A et LEP. Solde de départ saisi, virements retrouvés dans les relevés, intérêts calculés par quinzaine et versés au 31 décembre, plafonds, rendement réel face à l'inflation INSEE sur un an, projection interactive à 3, 5, 10 ou 15 ans avec sélection au clic et tableau annuel complet.
- Onglet « Investir » : vue consolidée du Patrimoine Global (Livrets + PEA, répartition, projection à 5, 10, 15 et 20 ans avec rente mensuelle à 4 %), portefeuilles PEA avec projection interactive jusqu'à 25 ans, objectifs confrontés aux stratégies, et repères (indices, fiscalité du PEA).
- Export Excel (.xlsx) : feuilles maîtresses « Bilan Patrimoine » et « Projection 25 ans » pilotées par formules Excel modifiables, feuilles de détail par livret et par PEA, graphiques Excel natifs, fabriqué localement dans le navigateur.
- Conditions Générales d'Utilisation et Mentions Légales (`#/cgv`) intégrées à l'application.
- Aucune ressource externe à l'exécution (CSP `'self'`) ; tout est servi localement.

## Brand Commitments
Ton chaleureux, vouvoiement, français. L'interface ne doit pas « faire comptabilité » : chaleureuse et moderne. Style « Bonbon fintech », joyeux et coloré (« dopamine ») mais toujours une appli de gestion bancaire. Les couleurs peuvent juger les montants : vert pour les gains et rentrées, rouge pour les pertes et dépassements, toujours avec icône, signe ou libellé.

## Evidence on Hand
Aucune donnée personnelle dans le dépôt.

## Product Principles
- Aucune donnée personnelle ne quitte l'appareil. Seule exception, voulue par l'utilisateur (octobre 2026) : l'app lit des séries publiques (INSEE, BCE, service-public.gouv.fr via le serveur local, Caisse des Dépôts) pour tenir à jour taux et inflation ; ces requêtes ne contiennent aucune donnée de l'utilisateur et se désactivent dans « Taux et inflation ».
- Une réponse en un coup d'œil : le reste à vivre d'abord.
- L'utilisateur garde la main : toute suggestion automatique se corrige et la correction est retenue.
- Jamais culpabilisant : signaler un dépassement sans dramatiser.

## Accessibility & Inclusion
Lisible en clair et en sombre ; couleurs jamais seules porteuses de sens (statuts accompagnés d'un libellé) ; utilisable au toucher sur iPhone.
