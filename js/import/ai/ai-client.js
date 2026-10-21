/**
 * Interface du fil principal vers le worker d'IA locale.
 * Les demandes sont traitées l'une après l'autre par un unique worker,
 * qui garde le modèle chargé en mémoire entre deux imports.
 */
let worker = null;
let nextJob = 1;
const jobs = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    if (data.type === 'progress') {
      jobs.forEach((j) => j.onProgress?.(data.loaded, data.total));
      return;
    }
    const job = jobs.get(data.job);
    if (!job) return;
    if (data.type === 'ready') job.onReady?.(data.device, data.model);
    else if (data.type === 'result') job.onResult?.(data);
    else if (data.type === 'done') { jobs.delete(data.job); job.resolve(); }
    else if (data.type === 'error') { jobs.delete(data.job); job.reject(new Error(data.message)); }
  });
  worker.addEventListener('error', (e) => {
    jobs.forEach((j) => j.reject(new Error(e.message || 'Le module IA n\'a pas pu démarrer')));
    jobs.clear();
    worker = null;
  });
  return worker;
}

/**
 * Catégorise des opérations avec le modèle local.
 * @param {Array<{uid, label, type}>} items
 * @param {Array} categories  catégories actives { id, name }
 * @param {{ onProgress?, onReady?, onResult? }} callbacks
 *   onProgress(loaded, total) : chargement du modèle (octets)
 *   onReady(device, model)    : 'webgpu' ou 'wasm', identifiant du modèle
 *   onResult({ uid, categoryId, confidence, done, total })
 * Une seule analyse à la fois : lancer une analyse annule la précédente.
 */
export function classifyWithAI(items, categories, callbacks = {}) {
  cancelAI();
  return new Promise((resolve, reject) => {
    const job = nextJob++;
    jobs.set(job, { ...callbacks, resolve, reject });
    getWorker().postMessage({
      type: 'classify',
      job,
      items: items.map(({ uid, label, type }) => ({ uid, label, type })),
      categories: categories.map(({ id, name }) => ({ id, name })),
    });
  });
}

/** Abandonne les analyses en cours (leurs promesses se terminent sans résultat). */
export function cancelAI() {
  if (!worker || !jobs.size) return;
  worker.postMessage({ type: 'cancel', jobs: [...jobs.keys()] });
}
