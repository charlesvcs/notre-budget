/**
 * Accès à la base IndexedDB locale — wrapper natif, sans dépendance.
 * Aucune donnée ne quitte le navigateur.
 */
import {
  DB_NAME, DB_VERSION, STORES, MIGRATIONS, TRANSACTION_TYPES, PROFILES,
} from './schema.js';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './seed.js';

let dbPromise = null;

/** Émis sur window quand des opérations, budgets… changent (import, édition). */
export const DATA_CHANGED = 'notre-budget:donnees';
export const notifyDataChanged = () => window.dispatchEvent(new CustomEvent(DATA_CHANGED));

/**
 * Émis après TOUTE écriture en base (sauf réglages propres à l'appareil) :
 * déclenche la sauvegarde automatique.
 */
export const DATA_WRITTEN = 'notre-budget:ecriture';
const emitWrite = () => window.dispatchEvent(new CustomEvent(DATA_WRITTEN));

/**
 * Réglages propres à cet appareil : jamais exportés ni écrasés par une
 * restauration (clé de chiffrement, état de la sauvegarde automatique).
 */
export const LOCAL_ONLY_SETTINGS = new Set(['backupKey', 'backupLastAt']);
const isLocalOnly = (storeName, key) => storeName === STORES.SETTINGS && LOCAL_ONLY_SETTINGS.has(key);

// ——— Utilitaires ———————————————————————————————————————————————

/** Transforme une IDBRequest en Promise. */
function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Résout quand la transaction est validée (commit), rejette si elle échoue. */
function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction annulée', 'AbortError'));
  });
}

const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

/** Convertit des euros (nombre, "12,50", "1 234,56", "1.234,56 €") en centimes entiers. */
export function toCents(euros) {
  let n = euros;
  if (typeof euros === 'string') {
    let s = euros.replace(/[\s€]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    n = s === '' ? NaN : Number(s);
  }
  if (!Number.isFinite(n)) throw new TypeError(`Montant invalide : ${euros}`);
  return Math.round(n * 100);
}

export const fromCents = (cents) => cents / 100;

// ——— Ouverture & migrations ————————————————————————————————————

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      for (let v = event.oldVersion + 1; v <= DB_VERSION; v++) {
        MIGRATIONS[v]?.(db, request.transaction);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Si un autre onglet ouvre une version plus récente, on libère la base.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      console.warn('[db] Mise à jour bloquée : fermez les autres onglets de l\'application.');
  });

  return dbPromise;
}

/**
 * Insère les réglages par défaut si la base est vierge, et les catégories par
 * défaut qui manquent (y compris celles ajoutées après la création de la base).
 * Une catégorie existante n'est jamais modifiée.
 */
async function seedDefaults(db) {
  const tx = db.transaction([STORES.CATEGORIES, STORES.SETTINGS], 'readwrite');
  const categories = tx.objectStore(STORES.CATEGORIES);
  const settings = tx.objectStore(STORES.SETTINGS);

  const existing = new Set(await req(categories.getAllKeys()));
  DEFAULT_CATEGORIES.filter((c) => !existing.has(c.id)).forEach((c) => categories.put(c));
  if (existing.size === 0) {
    DEFAULT_SETTINGS.forEach((s) =>
      settings.put(s.key === 'seededAt' ? { ...s, value: nowIso() } : s));
  }
  return done(tx);
}

/**
 * Point d'entrée : ouvre la base, applique les migrations, insère les
 * données par défaut et demande un stockage persistant.
 */
export async function initDatabase() {
  const db = await openDB();
  await seedDefaults(db);

  let persisted = false;
  if (navigator.storage?.persist) {
    persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  }
  return { db, persisted };
}

// ——— CRUD générique —————————————————————————————————————————————

async function store(name, mode = 'readonly') {
  const db = await openDB();
  const tx = db.transaction(name, mode);
  return { tx, os: tx.objectStore(name) };
}

export async function getAll(storeName) {
  const { os } = await store(storeName);
  return req(os.getAll());
}

export async function getById(storeName, id) {
  const { os } = await store(storeName);
  return req(os.get(id));
}

export async function getByIndex(storeName, indexName, query) {
  const { os } = await store(storeName);
  return req(os.index(indexName).getAll(query));
}

export async function put(storeName, record) {
  const { tx, os } = await store(storeName, 'readwrite');
  os.put(record);
  await done(tx);
  if (!isLocalOnly(storeName, record.key)) emitWrite();
  return record;
}

export async function remove(storeName, id) {
  const { tx, os } = await store(storeName, 'readwrite');
  os.delete(id);
  await done(tx);
  if (!isLocalOnly(storeName, id)) emitWrite();
}

// ——— Validation ————————————————————————————————————————————————

const PROFILE_VALUES = Object.values(PROFILES);
const TYPE_VALUES = Object.values(TRANSACTION_TYPES);

function assert(cond, message) {
  if (!cond) throw new TypeError(message);
}

function assertCents(value, field) {
  assert(Number.isInteger(value) && value >= 0, `${field} doit être un entier ≥ 0 (centimes)`);
}

// ——— Transactions ——————————————————————————————————————————————

function buildTransaction(input, existing = null) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(input.date), 'date attendue au format YYYY-MM-DD');
  assertCents(input.amount, 'amount');
  assert(TYPE_VALUES.includes(input.type), `type invalide : ${input.type}`);
  assert(PROFILE_VALUES.includes(input.profile), `profil invalide : ${input.profile}`);
  assert(typeof input.categoryId === 'string', 'categoryId requis');

  return {
    label: '',
    note: '',
    recurring: false,
    ...existing,
    ...input,
    id: input.id ?? uuid(),
    month: input.date.slice(0, 7),
    recurring: Boolean(input.recurring ?? existing?.recurring),
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

export async function saveTransaction(input) {
  const existing = input.id ? await getById(STORES.TRANSACTIONS, input.id) : null;
  return put(STORES.TRANSACTIONS, buildTransaction(input, existing));
}

/** Insère plusieurs nouvelles transactions en une seule transaction : tout ou rien. */
export async function saveTransactions(inputs) {
  const records = inputs.map((input) => buildTransaction(input)); // valide tout avant d'écrire
  const { tx, os } = await store(STORES.TRANSACTIONS, 'readwrite');
  records.forEach((r) => os.put(r));
  await done(tx);
  emitWrite();
  return records;
}

export const getTransactionsByMonth = (month) =>
  getByIndex(STORES.TRANSACTIONS, 'month', month);

export const getTransactionsByMonthAndCategory = (month, categoryId) =>
  getByIndex(STORES.TRANSACTIONS, 'month_category', [month, categoryId]);

export const getTransactionsByMonthAndProfile = (month, profile) =>
  getByIndex(STORES.TRANSACTIONS, 'month_profile', [month, profile]);

export const deleteTransaction = (id) => remove(STORES.TRANSACTIONS, id);

/** Dernier mois « YYYY-MM » contenant au moins une opération (ou null). */
export async function getLatestMonth() {
  const { os } = await store(STORES.TRANSACTIONS);
  const cursor = await req(os.index('month').openKeyCursor(null, 'prev'));
  return cursor?.key ?? null;
}

// ——— Catégories ————————————————————————————————————————————————

export async function getCategories({ includeArchived = false } = {}) {
  const all = await getByIndex(STORES.CATEGORIES, 'order');
  return includeArchived ? all : all.filter((c) => !c.archived);
}

export const saveCategory = (category) => put(STORES.CATEGORIES, category);

// ——— Budgets ———————————————————————————————————————————————————

/** Une enveloppe vaut pour un profil, ou pour tout le foyer (« tous »). */
export const HOUSEHOLD = 'tous';

/** Crée ou met à jour l'enveloppe mensuelle d'une catégorie pour un profil ou le foyer (unique). */
export async function setBudget({ categoryId, profile = PROFILES.SHARED, monthlyLimit, alertThreshold = 0.8 }) {
  assertCents(monthlyLimit, 'monthlyLimit');
  assert(PROFILE_VALUES.includes(profile) || profile === HOUSEHOLD, `profil invalide : ${profile}`);

  const [existing] = await getByIndex(STORES.BUDGETS, 'category_profile', [categoryId, profile]);
  return put(STORES.BUDGETS, {
    id: existing?.id ?? uuid(),
    categoryId,
    profile,
    monthlyLimit,
    alertThreshold,
  });
}

export const getBudgets = () => getAll(STORES.BUDGETS);

export const deleteBudget = (id) => remove(STORES.BUDGETS, id);

// ——— Projets / Épargne —————————————————————————————————————————

export async function saveProject(input) {
  assert(input.name?.trim(), 'name requis');
  assertCents(input.targetAmount, 'targetAmount');

  const existing = input.id ? await getById(STORES.PROJECTS, input.id) : null;
  const record = {
    icon: '🎯',
    color: '#4F9D69',
    currentAmount: 0,
    deadline: null,
    profile: PROFILES.SHARED,
    status: 'actif',
    ...existing,
    ...input,
    id: input.id ?? uuid(),
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  assertCents(record.currentAmount, 'currentAmount');
  if (record.currentAmount >= record.targetAmount && record.status === 'actif') {
    record.status = 'atteint';
  }
  return put(STORES.PROJECTS, record);
}

/** Ajoute (ou retire, si négatif) un montant à un projet. */
export async function contributeToProject(id, deltaCents) {
  const project = await getById(STORES.PROJECTS, id);
  assert(project, `Projet introuvable : ${id}`);
  return saveProject({ ...project, currentAmount: Math.max(0, project.currentAmount + deltaCents) });
}

export const getProjects = () => getAll(STORES.PROJECTS);

// ——— Réglages ——————————————————————————————————————————————————

export async function getSetting(key) {
  return (await getById(STORES.SETTINGS, key))?.value;
}

export const setSetting = (key, value) => put(STORES.SETTINGS, { key, value });

// ——— Règles de catégorisation apprises ——————————————————————————

export const getRules = () => getAll(STORES.RULES);

/** Enregistre ou renforce des règles { key, categoryId, recurring }. */
export async function saveRules(rules) {
  if (!rules.length) return;
  const { tx, os } = await store(STORES.RULES, 'readwrite');
  for (const rule of rules) {
    const previous = await req(os.get(rule.key));
    os.put({ ...previous, ...rule, hits: (previous?.hits ?? 0) + 1, updatedAt: nowIso() });
  }
  await done(tx);
  emitWrite();
}

// ——— Sauvegarde locale (export / import JSON) ——————————————————

/** Exporte toute la base en un objet JSON-sérialisable (fichier à garder chez vous). */
export async function exportAll() {
  const data = {};
  for (const name of Object.values(STORES)) {
    data[name] = (await getAll(name)).filter((r) => !isLocalOnly(name, r.key));
  }
  return { app: DB_NAME, version: DB_VERSION, exportedAt: nowIso(), data };
}

/** Remplace TOUT le contenu de la base par un export. Atomique : tout ou rien. */
export async function importAll(backup) {
  assert(backup?.app === DB_NAME && backup.data, 'Fichier de sauvegarde non reconnu');
  assert(backup.version <= DB_VERSION, 'Sauvegarde créée par une version plus récente de l\'app');

  // Les réglages propres à cet appareil survivent à la restauration
  const keep = (await getAll(STORES.SETTINGS)).filter((r) => isLocalOnly(STORES.SETTINGS, r.key));
  const db = await openDB();
  const names = Object.values(STORES);
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const os = tx.objectStore(name);
    os.clear();
    (backup.data[name] ?? []).filter((r) => !isLocalOnly(name, r.key)).forEach((r) => os.put(r));
  }
  keep.forEach((r) => tx.objectStore(STORES.SETTINGS).put(r));
  return done(tx);
}
