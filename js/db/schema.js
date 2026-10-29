/**
 * Schema de la base locale « Mon Budget ».
 *
 * Conventions :
 *  - Les montants sont stockes en CENTIMES (entiers) pour eviter les erreurs
 *    d'arrondi des flottants (0.1 + 0.2 !== 0.3). 12,50 € -> 1250.
 *  - Les dates sont des chaines ISO "YYYY-MM-DD" ; on stocke aussi "month"
 *    ("YYYY-MM") pour indexer et agreger rapidement par mois.
 *  - Les identifiants sont des UUID (crypto.randomUUID) : stables lors d'un
 *    export/import entre appareils, contrairement aux auto-increments.
 */

// Identifiant interne stable de la base IndexedDB (conserve pour compatibilite des bases et sauvegardes).
export const DB_NAME = 'notre-budget';

// Incrementer a chaque changement de schema et ajouter l'etape dans MIGRATIONS.
export const DB_VERSION = 5;

export const STORES = Object.freeze({
  TRANSACTIONS: 'transactions',
  CATEGORIES: 'categories',
  BUDGETS: 'budgets',
  PROJECTS: 'projects',
  SETTINGS: 'settings',
  RULES: 'rules',
  LIVRETS: 'livrets',
});

export const TRANSACTION_TYPES = Object.freeze({
  INCOME: 'entree',
  EXPENSE: 'sortie',
});

export const PROFILES = Object.freeze({
  ME: 'moi',
  PARTNER: 'compagne',
  SHARED: 'commun',
});

/**
 * Forme des enregistrements (documentation ; IndexedDB ne valide pas les champs).
 *
 * Transaction {
 *   id: string            UUID
 *   date: string          "2026-10-20"
 *   month: string         "2026-10"         (derive de date, indexe)
 *   amount: number        centimes, toujours positif ; le sens est porte par `type`
 *   type: 'entree' | 'sortie'
 *   categoryId: string    -> Category.id
 *   label: string         libelle original (releve bancaire)
 *   note: string          libelle personnalise, optionnel
 *   recurring: boolean
 *   profile: 'moi' | 'compagne' | 'commun'
 *   createdAt: string     ISO datetime
 *   updatedAt: string     ISO datetime
 * }
 *
 * Category {
 *   id: string            slug stable, ex. "courses"
 *   name: string
 *   kind: 'sortie' | 'entree' | 'epargne' | 'transfert'
 *   icon: string
 *   color: string         couleur hex
 *   group: 'base' | 'etendue' | 'perso'
 *   order: number
 *   archived: boolean
 * }
 *
 * Budget {               « enveloppe » mensuelle d'une categorie
 *   id: string            UUID
 *   categoryId: string    -> Category.id
 *   profile: 'moi' | 'compagne' | 'commun' | 'tous'   ('tous' = enveloppe globale)
 *   monthlyLimit: number  centimes
 *   alertThreshold: number  0 a 1, ex. 0.8 = alerte a 80 %
 * }  unique sur [categoryId, profile]
 *
 * Project {
 *   id: string            UUID
 *   name: string          ex. "Voyage au Japon"
 *   icon: string
 *   color: string
 *   targetAmount: number  centimes
 *   currentAmount: number centimes
 *   deadline: string|null "YYYY-MM-DD"
 *   profile: 'moi' | 'compagne' | 'commun'
 *   status: 'actif' | 'atteint' | 'archive'
 *   createdAt: string
 *   updatedAt: string
 * }
 *
 * Setting { key: string, value: any }   ex. noms affiches des profils
 *
 * Rule {                  categorisation apprise lors des imports (v2)
 *   key: string           cle marchand normalisee, ex. "BOULANGERIE MARIE"
 *   categoryId: string    -> Category.id
 *   recurring: boolean
 *   hits: number          nombre de fois ou la regle a ete confirmee
 *   updatedAt: string
 * }
 *
 * Livret {                livret reglemente suivi dans l'ecran « Epargne » (v5)
 *   id: string            UUID
 *   product: 'livretA' | 'lep'
 *   profile: 'moi' | 'compagne'   titulaire (un seul livret de chaque sorte par personne)
 *   anchor: { date: "YYYY-MM-DD", balance: number }   solde connu (centimes), saisi par vous
 *   monthlyPlan: number|null      versement mensuel prevu (centimes) ; null = d'apres les releves
 *   keywords: string[]    mots du libelle qui designent ce livret dans les virements
 *   createdAt: string
 *   updatedAt: string
 * }
 */

/**
 * Migrations successives. MIGRATIONS[n] fait passer la base de la version n-1 a n.
 * Ne jamais modifier une migration deja livree : en ajouter une nouvelle.
 */
export const MIGRATIONS = {
  1(db) {
    const tx = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
    tx.createIndex('date', 'date');
    tx.createIndex('month', 'month');
    tx.createIndex('categoryId', 'categoryId');
    tx.createIndex('profile', 'profile');
    tx.createIndex('type', 'type');
    tx.createIndex('recurring', 'recurring');
    tx.createIndex('month_category', ['month', 'categoryId']);
    tx.createIndex('month_profile', ['month', 'profile']);

    const cat = db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
    cat.createIndex('kind', 'kind');
    cat.createIndex('order', 'order');

    const bud = db.createObjectStore(STORES.BUDGETS, { keyPath: 'id' });
    bud.createIndex('categoryId', 'categoryId');
    bud.createIndex('category_profile', ['categoryId', 'profile'], { unique: true });

    const proj = db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
    proj.createIndex('status', 'status');
    proj.createIndex('profile', 'profile');

    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
  },

  2(db) {
    const rules = db.createObjectStore(STORES.RULES, { keyPath: 'key' });
    rules.createIndex('categoryId', 'categoryId');
  },

  3(db, tx) {
    const categories = tx.objectStore(STORES.CATEGORIES);
    const request = categories.get('commun');
    request.onsuccess = () => {
      if (request.result) categories.put({ ...request.result, kind: 'transfert' });
    };
  },

  4(db, tx) {
    const categories = tx.objectStore(STORES.CATEGORIES);
    const request = categories.get('commun');
    request.onsuccess = () => {
      const c = request.result;
      if (!c) return;
      categories.put({
        ...c,
        kind: 'sortie',
        name: c.name === 'Commun' ? 'Courses communes' : c.name,
        icon: '',
      });
    };
  },

  5(db) {
    const livrets = db.createObjectStore(STORES.LIVRETS, { keyPath: 'id' });
    livrets.createIndex('profile', 'profile');
  },
};

/** Categories hors budget : ni depense, ni revenu, ni reste a vivre. */
export const OFF_BUDGET_KINDS = Object.freeze(['epargne', 'transfert']);
