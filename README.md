# Notre Budget

WebApp de budget à deux, 100 % locale et hors-ligne, installable en PWA.

## Lancer en local (Mac)

Double-cliquez sur **« Lancer Notre Budget.command »** dans le Finder, ou :

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
│   └── import.css         Zone de dépôt + tableau de validation
├── js/
│   ├── app.js             Démarrage : service worker, base, navigation #/mois · #/importer
│   ├── backup/
│   │   ├── backup-core.js     Chiffrement AES-GCM, sauvegarde automatique, partage
│   │   └── backup-view.js     Onglet « Sauvegarde » (mot de passe, AirDrop, restauration)
│   ├── dashboard/
│   │   ├── month-model.js     Calculs : reste à vivre, récurrentes à venir, jauges, répartition
│   │   ├── dashboard-view.js  Écran « Le mois » (lecture de la base, rendu, interactions)
│   │   └── donut.js           Anneau de répartition en SVG
│   ├── db/
│   │   ├── schema.js      Stores, index, constantes, migrations
│   │   ├── seed.js        Catégories et réglages par défaut
│   │   └── database.js    Ouverture, CRUD, export/import JSON
│   └── import/
│       ├── import-view.js       Dépôt PDF → tableau de validation → base
│       ├── pdf-reader.js        Ouverture du PDF avec pdf.js
│       ├── pdf-layout.js        Reconstruction des lignes + positions X
│       ├── statement-parser.js  Détection des opérations (dates, montants, colonnes)
│       ├── categorizer.js       Mots-clés + règles apprises
│       └── ai/
│           ├── ai-shared.js     Modèles, prompt « QCM », calibration
│           ├── ai-client.js     Dialogue avec le worker (une analyse à la fois)
│           └── ai-worker.js     Chargement du modèle et calcul, hors du fil principal
├── lib/pdfjs/             pdf.js 4.10.38 (Mozilla, Apache-2.0), copie locale
├── lib/transformers/      Transformers.js 4.2.0 (Apache-2.0) + ONNX Runtime Web (MIT)
├── models/                Modèles d'IA (non versionnés, voir ci-dessous)
├── scripts/
│   ├── serveur.py               Serveur local : app + réception des sauvegardes chiffrées
│   └── installer-modele-ia.sh   Téléchargement unique des modèles
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

## IA locale (catégorisation)

Les opérations que ni les mots-clés ni vos règles ne reconnaissent sont
proposées à un modèle de langage qui tourne **dans le navigateur**, sans
aucune connexion : le modèle est lu depuis `models/` et le worker refuse tout
téléchargement distant.

### Installer le modèle (une seule fois)

```sh
./scripts/installer-modele-ia.sh          # Qwen3.5-4B, ≈ 3,1 Go (recommandé, carte graphique)
./scripts/installer-modele-ia.sh leger    # Qwen3.5-2B, ≈ 1,5 Go (repli sans WebGPU)
./scripts/installer-modele-ia.sh tout     # les deux
```

### Fonctionnement

- Modèles essayés dans l'ordre (`AI_MODELS` dans `ai-shared.js`) : 4B sur la
  carte graphique (WebGPU), puis 2B sur la carte graphique, puis 2B sur le
  processeur. Le 4B ne tient pas en WebAssembly (limite de 4 Go).
- Le modèle ne rédige pas de réponse : chaque catégorie reçoit une lettre et on
  lit la probabilité qu'il donne à chacune (un seul passage par opération).
- **Calibration** : on mesure d'abord ce que le modèle répond face à une
  opération vide (« N/A »), puis on retire ce biais. Sans elle, il répond
  « courses » ou « autre » dès qu'il hésite.
- Sous `AI_CONFIDENT` (50 %), la ligne est marquée « IA hésitante · à vérifier ».
- Le modèle est mis en cache par le service worker dans un cache séparé
  (`notre-budget-ia`), conservé lors des mises à jour de l'app. Pour forcer
  un nouveau modèle : vider ce cache dans les outils de développement.
- Nécessite un Mac récent (WebGPU : Chrome, Brave, Edge ou Safari 26+).
  Sur iPhone (écran tactile), l'option est décochée par défaut : le modèle
  y est trop lourd. Les mots-clés et les règles apprises restent actifs.

## Tableau de bord « Le mois »

- **Reste à vivre** = revenus du mois + rentrées mensualisées attendues −
  dépenses déjà passées − dépenses mensualisées à venir − épargne du mois. Il se lit dans la barre du mois : longueur totale =
  revenus ; plein = dépensé ; hachuré = à venir ; bleu = épargné ; vert = libre
  (le montant y est écrit). L'épargne est nette : un retrait sur l'épargne
  (rentrée classée « Épargne ») s'ajoute au libre (« + X € repris sur l'épargne »).
- **Noms des personnes** : double-cliquez sur « Moi », « Ma compagne » ou
  « Commun » dans le sélecteur de vue pour le renommer (Entrée ou clic ailleurs
  pour valider, Échap pour annuler ; F2 au clavier). Réglage `profileNames` ;
  les noms changent partout, y compris dans l'écran d'import.
- **Catégories & enveloppes** : pour chaque catégorie, le dépensé du mois,
  l'écart avec la moyenne des 3 derniers mois importés (à venir compris) et
  l'enveloppe (vert < 75 %, orange 75–100 %, rouge au-delà). « Ajuster les
  enveloppes » règle tout d'un coup ; « Compléter d'après mes derniers mois »
  remplit les enveloppes vides avec la moyenne arrondie à la dizaine.
  En vue « Tous », ce sont les enveloppes du foyer (profil `tous`) ; à défaut,
  la somme des enveloppes de chacun.
- Cliquer une catégorie affiche son **évolution sur 6 mois** (avec le repère
  de l'enveloppe) et filtre les **opérations**.
- **Échéances mensualisées** : une dépense ou une rentrée (salaire…)
  mensualisée lors des 2 mois précédents et pas encore vue ce mois-ci (même
  sens, même commerçant/émetteur, même profil) est :
  - **à venir** si sa date tombe après le dernier jour couvert par les relevés
    importés → comptée dans le reste à vivre (dépense déduite, rentrée ajoutée) ;
  - **non retrouvée** si sa date est passée → signalée, **pas** déduite.
  - **déjà passée** si une opération du même commerçant (même sens, même
    personne) **et de montant comparable** (au plus du simple au double)
    figure déjà dans le mois → déjà comptée, listée pour mémoire. Plusieurs
    virements permanents au même bénéficiaire sont suivis séparément, chacun
    associé à l'opération de montant le plus proche ;
  - **ignorée** après « Pas ce mois-ci » (réglage `recurringSkips`), avec
    « Rétablir ».
  « Ne plus mensualiser » décoche l'opération d'origine. L'épargne mensualisée
  est aussi anticipée (elle sort du libre).
- **Épargne** (catégorie de nature `epargne`) : exclue des dépenses, enveloppes,
  répartition et évolution, mais retirée du libre (segment « épargné »).
- **Courses communes** : les virements vers le compte commun
  financent les courses du couple (soirs, week-ends) ; c'est une catégorie de
  dépense comme les autres (migration v4). « Courses » = les déjeuners en solo.
  Attention : si vous importez aussi les relevés du compte commun, ses achats
  de courses feraient double emploi avec ces virements.
- **Répartition** : les 5 plus grosses catégories + « Autres », palette
  vérifiée pour le daltonisme ; la légende donne toujours nom, montant et part.
- **Filtrer les opérations** : recherche, type (dépenses, rentrées, épargne),
  catégorie, personne, mensualisées ; le total des opérations affichées est
  indiqué. Cliquer une part de l'anneau, une ligne de sa légende, une
  catégorie du tableau ou une partie de la barre du mois (dépensé, épargné ;
  « à venir » mène aux échéances) filtre la liste.
- **Modifier les opérations** : le crayon en haut de la liste passe toutes les
  lignes en édition (date, nom affiché, catégorie, sens, personne, montant,
  « Mensualiser », corbeille). Rien n'est enregistré avant « Valider » ;
  « Annuler » abandonne tout. Après validation, « Annuler » rétablit l'état
  précédent (catégories retenues comprises). Le libellé du relevé reste intact
  (détection des doublons à l'import).
- Les calculs sont testables sans navigateur : `js/dashboard/month-model.js`
  n'accède ni au DOM ni à la base.

## Sauvegarde et iPhone

- Les données vivent dans **IndexedDB** (base `notre-budget`) du navigateur :
  ni fichier, ni cache. Chaque appareil, navigateur et adresse a sa propre base.
- **Sauvegarde automatique (Mac)** : onglet « Sauvegarde », choisissez un mot
  de passe (8 caractères minimum, jamais enregistré : seule une clé dérivée
  non exportable reste dans le navigateur). Ensuite, chaque écriture en base
  déclenche (2,5 s plus tard, regroupé) une sauvegarde **chiffrée AES-256-GCM**
  (clé PBKDF2-SHA-256, 600 000 itérations) envoyée au serveur local, qui
  l'écrit dans `sauvegardes/notre-budget-sauvegarde.json` et garde les 20
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
fichier chiffré reçu par AirDrop. `.vercelignore` exclut `models/`,
`sauvegardes/`, `scripts/` et les notes de design ; `vercel.json` ajoute des
en-têtes de sécurité et désactive le cache du service worker.

```sh
cd ~/Documents/Finance
npx vercel            # première fois : connexion au compte, puis aperçu
npx vercel --prod     # mise en ligne
```

Sur Vercel, l'IA locale n'est pas disponible (modèle non publié) : importez
vos relevés sur le Mac, puis envoyez la sauvegarde à l'iPhone.

