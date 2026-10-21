/**
 * Écran d'import : dépôt de PDF → extraction → tableau de validation → base.
 * Rien n'est écrit dans IndexedDB avant le clic sur « Valider et importer ».
 */
import { PROFILES, TRANSACTION_TYPES } from '../db/schema.js';
import {
  DATA_CHANGED, getCategories, getRules, getSetting, getTransactionsByMonth,
  notifyDataChanged, saveRules, saveTransactions, setSetting, toCents,
} from '../db/database.js';
import { parseStatement } from './statement-parser.js';
import { createCategorizer, merchantKey, normalizeLabel } from './categorizer.js';
import { AI_CONFIDENT } from './ai/ai-shared.js';

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
    aiToggle: $('review-ai-toggle'),
    ai: $('review-ai'),
    aiText: $('review-ai-text'),
    aiBar: $('review-ai-bar'),
  };

  let rows = [];
  let sources = [];
  let categories = [];
  let categorizer = null;
  let busy = false;
  let aiEnabled = true;
  let aiRun = 0; // incrémenté à chaque analyse : les réponses d'une analyse périmée sont ignorées
  let aiClient = null; // module chargé à la première utilisation de l'IA

  // ——— Données de référence ——————————————————————————————————————

  async function loadReferenceData() {
    categories = await getCategories();
    categorizer = createCategorizer(categories, await getRules());
  }

  async function fillProfiles() {
    const names = (await getSetting('profileNames')) ?? {};
    // Pas de choix par défaut : chaque relevé doit être attribué explicitement
    const current = el.profile.value;
    el.profile.replaceChildren(new Option('À qui est ce relevé ?', '', false, !current),
      ...Object.values(PROFILES).map((value) => new Option(names[value] ?? value, value, false, value === current)));
    el.profile.options[0].disabled = true;
  }

  el.profile.addEventListener('change', () => updateSummary());

  // Noms des personnes modifiés depuis le tableau de bord
  window.addEventListener(DATA_CHANGED, fillProfiles);

  // ——— Dépôt de fichiers ——————————————————————————————————————————

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
      refineWithAI(added); // en arrière-plan : le tableau reste utilisable

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

  // ——— IA locale ————————————————————————————————————————————————

  /** Les opérations que les mots-clés et vos règles n'ont pas su classer. */
  const needsAI = (r) => r.categorySource === 'defaut' && !r.categoryTouched && !r.duplicate;

  async function refineWithAI(candidates) {
    const run = ++aiRun;
    const todo = candidates.filter(needsAI);
    if (!aiEnabled || !todo.length) {
      if (!todo.length && aiEnabled && candidates.length) setAIStatus('done', 'Toutes les opérations ont été reconnues sans l\'IA.');
      return;
    }

    todo.forEach((r) => { r.aiPending = true; refreshRow(r); });
    setAIStatus('busy', 'Démarrage de l\'IA locale…');
    let device = null;
    let model = null;

    try {
      aiClient ??= await import('./ai/ai-client.js');
      await aiClient.classifyWithAI(todo, categories, {
        onProgress: (loaded, total) => {
          if (run !== aiRun) return;
          setAIStatus('busy', `Chargement du modèle en mémoire… ${Math.round((100 * loaded) / total)} %`, loaded / total);
        },
        onReady: (d, m) => {
          device = d;
          model = m;
          if (run === aiRun) setAIStatus('busy', `L'IA analyse ${todo.length} opération${todo.length > 1 ? 's' : ''}…`, 0);
        },
        onResult: ({ uid, categoryId, confidence, done, total }) => {
          if (run !== aiRun) return;
          const row = rows.find((r) => r.uid === uid);
          if (row) {
            row.aiPending = false;
            if (categoryId && aiEnabled && needsAI(row)) {
              Object.assign(row, { categoryId, suggestedCategoryId: categoryId, categorySource: 'ia', aiConfidence: confidence });
              row.recurring ||= categoryId === 'abonnements';
            }
            refreshRow(row);
          }
          setAIStatus('busy', `L'IA analyse les opérations… ${done} / ${total}`, done / total);
        },
      });
      if (run !== aiRun) return;
      const suggested = todo.filter((r) => r.categorySource === 'ia');
      const n = suggested.length;
      const unsure = suggested.filter(isUnsure).length;
      const where = `${/4B/.test(model) ? 'grand modèle' : 'modèle léger'}, ${device === 'webgpu' ? 'carte graphique' : 'processeur'}, sans connexion`;
      setAIStatus('done', `IA locale : ${n} catégorie${n > 1 ? 's' : ''} suggérée${n > 1 ? 's' : ''} (${where}).`
        + (unsure ? ` Elle hésite sur ${unsure} d'entre elles : vérifiez en priorité les lignes « IA hésitante ».` : ' Jetez un œil aux lignes « Suggéré par l\'IA ».'));
    } catch (err) {
      console.error('[ia]', err);
      if (run !== aiRun) return;
      setAIStatus('error', /not found|404|Could not locate/i.test(err.message)
        ? 'IA locale indisponible : le modèle n\'est pas installé (voir README).'
        : 'L\'IA locale n\'a pas pu démarrer. Les catégories par mots-clés restent utilisables.');
    } finally {
      todo.forEach((r) => { if (r.aiPending) { r.aiPending = false; refreshRow(r); } });
    }
  }

  const isUnsure = (r) => r.aiConfidence != null && r.aiConfidence < AI_CONFIDENT;

  function stopAI() {
    aiRun++;
    aiClient?.cancelAI();
    setAIStatus(null);
  }

  function setAIStatus(state, text, progress = null) {
    el.ai.hidden = !state;
    el.ai.dataset.state = state ?? '';
    el.aiText.textContent = text ?? '';
    el.aiBar.hidden = progress == null;
    if (progress != null) el.aiBar.value = progress;
  }

  el.aiToggle.addEventListener('change', () => {
    aiEnabled = el.aiToggle.checked;
    setSetting('aiEnabled', aiEnabled);
    if (aiEnabled) {
      refineWithAI(rows);
    } else {
      stopAI();
      // Retour aux catégories par mots-clés pour les suggestions de l'IA non retouchées
      for (const r of rows) {
        r.aiPending = false;
        if (r.categorySource === 'ia' && !r.categoryTouched) {
          const s = categorizer.suggest(r.label, r.type);
          Object.assign(r, { categoryId: s.categoryId, suggestedCategoryId: s.categoryId, categorySource: s.source });
        }
      }
      render();
    }
  });

  // ——— Lignes de la zone tampon ——————————————————————————————————

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
      aiPending: false,
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

  // ——— Rendu ————————————————————————————————————————————————————

  function categoryOptions(type) {
    // Les catégories du bon sens d'abord ; les autres restent accessibles
    const fits = (c) => (type === TRANSACTION_TYPES.INCOME ? c.kind !== 'sortie' : c.kind !== 'entree');
    const sorted = [...categories.filter(fits), ...categories.filter((c) => !fits(c))];
    return sorted.map((c) => new Option(`${c.icon}  ${c.name}`, c.id));
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

  /** Met à jour la ligne affichée après une suggestion de l'IA. */
  function refreshRow(row) {
    const tr = el.body.querySelector(`tr[data-uid="${row.uid}"]`);
    if (!tr) return;
    const select = tr.querySelector('.js-category');
    if (select.value !== row.categoryId) select.value = row.categoryId;
    tr.querySelector('.js-recurring').checked = row.recurring;
    syncRowState(tr, row);
  }

  function syncRowState(tr, row) {
    tr.dataset.type = row.type;
    tr.classList.toggle('is-excluded', !row.include);
    tr.classList.toggle('needs-review', row.include && row.needsReview && !row.duplicate);

    const badge = tr.querySelector('.js-badge');
    const untouched = !row.categoryTouched;
    const [kind, text] = row.duplicate ? ['duplicate', 'Déjà importée']
      : row.aiPending ? ['ai-pending', 'L\'IA réfléchit…']
        : row.categorySource === 'ia' && untouched ? (isUnsure(row) ? ['ai-unsure', 'IA hésitante · à vérifier'] : ['ai', 'Suggéré par l\'IA'])
          : row.needsReview ? ['review', 'À vérifier']
            : row.categorySource === 'appris' && untouched ? ['learned', 'Retenu de vos choix']
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

  // ——— Modifications dans le tableau ——————————————————————————————

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

  // ——— Validation finale ——————————————————————————————————————————

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

  // ——— Utilitaires d'affichage ————————————————————————————————————

  function reset() {
    rows = [];
    sources = [];
    el.profile.value = '';
    stopAI();
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

  getSetting('aiEnabled').then((v) => {
    // Par défaut, pas d'IA sur téléphone : le modèle (plusieurs Go) n'y tiendrait pas
    aiEnabled = v ?? !matchMedia('(pointer: coarse)').matches;
    el.aiToggle.checked = aiEnabled;
  });
  fillProfiles();
  render();
}
