/**
 * Sauvegarde chiffrée de toute la base.
 *
 * - Chiffrement AES-256-GCM, clé dérivée du mot de passe (PBKDF2-SHA-256,
 *   600 000 itérations). Le mot de passe n'est jamais enregistré : seule la
 *   clé dérivée, non exportable, est gardée dans cet appareil.
 * - Sur le Mac, le serveur local (scripts/serveur.py) reçoit chaque
 *   sauvegarde et l'écrit dans Finance/sauvegardes/. Rien ne sort de l'ordinateur.
 * - Le fichier peut ensuite passer par AirDrop et être restauré sur l'iPhone.
 */
import { DATA_WRITTEN, exportAll, getSetting, importAll, setSetting } from '../db/database.js';

export const BACKUP_FORMAT = 'notre-budget-chiffre';
export const BACKUP_FILENAME = 'notre-budget-sauvegarde.json';
const ITERATIONS = 600_000;
const ENDPOINT = './api/sauvegarde';
const DEBOUNCE_MS = 2500;

/** Émis quand l'état de la sauvegarde change (pour l'écran « Sauvegarde »). */
export const BACKUP_STATUS = 'notre-budget:sauvegarde';
const emitStatus = () => window.dispatchEvent(new CustomEvent(BACKUP_STATUS));

// ——— Chiffrement ————————————————————————————————————————————————

function b64(bytes) {
  const view = new Uint8Array(bytes);
  let text = '';
  for (let i = 0; i < view.length; i += 0x8000) text += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(text);
}
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // non exportable : la clé ne peut pas être lue, seulement utilisée
    ['encrypt', 'decrypt'],
  );
}

/** Choisit (ou change) le mot de passe : la clé dérivée est gardée sur cet appareil. */
export async function setPassphrase(passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  await setSetting('backupKey', { key, salt: b64(salt) });
  emitStatus();
}

export const hasPassphrase = async () => Boolean((await getSetting('backupKey'))?.key);

/** Base complète → fichier chiffré (objet JSON). */
export async function createBackup() {
  const stored = await getSetting('backupKey');
  if (!stored?.key) throw new Error('Choisissez d\'abord un mot de passe de sauvegarde.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(await exportAll()));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, stored.key, plain);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: stored.salt },
    iv: b64(iv),
    data: b64(cipher),
  };
}

/** Fichier chiffré + mot de passe → contenu de la base (lève une erreur si le mot de passe est faux). */
export async function openBackup(file, passphrase) {
  if (file?.format !== BACKUP_FORMAT) throw new Error('Ce fichier n\'est pas une sauvegarde de Notre Budget.');
  const key = await deriveKey(passphrase, unb64(file.kdf.salt));
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.data));
  } catch {
    throw new Error('Mot de passe incorrect (ou fichier abîmé).');
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

/** Remplace toute la base de cet appareil par le contenu d'une sauvegarde déchiffrée. */
export const restoreBackup = (content) => importAll(content);

// ——— Serveur local (Mac) —————————————————————————————————————————

let serverAvailable = null;

/** Le serveur local de sauvegarde répond-il ? (absent sur Vercel et sur l'iPhone) */
/** L'app tourne-t-elle sur le Mac (adresse locale) ? */
export const isLocalhost = () => ['localhost', '127.0.0.1'].includes(location.hostname);

export async function checkServer() {
  // Le serveur local n'existe que sur le Mac : inutile de le chercher ailleurs (Vercel, iPhone)
  if (!isLocalhost()) {
    serverAvailable = false;
    return serverAvailable;
  }
  try {
    const res = await fetch(`${ENDPOINT}/etat`, { cache: 'no-store' });
    serverAvailable = res.ok ? await res.json() : false;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

export const serverInfo = () => serverAvailable;

async function sendToServer(backup) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backup),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Le serveur local a refusé la sauvegarde (${res.status}).`);
  return res.json();
}

// ——— Sauvegarde automatique ———————————————————————————————————————

const state = { timer: null, running: false, again: false, lastError: null };

export const lastError = () => state.lastError;

/** Sauvegarde maintenant (vers le serveur local). Renvoie l'état écrit. */
export async function backupNow() {
  if (state.running) { state.again = true; return null; }
  state.running = true;
  try {
    const backup = await createBackup();
    const result = await sendToServer(backup);
    await setSetting('backupLastAt', backup.savedAt);
    state.lastError = null;
    return result;
  } catch (err) {
    state.lastError = err.message;
    throw err;
  } finally {
    state.running = false;
    emitStatus();
    if (state.again) { state.again = false; schedule(); }
  }
}

function schedule() {
  clearTimeout(state.timer);
  state.timer = setTimeout(async () => {
    if (!serverAvailable || !(await hasPassphrase())) return;
    backupNow().catch((err) => console.warn('[sauvegarde]', err));
  }, DEBOUNCE_MS);
}

/** À appeler au démarrage : chaque écriture en base déclenche une sauvegarde (regroupées). */
export async function startAutoBackup() {
  await checkServer();
  window.addEventListener(DATA_WRITTEN, schedule);
  emitStatus();
}

// ——— Envoi (AirDrop) et téléchargement ———————————————————————————————

export function backupAsFile(backup) {
  return new File([JSON.stringify(backup)], BACKUP_FILENAME, { type: 'application/json' });
}

/** Feuille de partage du système (AirDrop sur Mac et iPhone) si le navigateur la propose. */
export const canShareFiles = () => {
  try {
    return Boolean(navigator.canShare?.({ files: [new File(['{}'], BACKUP_FILENAME, { type: 'application/json' })] }));
  } catch {
    return false;
  }
};

export function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
