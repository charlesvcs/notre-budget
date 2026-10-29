/**
 * Écran d'import : dépôt de PDF → extraction → tableau de validation → base.
 * Rien n'est écrit dans IndexedDB avant le clic sur « Valider et importer ».
 */
import { TRANSACTION_TYPES } from '../db/schema.js';
import {
  DATA_CHANGED, getActiveProfiles, getCategories, getProfileNames, getRules, getTransactionsByMonth,
  notifyDataChanged, saveRules, saveTransactions, toCents,
} from '../db/database.js';
import { parseStatement } from './statement-parser.js';
import { createCategorizer, merchantKey, normalizeLabel } from './categorizer.js';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const toInputAmount = (cents) =>
  (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const duplicateKey = (t) => `${t.date}|${t.amount}|${t.type}|${normalizeLabel(t.label)}`;

export function mountImportView(root = document) {
  const $ = (id) => root.getElementById(id);
  const el = {
    dropzone: $('dropzone'),
    input: $('pdf-input'),
    status: $('import-status'),
    review: $('review'),
    source: $('review-source'),
    profile: $('review-profile'),
    all: $('review-all'),
    body: $('review-body'),
    totals: $('review-totals'),
    cancel: $('review-cancel'),
    submit: $('review-submit'),
    template: $('review-row-template'),
  };

  let rows = [];
  let sources = [];
  let categories = [];
  let categorizer = null;
  let busy = false;

  /* Données de référence */

  async function loadReferenceData() {
    categories = await getCategories();
    categorizer = createCategorizer(categories, await getRules());
  }

  async function fillProfiles() {
    const [names, active] = await Promise.all([getProfileNames(), getActiveProfiles()]);
    const wrap = el.profile.closest('label');
    if (active.length <= 1) {
      const only = active[0];
      el.profile.replaceChildren(new Option(names[only] ?? only, only, true, true));
      el.profile.value = only;
      if (wrap) wrap.hidden = true;
    } else {
      // Plusieurs profils actifs : chaque relevé est attribué explicitement
      const current = active.includes(el.profile.value) ? el.profile.value : '';
      el.profile.replaceChildren(
        new Option('À qui est ce relevé ?', '', false, !current),
        ...active.map((value) => new Option(names[value] ?? value, value, false, value === current)),
      );
      el.profile.options[0].disabled = true;
      if (wrap) wrap.hidden = false;
    }
    updateSummary();
  }

  el.profile.addEventListener('change', () => updateSummary());

  // Profils ou noms modifiés depuis le tableau de bord
  window.addEventListener(DATA_CHANGED, fillProfiles);

  /* Dépôt de fichiers */

  // Empêche le navigateur d'ouvrir le PDF si on le lâche à côté de la zone
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  let dragDepth = 0;
  el.dropzone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    el.dropzone.classList.add('is-dragging');
  });
  el.dropzone.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) { dragDepth = 0; el.dropzone.classList.remove('is-dragging'); }
  });
  el.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    el.dropzone.classList.remove('is-dragging');
    handleFiles(e.dataTransfer.files);
  });
  el.input.addEventListener('change', () => {
    handleFiles(el.input.files);
    el.input.value = ''; // permet de redéposer le même fichier
  });

  async function handleFiles(fileList) {
    if (busy) return;
    const files = [...fileList];
    const pdfs = files.filter(isPdf);
    if (!pdfs.length) {
      setStatus('Seuls les fichiers PDF sont acceptés.', 'error');
      return;
    }

    setBusy(true);
    const problems = files.filter((f) => !isPdf(f)).map((f) => `« ${f.name} » n'est pas un PDF.`);
    const added = [];

    try {
      await loadReferenceData();
      setStatus('Ouverture du lecteur PDF…');
      const { readPdfLines } = await import('./pdf-reader.js'); // chargé seulement au besoin

      for (const file of pdfs) {
        setStatus(`Lecture de « ${file.name} »…`);
        try {
          const lines = await readPdfLines(file, { onPassword: askPassword(file.name) });
          if (!lines.length) {
            problems.push(`« ${file.name} » ne contient pas de texte (document scanné ?).`);
            continue;
          }
          const { transactions } = parseStatement(lines);
          if (!transactions.length) {
            problems.push(`Aucune opération reconnue dans « ${file.name} ».`);
            continue;
          }
          added.push(...transactions.map((t) => toRow(t, file.name)));
          sources.push(file.name);
        } catch (err) {
          problems.push(describeError(file.name, err));
        }
      }

      await flagDuplicates(added);
      rows = rows.concat(added).sort((a, b) => a.date.localeCompare(b.date));
      render();

      const dupes = added.filter((r) => r.duplicate).length;
      const summary = added.length
        ? `${added.length} opération${added.length > 1 ? 's' : ''} trouvée${added.length > 1 ? 's' : ''}`
          + (dupes ? `, dont ${dupes} déjà dans vos comptes (décochée${dupes > 1 ? 's' : ''}).` : '.')
        : '';
      setStatus([summary, ...problems].filter(Boolean).join(' '), problems.length && !added.length ? 'error' : 'info');
    } catch (err) {
      console.error(err);
      setStatus('La lecture a échoué. Réessayez, ou essayez avec un autre relevé.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function askPassword(name) {
    return (incorrect) => window.prompt(
      incorrect ? `Mot de passe incorrect pour « ${name} ». Réessayez :` : `« ${name} » est protégé. Mot de passe :`,
    );
  }

  function describeError(name, err) {
    if (err?.name === 'PasswordException') return `« ${name} » est protégé par un mot de passe.`;
    if (err?.name === 'InvalidPDFException') return `« ${name} » est illisible ou endommagé.`;
    console.error(err);
    return `Impossible de lire « ${name} ».`;
  }

  /* Lignes de la zone tampon */

  function toRow(t, source) {
    const s = categorizer.suggest(t.label, t.type);
    return {
      uid: crypto.randomUUID(),
      source,
      date: t.date,
      label: t.label,
      amount: t.amount,
      amountText: toInputAmount(t.amount),
      amountError: false,
      type: t.type,
      categoryId: s.categoryId,
      suggestedCategoryId: s.categoryId,
      categorySource: s.source,
      categoryTouched: false,
      recurring: s.recurring,
      include: true,
      duplicate: false,
      // À vérifier : sens deviné, ou aucune catégorie trouvée
      needsReview: t.confidence !== 'haute' || s.source === 'defaut',
    };
  }

  /** Marque les opérations déjà en base (ou déjà dans le tableau) et les décoche. */
  async function flagDuplicates(newRows) {
    const months = [...new Set(newRows.map((r) => r.date.slice(0, 7)))];
    const existing = (await Promise.all(months.map(getTransactionsByMonth))).flat();
    const counts = new Map();
    for (const t of [...existing, ...rows]) {
      const k = duplicateKey(t);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    // Deux cafés identiques le même jour restent possibles : on compte les occurrences
    for (const r of newRows) {
      const k = duplicateKey(r);
      const n = counts.get(k) ?? 0;
      if (n > 0) {
        r.duplicate = true;
        r.include = false;
        counts.set(k, n - 1);
      }
    }
  }

  /* Rendu */

  function categoryOptions(type) {
    // Les catégories du bon sens d'abord ; les autres restent accessibles
    const fits = (c) => (type === TRANSACTION_TYPES.INCOME ? c.kind !== 'sortie' : c.kind !== 'entree');
    const sorted = [...categories.filter(fits), ...categories.filter((c) => !fits(c))];
    return sorted.map((c) => new Option(c.name, c.id));
  }

  function render() {
    el.review.hidden = rows.length === 0;
    el.source.textContent = sources.length
      ? `Depuis ${sources.map((s) => `« ${s} »`).join(', ')}. Corrigez ce qui doit l'être, rien n'est encore enregistré.`
      : '';
    el.body.replaceChildren(...rows.map(renderRow));
    updateSummary();
  }

  function renderRow(row) {
    const tr = el.template.content.firstElementChild.cloneNode(true);
    tr.dataset.uid = row.uid;
    tr.querySelector('.js-label').textContent = row.label;
    tr.querySelector('.js-label').title = row.source;
    tr.querySelector('.js-date').value = row.date;
    tr.querySelector('.js-type').value = row.type;

    const select = tr.querySelector('.js-category');
    select.replaceChildren(...categoryOptions(row.type));
    select.value = row.categoryId;

    const amount = tr.querySelector('.js-amount');
    amount.value = row.amountText;
    amount.setAttribute('aria-invalid', String(row.amountError));

    tr.querySelector('.js-include').checked = row.include;
    tr.querySelector('.js-recurring').checked = row.recurring;
    syncRowState(tr, row);
    return tr;
  }

  function syncRowState(tr, row) {
    tr.dataset.type = row.type;
    tr.classList.toggle('is-excluded', !row.include);
    tr.classList.toggle('needs-review', row.include && row.needsReview && !row.duplicate);

    const badge = tr.querySelector('.js-badge');
    const [kind, text] = row.duplicate ? ['duplicate', 'Déjà importée']
      : row.needsReview ? ['review', 'À vérifier']
        : [null, ''];
    badge.hidden = !kind;
    badge.dataset.kind = kind ?? '';
    badge.textContent = text;
  }

  function updateSummary() {
    const selected = rows.filter((r) => r.include);
    const sum = (type) => selected.filter((r) => r.type === type && !r.amountError).reduce((s, r) => s + r.amount, 0);
    const out = sum(TRANSACTION_TYPES.EXPENSE);
    const income = sum(TRANSACTION_TYPES.INCOME);
    const hasErrors = selected.some((r) => r.amountError || !r.date);

    const item = (label, value, cls = '') => {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      if (cls) dd.className = cls;
      div.append(dt, dd);
      return div;
    };
    el.totals.replaceChildren(
      item('Sélectionnées', `${selected.length} / ${rows.length}`),
      item('Dépenses', euro.format(-out / 100)),
      item('Rentrées', euro.format(income / 100), 'is-in'),
    );

    el.all.checked = selected.length === rows.length && rows.length > 0;
    el.all.indeterminate = selected.length > 0 && selected.length < rows.length;
    const noProfile = !el.profile.value;
    el.profile.toggleAttribute('aria-invalid', noProfile && rows.length > 0);
    el.submit.disabled = busy || !selected.length || hasErrors || noProfile;
    el.submit.textContent = noProfile && rows.length
      ? 'Choisissez à qui est ce relevé'
      : selected.length ? `Valider et importer (${selected.length})` : 'Valider et importer';
  }

  /* Modifications dans le tableau */

  const rowOf = (target) => {
    const tr = target.closest('tr[data-uid]');
    return tr ? [tr, rows.find((r) => r.uid === tr.dataset.uid)] : [null, null];
  };

  el.body.addEventListener('input', (e) => {
    const [tr, row] = rowOf(e.target);
    if (!row || !e.target.classList.contains('js-amount')) return;

    const text = e.target.value.trim();
    row.amountText = text;
    try {
      const cents = Math.abs(toCents(text));
      row.amountError = cents === 0;
      if (!row.amountError) row.amount = cents;
      // Saisir « -12,50 » bascule en dépense
      if (text.startsWith('-') && row.type !== TRANSACTION_TYPES.EXPENSE) {
        row.type = TRANSACTION_TYPES.EXPENSE;
        tr.querySelector('.js-type').value = row.type;
      }
    } catch {
      row.amountError = true;
    }
    e.target.setAttribute('aria-invalid', String(row.amountError));
    syncRowState(tr, row);
    updateSummary();
  });

  el.body.addEventListener('change', (e) => {
    const [tr, row] = rowOf(e.target);
    if (!row) return;
    const t = e.target;

    if (t.classList.contains('js-include')) {
      row.include = t.checked;
    } else if (t.classList.contains('js-date')) {
      row.date = t.value; // vide si date invalide → bloque l'import
    } else if (t.classList.contains('js-category')) {
      row.categoryId = t.value;
      row.categoryTouched = true;
      row.needsReview = false;
    } else if (t.classList.contains('js-type')) {
      row.type = t.value;
      row.needsReview = false;
      if (!row.categoryTouched) {
        const s = categorizer.suggest(row.label, row.type);
        Object.assign(row, { categoryId: s.categoryId, suggestedCategoryId: s.categoryId, categorySource: s.source });
      }
      const select = tr.querySelector('.js-category');
      select.replaceChildren(...categoryOptions(row.type));
      select.value = row.categoryId;
    } else if (t.classList.contains('js-recurring')) {
      row.recurring = t.checked;
    } else if (t.classList.contains('js-amount')) {
      if (!row.amountError) t.value = row.amountText = toInputAmount(row.amount);
    }
    syncRowState(tr, row);
    updateSummary();
  });

  el.body.addEventListener('click', (e) => {
    const button = e.target.closest('.js-remove');
    if (!button) return;
    const [tr, row] = rowOf(button);
    rows = rows.filter((r) => r !== row);
    const next = tr.nextElementSibling ?? tr.previousElementSibling;
    tr.remove();
    if (!rows.length) reset();
    else {
      updateSummary();
      next?.querySelector('.js-remove')?.focus();
    }
  });

  el.all.addEventListener('change', () => {
    rows.forEach((r) => { r.include = el.all.checked; });
    render();
  });

  /* Validation finale */

  el.submit.addEventListener('click', async () => {
    const selected = rows.filter((r) => r.include);
    if (!selected.length || busy) return;

    setBusy(true);
    try {
      const profile = el.profile.value;
      await saveTransactions(selected.map((r) => ({
        date: r.date,
        amount: r.amount,
        type: r.type,
        categoryId: r.categoryId,
        label: r.label,
        recurring: r.recurring,
        profile,
      })));

      // Retenir vos corrections pour les prochains imports
      const learned = new Map();
      for (const r of selected) {
        const key = merchantKey(r.label);
        if (key && r.categoryTouched && r.categoryId !== r.suggestedCategoryId) {
          learned.set(key, { key, categoryId: r.categoryId, recurring: r.recurring });
        }
      }
      await saveRules([...learned.values()]);
      notifyDataChanged();

      reset();
      const n = selected.length;
      setStatus(
        `${n} opération${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}.`
        + (learned.size ? ` ${learned.size} correction${learned.size > 1 ? 's' : ''} retenue${learned.size > 1 ? 's' : ''} pour la prochaine fois.` : ''),
        'success',
      );
    } catch (err) {
      console.error(err);
      setStatus(`L'import n'a pas abouti, aucune opération n'a été enregistrée. (${err.message})`, 'error');
    } finally {
      setBusy(false);
    }
  });

  el.cancel.addEventListener('click', () => {
    if (rows.length && !window.confirm('Abandonner cet import ? Les opérations ne seront pas enregistrées.')) return;
    reset();
    setStatus('');
  });

  window.addEventListener('beforeunload', (e) => {
    if (rows.length) e.preventDefault();
  });

  /* Utilitaires d'affichage */

  function reset() {
    rows = [];
    sources = [];
    if (el.profile.options.length > 1) el.profile.value = '';
    render();
  }

  function setBusy(value) {
    busy = value;
    el.dropzone.classList.toggle('is-busy', value);
    el.dropzone.setAttribute('aria-busy', String(value));
    updateSummary();
  }

  function setStatus(message, tone = 'info') {
    el.status.hidden = !message;
    el.status.textContent = message;
    el.status.dataset.tone = tone;
  }

  fillProfiles();
  render();
}
