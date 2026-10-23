/**
 * Schéma de la base locale « Mon Budget ».
 *
 * Conventions :
 *  - Les montants sont stockés en CENTIMES (entiers) pour éviter les erreurs
 *    d'arrondi des flottants (0.1 + 0.2 !== 0.3). 12,50 € → 1250.
 *  - Les dates sont des chaînes ISO "YYYY-MM-DD" ; on stocke aussi "month"
 *    ("YYYY-MM") pour indexer et agréger rapidement par mois.
 *  - Les identifiants sont des UUID (crypto.randomUUID) : stables lors d'un
 *    export/import entre appareils, contrairement aux auto-incréments.
 */

// Identifiant interne stable de la base IndexedDB (conservé pour compatibilité des bases et sauvegardes).
export const DB_NAME = 'notre-budget';

// Incrémenter à chaque changement de schéma et ajouter l'étape dans MIGRATIONS.
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
 *   month: string         "2026-10"         (dérivé de date, indexé)
 *   amount: number        centimes, toujours positif ; le sens est porté par `type`
 *   type: 'entree' | 'sortie'
 *   categoryId: string    → Category.id
 *   label: string         libellé original (relevé bancaire)
 *   note: string          libellé personnalisé, optionnel
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
 *                         épargne et transfert : mouvements entre vos comptes,
 *                         hors dépenses, budgets et reste à vivre
 *   icon: string          emoji
 *   color: string         couleur hex
 *   group: 'base' | 'etendue' | 'perso'
 *   order: number
 *   archived: boolean
 * }
 *
 * Budget {               « enveloppe » mensuelle d'une catégorie
 *   id: string            UUID
 *   categoryId: string    → Category.id
 *   profile: 'moi' | 'compagne' | 'commun' | 'tous'   ('tous' = enveloppe globale)
 *   monthlyLimit: number  centimes
 *   alertThreshold: number  0–1, ex. 0.8 = alerte à 80 %
 * }  — unique sur [categoryId, profile]
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
 * Setting { key: string, value: any }   — ex. noms affichés des profils
 *
 * Rule {                  catégorisation apprise lors des imports (v2)
 *   key: string           clé marchand normalisée, ex. "BOULANGERIE MARIE"
 *   categoryId: string    → Category.id
 *   recurring: boolean
 *   hits: number          nombre de fois où la règle a été confirmée
 *   updatedAt: string
 * }
 *
 * Livret {                livret réglementé suivi dans l'écran « Épargne » (v5)
 *   id: string            UUID
 *   product: 'livretA' | 'lep'
 *   profile: 'moi' | 'compagne'   titulaire (un seul livret de chaque sorte par personne)
 *   anchor: { date: "YYYY-MM-DD", balance: number }   solde connu (centimes), saisi par vous
 *   monthlyPlan: number|null      versement mensuel prévu (centimes) ; null = d'après les relevés
 *   keywords: string[]    mots du libellé qui désignent ce livret dans les virements
 *   createdAt: string
 *   updatedAt: string
 * }
 *
 * Réglages liés : livretAssign { [transactionId]: livretId | 'aucun' } (rattachements
 * faits à la main), livretRates [{ from, livretA, lep }] (taux saisis),
 * inflation { rate, month }.
 */

/**
 * Migrations successives. MIGRATIONS[n] fait passer la base de la version n-1 à n.
 * Ne jamais modifier une migration déjà livrée : en ajouter une nouvelle.
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
    // Index composés pour les écrans de suivi mensuel
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

  // Virements vers le compte commun : transfert entre comptes
  3(db, tx) {
    const categories = tx.objectStore(STORES.CATEGORIES);
    const request = categories.get('commun');
    request.onsuccess = () => {
      if (request.result) categories.put({ ...request.result, kind: 'transfert' });
    };
  },

  // Virements vers le compte commun comptés comme dépense commune
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
        icon: c.icon === '🤝' ? '🛒' : c.icon,
      });
    };
  },

  5(db) {
    const livrets = db.createObjectStore(STORES.LIVRETS, { keyPath: 'id' });
    livrets.createIndex('profile', 'profile');
  },
};

/** Catégories hors budget : ni dépense, ni revenu, ni reste à vivre. */
export const OFF_BUDGET_KINDS = Object.freeze(['epargne', 'transfert']);
