# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Toute personne souhaitant suivre son budget et son épargne simplement, en solo ou à plusieurs (second profil et/ou compte commun activables à la demande). Usage sur ordinateur (import des relevés PDF, analyse du mois) et sur smartphone en PWA installée.

## Product Purpose
« Mon Budget » : savoir où en est le mois — combien il reste pour vivre, quelles catégories dérapent, où part l'argent — à partir des relevés bancaires PDF, sans jamais envoyer de données personnelles sur Internet. Succès : un coup d'œil suffit pour savoir si le mois est tenu.

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
- Budgets : plafond mensuel par catégorie et par profil ; jauge verte < 75 %, orange 75–100 %, rouge > 100 %.
- Écran « Épargne » : Livret A et LEP. Solde de départ saisi, virements retrouvés dans les relevés, intérêts calculés par quinzaine et versés au 31 décembre, plafonds, rendement réel face à l'inflation INSEE sur un an, projection à 3, 5 ou 10 ans (taux actuels maintenus, versements mensualisés poursuivis). Taux et inflation mis à jour automatiquement depuis les sources officielles (toutes les 12 h, désactivable), avec saisie manuelle possible. Intérêts composés (capitalisation au 31 décembre, part « intérêts sur intérêts » affichée) ; projection avec tous les virements réguliers repérés (mensualisés, « virement permanent », ou même montant 2 mois sur 3). Chaque ligne d'épargne de « Le mois » indique son livret (d'après le libellé) et peut être dirigée vers un autre livret ou « Autre placement » en mode édition (crayon → Valider).
- Export Excel (.xlsx) depuis l'écran Épargne : une feuille par table, formules visibles, graphiques Excel natifs, fabriqué dans le navigateur.
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
