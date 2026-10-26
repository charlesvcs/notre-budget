# Mon Budget

WebApp de suivi de budget et d'épargne (en solo, à deux ou avec un compte commun), 100 % locale et hors-ligne, installable en PWA.

## Lancer en local (Mac)

Double-cliquez sur **« Lancer Mon Budget.command »** dans le Finder, ou :

```sh
cd ~/Documents/Finance
python3 scripts/serveur.py        # http://localhost:8080
```

Le serveur local sert l'app **et** reçoit la sauvegarde automatique chiffrée
(il n'écoute que sur 127.0.0.1). Gardez le même port : les données du
navigateur sont liées à l'adresse exacte (`http://localhost:8080`).

## Arborescence

```
Finance/
├── index.html             Coquille HTML + balises PWA/iOS
├── manifest.json          Manifeste PWA (standalone, icônes)
├── service-worker.js      Cache de l'app pour le hors-ligne
├── css/
│   ├── styles.css         Tokens (clair/sombre), champs, boutons
│   ├── dashboard.css      Barre d'app, tableau de bord du mois
│   ├── epargne.css        Écrans « Épargne » et « Investir »
│   ├── menu.css           Menu principal (bouton burger, panneau, animations)
│   └── import.css         Zone de dépôt + tableau de validation
├── js/
│   ├── app.js             Démarrage : service worker, base, navigation #/mois · #/epargne · #/investir · #/importer · #/sauvegarde
│   ├── menu.js            Menu principal : bouton pilule + panneau de tuiles (ouverture animée, clavier, Échap)
│   ├── backup/
│   │   ├── backup-core.js     Chiffrement AES-GCM, sauvegarde automatique, partage
│   │   └── backup-view.js     Onglet « Sauvegarde » (mot de passe, AirDrop, restauration)
│   ├── dashboard/
│   │   ├── month-model.js     Calculs : reste à vivre, récurrentes à venir, jauges, répartition
│   │   ├── dashboard-view.js  Écran « Le mois » (lecture de la base, rendu, interactions)
│   │   └── donut.js           Anneau de répartition en SVG
│   ├── epargne/
│   │   ├── livret-rates.js    Plafonds, taux officiels du Livret A et du LEP, inflation INSEE
│   │   ├── livret-model.js    Calculs : quinzaines, intérêts au 31/12, rendement réel, projection
│   │   ├── indicators.js      Indicateurs : rendement réel, brut équivalent, doublement, historique, matelas de sécurité
│   │   ├── pea.js             PEA : indices, fiscalité, catalogue d'ETF, projection mensuelle
│   │   ├── pea-view.js        Cartes « PEA » : lignes d'ETF, plus-value, fiscalité, projection
│   │   ├── objectifs.js       Objectifs face aux stratégies (livrets, prudente, équilibrée, dynamique)
│   │   ├── investissement-view.js  Onglet « Investir » : portefeuilles, objectifs, repères PEA
│   │   ├── widgets.js         Widgets du tableau de bord (bulletin, comparateur, projection…)
│   │   ├── format.js          Mise en forme partagée (euros, %, badges)
│   │   └── epargne-view.js    Écran « Épargne » (livrets, virements à rattacher, widgets, taux)
│   ├── db/
│   │   ├── schema.js      Stores, index, constantes, migrations
│   │   ├── seed.js        Catégories et réglages par défaut
│   │   └── database.js    Ouverture, CRUD, export/import JSON
│   └── import/
│       ├── import-view.js       Dépôt PDF → tableau de validation → base
│       ├── pdf-reader.js        Ouverture du PDF avec pdf.js
│       ├── pdf-layout.js        Reconstruction des lignes + positions X
│       ├── statement-parser.js  Détection des opérations (dates, montants, colonnes)
│       └── categorizer.js       Mots-clés + règles apprises
├── lib/pdfjs/             pdf.js 4.10.38 (Mozilla, Apache-2.0), copie locale
├── scripts/
│   └── serveur.py         Serveur local : app + réception des sauvegardes chiffrées
├── sauvegardes/           Sauvegardes chiffrées (créé au premier enregistrement, jamais publié)
└── icons/                 SVG + PNG 192/512/maskable/apple-touch
```

## Données

- Stockées uniquement dans IndexedDB (`notre-budget`), dans le navigateur.
- Montants en **centimes** (entiers) : utiliser `toCents()` / `fromCents()`.
- Faire régulièrement un export avec `exportAll()` (sauvegarde JSON).
- Modifier le schéma : incrémenter `DB_VERSION` et ajouter `MIGRATIONS[n]`.
- Ajouter un fichier JS : l'ajouter aussi à `APP_SHELL` dans `service-worker.js` et incrémenter `CACHE_VERSION`.

## Import de relevés PDF

- Le PDF est lu dans le navigateur ; seul le texte est extrait (pas d'OCR : un relevé scanné n'est pas lisible).
- Les opérations passent par un tableau de validation ; rien n'est enregistré avant « Valider et importer ».
- Quand vous changez une catégorie, la correction est retenue (table `rules`) pour les imports suivants.
- Les opérations déjà présentes en base sont détectées et décochées.
- Ajouter des enseignes : dictionnaire `KEYWORDS` dans `js/import/categorizer.js`.

## Tableau de bord « Le mois »

- **Reste à vivre** = revenus du mois + rentrées mensualisées attendues −
  dépenses déjà passées − dépenses mensualisées à venir − épargne du mois. Il se lit dans la barre du mois : longueur totale =
  revenus ; plein = dépensé ; hachuré = à venir ; bleu = épargné ; vert = libre
  (le montant y est écrit). L'épargne est nette : un retrait sur l'épargne
  (rentrée classée « Épargne ») s'ajoute au libre (« + X € repris sur l'épargne »).
- **Profils et vues** : par défaut, l'app s'affiche en mode solo (« Moi »).
  Vous pouvez ajouter un second profil (« + Profil ») et/ou un compte partagé
  (« + Compte commun ») pour afficher chaque vue séparément ou la vue globale
  (« Tous »). Double-cliquez sur un nom dans le sélecteur pour le renommer
  (Entrée ou clic ailleurs pour valider, Échap pour annuler ; F2 au clavier).
  Réglage `profileNames` et `activeProfiles` ; les noms changent partout, y
  compris dans l'écran d'import.
- **Catégories & enveloppes** : pour chaque catégorie, le dépensé du mois,
  l'écart avec la moyenne des 3 derniers mois importés (à venir compris) et
  l'enveloppe (vert < 75 %, orange 75–100 %, rouge au-delà). « Ajuster les
  enveloppes » règle tout d'un coup ; « Compléter d'après mes derniers mois »
  remplit les enveloppes vides avec la moyenne arrondie à la dizaine.
  En vue « Tous », ce sont les enveloppes globales (profil `tous`) ; à défaut,
  la somme des enveloppes de chaque profil.
- Cliquer une catégorie affiche son **évolution sur 6 mois** (avec le repère
  de l'enveloppe) et filtre les **opérations**.
- **Échéances mensualisées** : une dépense ou une rentrée (salaire…)
  mensualisée lors des 2 mois précédents et pas encore vue ce mois-ci (même
  sens, même commerçant/émetteur, même profil) est :
  - **à venir** si sa date tombe après le dernier jour couvert par les relevés
    importés → comptée dans le reste à vivre (dépense déduite, rentrée ajoutée) ;
  - **non retrouvée** si sa date est passée → signalée, **pas** déduite.
  - **déjà passée** si une opération du même commerçant (même sens, même
    profil) **et de montant comparable** (au plus du simple au double)
    figure déjà dans le mois → déjà comptée, listée pour mémoire. Plusieurs
    virements permanents au même bénéficiaire sont suivis séparément, chacun
    associé à l'opération de montant le plus proche ;
  - **ignorée** après « Pas ce mois-ci » (réglage `recurringSkips`), avec
    « Rétablir ».
  « Ne plus mensualiser » décoche l'opération d'origine. L'épargne mensualisée
  est aussi anticipée (elle sort du libre).
- **Épargne** (catégorie de nature `epargne`) : exclue des dépenses, enveloppes,
  répartition et évolution, mais retirée du libre (segment « épargné »).
- **Courses communes** : les virements vers un compte commun destiné aux
  courses partagées sont classés dans une catégorie de dépense dédiée
  (migration v4). Attention : si vous importez aussi les relevés du compte
  commun, ses achats de courses feraient double emploi avec ces virements.
- **Répartition** : les 5 plus grosses catégories + « Autres », palette
  vérifiée pour le daltonisme ; la légende donne toujours nom, montant et part.
- **Filtrer les opérations** : recherche, type (dépenses, rentrées, épargne),
  catégorie, profil, mensualisées ; le total des opérations affichées est
  indiqué. Cliquer une part de l'anneau, une ligne de sa légende, une
  catégorie du tableau ou une partie de la barre du mois (dépensé, épargné ;
  « à venir » mène aux échéances) filtre la liste.
- **Modifier les opérations** : le crayon en haut de la liste passe toutes les
  lignes en édition (date, nom affiché, catégorie, sens, profil, montant,
  « Mensualiser », corbeille). Rien n'est enregistré avant « Valider » ;
  « Annuler » abandonne tout. Après validation, « Annuler » rétablit l'état
  précédent (catégories retenues comprises). Le libellé du relevé reste intact
  (détection des doublons à l'import).
- Les calculs sont testables sans navigateur : `js/dashboard/month-model.js`
  n'accède ni au DOM ni à la base.

## Sauvegarde et iPhone

- Les données vivent dans **IndexedDB** du navigateur :
  ni fichier, ni cache. Chaque appareil, navigateur et adresse a sa propre base.
- **Sauvegarde automatique (Mac)** : onglet « Sauvegarde », choisissez un mot
  de passe (8 caractères minimum, jamais enregistré : seule une clé dérivée
  non exportable reste dans le navigateur). Ensuite, chaque écriture en base
  déclenche (2,5 s plus tard, regroupé) une sauvegarde **chiffrée AES-256-GCM**
  (clé PBKDF2-SHA-256, 600 000 itérations) envoyée au serveur local, qui
  l'écrit dans `sauvegardes/mon-budget-sauvegarde.json` et garde les 20
  dernières versions dans `sauvegardes/historique/`. Le serveur refuse toute
  sauvegarde non chiffrée.
- **Vers l'iPhone** : AirDrop du fichier (bouton « Envoyer par AirDrop… » si le
  navigateur propose le partage, sinon Finder › clic droit › Partager ›
  AirDrop). Sur l'iPhone, dans l'app installée sur l'écran d'accueil :
  « Sauvegarde » › « Choisir le fichier… » › mot de passe › « Remplacer les
  données de cet appareil ».
- Les réglages propres à l'appareil (clé, date de dernière sauvegarde) ne
  sont jamais exportés ni écrasés par une restauration.

## Publier l'app sur Vercel

L'app est 100 % statique : Vercel ne sert que le code. Les données restent
dans le navigateur de chaque appareil ; la restauration se fait à partir du
fichier chiffré reçu par AirDrop. `.vercelignore` exclut `sauvegardes/`,
`scripts/` et les notes de design ; `vercel.json` ajoute des en-têtes de
sécurité et désactive le cache du service worker.

```sh
cd ~/Documents/Finance
npx vercel            # première fois : connexion au compte, puis aperçu
npx vercel --prod     # mise en ligne
```


## Livrets (écran « Épargne »)

- Vous saisissez le solde affiché par la banque à une date ; l'app reconstitue
  l'historique avec les virements d'épargne des relevés importés (libellé
  contenant « LIVRET A » ou « LEP », ou rattachés à la main).
- Intérêts calculés par quinzaine, comme les banques, versés au 31 décembre.
- Données publiques mises à jour automatiquement (`js/epargne/live-data.js`,
  toutes les 12 h, désactivable dans « Taux et inflation ») :
  - INSEE, API Séries chronologiques (accès libre, CORS) : séries 011814632 (IPC),
    011812232 (IPCH), 011814145 (sous-jacente), 011814640 (moyenne annuelle) ;
  - BCE : €STR ;
  - taux du Livret A et du LEP : `scripts/serveur.py` lit service-public.gouv.fr
    (`/api/taux-livrets`) ; sans serveur local, la Caisse des Dépôts (en retard).
  Les valeurs de `livret-rates.js` restent le filet de sécurité hors ligne.
  Si l'INSEE change de base (comme en janvier 2026), mettre à jour `INSEE_SERIES`.
- **Matelas de sécurité** : solde des livrets ÷ dépenses mensuelles moyennes
  mesurées dans les relevés (titulaires des livrets, 3 derniers mois complets,
  hors épargne et virements). Affiché sous le tableau des livrets et dans le
  widget « Matelas de sécurité » : objectifs 3 et 6 mois en euros, ce qui
  manque ou dépasse, et le temps pour atteindre 3 mois au rythme des
  versements réguliers.
- **PEA** (repères de l'onglet « Investir ») : rendement moyen des indices sur 5 ou 10 ans (taux annuel
  composé, en euros, dividendes réinvestis, hors frais), après inflation et
  net de prélèvements sociaux ; imposition moyenne selon la durée de détention
  (avant 5 ans : 31,4 % des gains et clôture ; après : 18,6 % de prélèvements
  sociaux), comparée au compte-titres. Un tableau de bord « Épargne » déjà
  personnalisé reçoit les nouveaux widgets à la fin (réglage `epargneWidgetsKnown`).
- **Votre PEA** (onglet « Investir », « Ajouter un PEA », un par personne, réglage `peaAccounts`) :
  mois d'ouverture, valeur de chaque ligne d'ETF (catalogue `ETFS` de `pea.js`
  ou « Autre ETF » rattaché à l'indice le plus proche), frais, total versé et
  versement mensuel. La carte affiche plafond des versements, plus-value
  latente, date de la fiscalité allégée et frais ; la projection (5, 10 ou
  20 ans) se calcule mois par mois avec un versement mensuel modifiable sur
  place, selon trois hypothèses (passé 10 ans, prudent 5 %, pessimiste 2 %,
  frais déduits), puis donne les prélèvements et le net au retrait.
- **Objectifs** (onglet « Investir », réglage `objectifs`) : montant visé,
  échéance, déjà mis de côté, versement mensuel. Chaque objectif est confronté
  à quatre stratégies (livrets ; prudente 25 %, équilibrée 50 %, dynamique
  100 % d'actions mondiales dans un PEA) : valeur nette à l'échéance, écart,
  versement nécessaire, et perte possible si une chute comme 2008 (−40 %)
  survenait juste avant. Stratégie conseillée selon le temps restant (livrets
  sous 3 ans, prudente 3–5, équilibrée 5–8, dynamique au-delà). Actions à 5 %
  par an ou au rendement des 10 dernières années, frais des ETF déduits ;
  livrets au taux du Livret A.
- **Export Excel de l'onglet « Investir »** : indices, fiscalité du PEA, une
  feuille par PEA et une feuille « Objectifs » (chaque objectif face aux quatre
  stratégies, écart en formule). L'export « Épargne » contient aussi ces feuilles.
- **Repères** (onglet « Investir ») : rendement des indices et fiscalité du PEA
  (ex-widget « PEA » de l'écran Épargne).
- Valeurs de référence des widgets, à rafraîchir de temps en temps dans
  `livret-rates.js` : `INFLATION_INDICES` (IPCH, sous-jacente), `ANNUAL_INFLATION`
  (moyenne de chaque année, en janvier), `BENCHMARKS` (fonds euros chaque début
  d'année, €STR), `TAX` (loi de financement de la Sécurité sociale).
  Chaque janvier, ajouter l'année écoulée à `INDEX_RETURNS` dans `pea.js`
  (fiches MSCI en EUR « net returns », Euronext pour le CAC 40 GR).
