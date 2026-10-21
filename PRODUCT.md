# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Un couple (l'utilisateur et sa compagne) qui gère son budget à deux. Usage principal sur le Mac familial (import des relevés, analyse du mois) ; plus tard sur leurs iPhones en PWA installée, surtout pour consulter.

## Product Purpose
« Notre Budget » : savoir où en est le mois — combien il reste pour vivre, quelles catégories dérapent, où part l'argent — à partir des relevés bancaires PDF, sans jamais envoyer de données sur Internet. Succès : un coup d'œil suffit pour savoir si le mois est tenu.

## Positioning
100 % local : relevés lus dans le navigateur, catégorisation par mots-clés, règles apprises et IA locale (Qwen3.5 dans le navigateur), données dans IndexedDB. Aucun compte, aucun serveur, aucune synchronisation bancaire.

## Operating Context
- Les opérations arrivent par import de relevés PDF (Société Générale), validées dans une zone tampon avant enregistrement.
- Trois profils : Moi, Ma compagne, Commun. Le tableau de bord se lit pour l'une de ces vues ou pour tout le foyer (sélecteur de vue).
- Rituel mensuel : importer le relevé, vérifier, regarder le mois.

## Capabilities and Constraints
- Montants en centimes ; mois indexés « YYYY-MM ».
- Catégories : base + étendues + perso (cadeaux, vêtements, coiffeur, café, travail, parking, commun).
- Reste à vivre = revenus du mois − dépenses déjà passées − dépenses mensualisées pas encore passées ce mois-ci.
- Une opération cochée « Mensualiser » est attendue chaque mois au même montant ; tant qu'aucune opération du même commerçant n'est apparue ce mois-ci, elle compte comme « à venir » (détection automatique).
- L'épargne et les virements entre comptes du couple sont exclus des dépenses, des jauges, de la répartition et du reste à vivre.
- Budgets : plafond mensuel par catégorie et par profil ; jauge verte < 75 %, orange 75–100 %, rouge > 100 %.
- Aucune ressource externe à l'exécution (CSP `'self'`) ; tout est vendu localement.

## Brand Commitments
Ton chaleureux, tutoiement évité (vouvoiement), français. L'interface ne doit pas « faire comptabilité » : chaleureuse et moderne.

## Evidence on Hand
Aucune donnée réelle dans le dépôt ; seul le relevé d'exemple officiel Société Générale (données fictives) sert aux tests.

## Product Principles
- Rien ne quitte l'appareil.
- Une réponse en un coup d'œil : le reste à vivre d'abord.
- L'utilisateur garde la main : toute suggestion automatique se corrige et la correction est retenue.
- Jamais culpabilisant : signaler un dépassement sans dramatiser.

## Accessibility & Inclusion
Lisible en clair et en sombre ; couleurs jamais seules porteuses de sens (statuts accompagnés d'un libellé) ; utilisable au toucher sur iPhone.
