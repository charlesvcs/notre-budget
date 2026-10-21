/**
 * Service worker : met l'app en cache pour un fonctionnement 100 % hors-ligne.
 * Il ne gère QUE les fichiers de l'application ; les données vivent dans
 * IndexedDB et ne transitent jamais par le réseau.
 *
 * Pour publier une nouvelle version : incrémenter CACHE_VERSION.
 *
 * Le moteur WebAssembly et le modèle d'IA (≈ 3 Go) ne sont PAS pré-chargés :
 * ils sont mis en cache à leur première utilisation (règle « cache d'abord »
 * ci-dessous), pour ne rien imposer à un iPhone qui n'utilise pas l'IA.
 * Ils ont leur propre cache, conservé d'une version de l'app à l'autre.
 */
const CACHE_VERSION = 'v29';
const CACHE_NAME = `notre-budget-${CACHE_VERSION}`;
const AI_CACHE = 'notre-budget-ia';
const isAIFile = (url) => url.pathname.includes('/models/') || url.pathname.endsWith('.wasm');

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/dashboard.css',
  './css/import.css',
  './css/backup.css',
  './js/app.js',
  './js/db/schema.js',
  './js/db/seed.js',
  './js/db/database.js',
  './js/dashboard/dashboard-view.js',
  './js/dashboard/month-model.js',
  './js/dashboard/donut.js',
  './js/backup/backup-core.js',
  './js/backup/backup-view.js',
  './js/import/import-view.js',
  './js/import/pdf-reader.js',
  './js/import/pdf-layout.js',
  './js/import/statement-parser.js',
  './js/import/categorizer.js',
  './js/import/ai/ai-shared.js',
  './js/import/ai/ai-client.js',
  './js/import/ai/ai-worker.js',
  './lib/transformers/transformers.min.js',
  './lib/pdfjs/pdf.min.js',
  './lib/pdfjs/pdf.worker.min.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' contourne le cache HTTP pour ne jamais figer d'anciens fichiers
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('notre-budget-') && k !== CACHE_NAME && k !== AI_CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // On ne traite que les GET de notre propre origine, hors serveur de sauvegarde (jamais en cache).
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  // Navigation : réseau d'abord (pour récupérer les mises à jour), repli sur le cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Ressources statiques : cache d'abord, puis réseau (et mise en cache).
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(isAIFile(url) ? AI_CACHE : CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
