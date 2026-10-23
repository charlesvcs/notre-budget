/**
 * Écran « Sauvegarde » : mot de passe, sauvegarde automatique (Mac + serveur
 * local), envoi par AirDrop et restauration (iPhone).
 */
import { getSetting, notifyDataChanged } from '../db/database.js';
import {
  BACKUP_STATUS, backupAsFile, backupNow, canShareFiles, checkServer, createBackup, download,
  hasPassphrase, isLocalhost, lastError, openBackup, restoreBackup, serverInfo, setPassphrase,
} from './backup-core.js';

const when = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MIN_LENGTH = 8;

export function mountBackupView(root = document) {
  const $ = (id) => root.getElementById(id);
  const el = {
    status: $('backup-status'),
    passForm: $('backup-pass-form'),
    passHint: $('backup-pass-hint'),
    passError: $('backup-pass-error'),
    passSubmit: $('backup-pass-submit'),
    passCancel: $('backup-pass-cancel'),
    passChange: $('backup-pass-change'),
    tools: $('backup-tools'),
    now: $('backup-now'),
    sendCard: $('backup-send-card'),
    share: $('backup-share'),
    download: $('backup-download'),
    shareHint: $('backup-share-hint'),
    restoreFile: $('restore-file'),
    restoreForm: $('restore-form'),
    restoreName: $('restore-file-name'),
    restoreError: $('restore-error'),
    restorePreview: $('restore-preview'),
    restoreSummary: $('restore-summary'),
    restoreCancel: $('restore-cancel'),
    restoreConfirm: $('restore-confirm'),
    restoreStatus: $('restore-status'),
    banner: $('backup-banner'),
    bannerText: $('backup-banner-text'),
  };
  const pending = { file: null, content: null, passphrase: null };

  // ——— État ——————————————————————————————————————————————————————

  async function render() {
    const keySet = await hasPassphrase();
    const server = serverInfo();
    const lastAt = await getSetting('backupLastAt');
    const error = lastError();

    // Le mot de passe se choisit sur le Mac (serveur local) ; ailleurs, il vient avec la restauration
    el.passForm.hidden = !server || (keySet && !el.passForm.dataset.changing);
    el.tools.hidden = !server || !keySet || !el.passForm.hidden;
    el.now.hidden = !server;
    el.passSubmit.textContent = keySet ? 'Changer le mot de passe' : 'Activer la sauvegarde';
    el.passCancel.hidden = !keySet;
    el.passHint.textContent = keySet
      ? 'Les prochaines sauvegardes utiliseront le nouveau mot de passe ; les anciennes restent lisibles avec l\'ancien.'
      : 'Choisissez un mot de passe d\'au moins 8 caractères. Il n\'est enregistré nulle part : notez-le, il vous sera demandé pour ouvrir la sauvegarde sur l\'iPhone.';

    let text;
    let tone = 'neutral';
    if (!server && isLocalhost()) {
      text = 'Le serveur de sauvegarde n\'est pas lancé. Fermez la commande « python3 -m http.server », puis double-cliquez sur « Lancer Mon Budget.command » dans le dossier Finance.';
      tone = 'warning';
    } else if (!server) {
      text = 'Sur cet appareil, pas de sauvegarde automatique : elle se fait sur le Mac, avec le serveur local. Ici, vous pouvez restaurer une sauvegarde reçue par AirDrop.';
    } else if (!keySet) {
      text = 'Désactivée : choisissez un mot de passe pour l\'activer.';
      tone = 'warning';
    } else if (error) {
      text = `La dernière sauvegarde a échoué : ${error}`;
      tone = 'error';
    } else {
      text = `Activée. À chaque import ou modification, la sauvegarde chiffrée est enregistrée dans ${server.dossier}`
        + (lastAt ? ` · dernière : ${when.format(new Date(lastAt))}.` : '.');
      tone = 'ok';
    }
    el.status.textContent = text;
    el.status.dataset.tone = tone;

    el.sendCard.hidden = !keySet;
    el.share.hidden = !canShareFiles();
    el.shareHint.textContent = canShareFiles()
      ? ''
      : server
        ? `Ce navigateur ne propose pas AirDrop directement : dans le Finder, ouvrez ${server.dossier}, clic droit sur « ${server.fichier} » › Partager › AirDrop.`
        : 'Téléchargez le fichier, puis partagez-le par AirDrop depuis le Finder.';

    // Bandeau discret sur « Le mois » quand la sauvegarde du Mac n'est pas active ou a échoué
    el.banner.hidden = !server || (keySet && !error);
    el.bannerText.textContent = !keySet ? 'Sauvegarde automatique désactivée.' : `Sauvegarde en échec : ${error}`;
  }

  window.addEventListener(BACKUP_STATUS, render);

  // ——— Mot de passe ————————————————————————————————————————————————

  el.passChange.addEventListener('click', () => {
    el.passForm.dataset.changing = 'true';
    render().then(() => el.passForm.elements.pass.focus());
  });

  el.passCancel.addEventListener('click', () => {
    delete el.passForm.dataset.changing;
    el.passForm.reset();
    el.passError.hidden = true;
    render();
  });

  el.passForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { pass, confirm } = el.passForm.elements;
    const problem = pass.value.length < MIN_LENGTH
      ? `Le mot de passe doit faire au moins ${MIN_LENGTH} caractères.`
      : pass.value !== confirm.value ? 'Les deux mots de passe ne sont pas identiques.' : null;
    pass.toggleAttribute('aria-invalid', pass.value.length < MIN_LENGTH);
    confirm.toggleAttribute('aria-invalid', Boolean(problem) && pass.value.length >= MIN_LENGTH);
    if (problem) {
      el.passError.textContent = problem;
      el.passError.hidden = false;
      (pass.value.length < MIN_LENGTH ? pass : confirm).focus();
      return;
    }
    el.passError.hidden = true;
    el.passSubmit.disabled = true;
    try {
      await setPassphrase(pass.value);
      el.passForm.reset();
      delete el.passForm.dataset.changing;
      if (serverInfo()) await backupNow().catch(() => {});
    } finally {
      el.passSubmit.disabled = false;
      render();
    }
  });

  el.now.addEventListener('click', async () => {
    el.now.disabled = true;
    try { await backupNow(); } catch { /* affiché par render() */ } finally {
      el.now.disabled = false;
      render();
    }
  });

  // ——— Envoi (AirDrop) ——————————————————————————————————————————————

  el.share.addEventListener('click', async () => {
    const file = backupAsFile(await createBackup());
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde Mon Budget' });
    } catch (err) {
      if (err.name !== 'AbortError') download(file);
    }
  });

  el.download.addEventListener('click', async () => download(backupAsFile(await createBackup())));

  // ——— Restauration ——————————————————————————————————————————————————

  function resetRestore() {
    Object.assign(pending, { file: null, content: null, passphrase: null });
    el.restoreForm.reset();
    el.restoreForm.hidden = true;
    el.restorePreview.hidden = true;
    el.restoreError.hidden = true;
    el.restoreFile.value = '';
  }

  el.restoreFile.addEventListener('change', async () => {
    const file = el.restoreFile.files[0];
    if (!file) return;
    resetRestore();
    el.restoreStatus.hidden = true;
    try {
      pending.file = JSON.parse(await file.text());
    } catch {
      showRestoreStatus('Ce fichier n\'est pas une sauvegarde de Mon Budget.', 'error');
      return;
    }
    el.restoreName.textContent = `Fichier : ${file.name}${pending.file.savedAt ? ` · sauvegardé le ${when.format(new Date(pending.file.savedAt))}` : ''}`;
    el.restoreForm.hidden = false;
    el.restoreForm.elements.pass.focus();
  });

  el.restoreForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = el.restoreForm.elements.pass;
    const button = el.restoreForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      pending.content = await openBackup(pending.file, pass.value);
      pending.passphrase = pass.value;
      el.restoreError.hidden = true;
      pass.removeAttribute('aria-invalid');
      el.restoreForm.hidden = true;
      el.restoreSummary.textContent = summarize(pending.content);
      el.restorePreview.hidden = false;
      el.restoreConfirm.focus();
    } catch (err) {
      el.restoreError.textContent = err.message;
      el.restoreError.hidden = false;
      pass.setAttribute('aria-invalid', 'true');
      pass.select();
    } finally {
      button.disabled = false;
    }
  });

  el.restoreCancel.addEventListener('click', () => { resetRestore(); el.restoreFile.focus(); });

  el.restoreConfirm.addEventListener('click', async () => {
    el.restoreConfirm.disabled = true;
    try {
      await restoreBackup(pending.content);
      // Le même mot de passe sert ensuite à sauvegarder depuis cet appareil
      if (!(await hasPassphrase())) await setPassphrase(pending.passphrase);
      const count = pending.content.data.transactions?.length ?? 0;
      resetRestore();
      notifyDataChanged();
      showRestoreStatus(`Sauvegarde restaurée : ${count} opération${count > 1 ? 's' : ''}. Retrouvez-les dans « Le mois ».`, 'ok');
    } catch (err) {
      showRestoreStatus(`La restauration a échoué, rien n'a été modifié. (${err.message})`, 'error');
    } finally {
      el.restoreConfirm.disabled = false;
    }
  });

  function showRestoreStatus(text, tone) {
    el.restoreStatus.hidden = false;
    el.restoreStatus.textContent = text;
    el.restoreStatus.dataset.tone = tone;
  }

  render();
  return {
    /** À l'ouverture de l'onglet : on revérifie le serveur local. */
    show: async () => { await checkServer(); render(); },
  };
}

/** « 312 opérations, de mai 2026 à octobre 2026 · 6 enveloppes » */
function summarize(content) {
  const tx = content.data.transactions ?? [];
  const months = tx.map((t) => t.month).filter(Boolean).sort();
  const fmt = (m) => monthName.format(new Date(`${m}-01T00:00:00Z`));
  const parts = [`${tx.length} opération${tx.length > 1 ? 's' : ''}`];
  if (months.length) parts[0] += months[0] === months.at(-1) ? ` en ${fmt(months[0])}` : `, de ${fmt(months[0])} à ${fmt(months.at(-1))}`;
  const budgets = content.data.budgets?.length ?? 0;
  if (budgets) parts.push(`${budgets} enveloppe${budgets > 1 ? 's' : ''}`);
  return `Cette sauvegarde contient ${parts.join(' · ')}. Restaurer remplacera toutes les données de cet appareil.`;
}
