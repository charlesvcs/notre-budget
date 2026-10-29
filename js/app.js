import { initDatabase } from './db/database.js';
import { mountImportView } from './import/import-view.js';
import { mountDashboard } from './dashboard/dashboard-view.js';
import { mountBackupView } from './backup/backup-view.js';
import { mountEpargneView } from './epargne/epargne-view.js';
import { mountInvestissementView } from './epargne/investissement-view.js';
import { startAutoBackup } from './backup/backup-core.js';
import { mountMenu } from './menu.js';

const ROUTES = ['mois', 'epargne', 'investir', 'importer', 'sauvegarde', 'cgv'];

/** Navigation par ancre : #/mois (par defaut), #/epargne, #/investir, #/importer, #/sauvegarde ou #/cgv. */
function startRouter(dashboard, epargne, investir, backup) {
  const menu = mountMenu();
  const show = () => {
    const route = ROUTES.find((r) => location.hash === `#/${r}`) ?? 'mois';
    document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== route; });
    menu.setCurrent(route);
    if (route === 'mois') dashboard.show();
    if (route === 'epargne') epargne.show();
    if (route === 'investir') investir.show();
    if (route === 'sauvegarde') backup.show();
    window.scrollTo({ top: 0 });
  };
  window.addEventListener('hashchange', show);
  show();
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
  } catch (err) {
    console.error('[sw] Échec de l\'enregistrement :', err);
  }
}

async function boot() {
  registerServiceWorker();

  try {
    const { persisted } = await initDatabase();
    document.documentElement.dataset.ready = 'true';
    if (!persisted) {
      console.warn('[db] Stockage non persistant : le navigateur pourrait purger les données. Pensez aux exports réguliers.');
    }
    mountImportView();
    const backup = mountBackupView();
    startRouter(mountDashboard(), mountEpargneView(), mountInvestissementView(), backup);
    startAutoBackup();
  } catch (err) {
    console.error('[db] Initialisation impossible :', err);
    document.getElementById('app').textContent =
      'Impossible d\'ouvrir la base locale. Vérifiez que la navigation privée est désactivée.';
  }
}

boot();
