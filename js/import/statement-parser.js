/**
 * Transforme les lignes d'un relevé bancaire en opérations.
 *
 * Heuristique, dans l'ordre :
 *  1. Une opération commence par une date en début de ligne (« 20/10 »,
 *     « 20.10.26 », « 20/10/2026 », « 20 oct. »), éventuellement suivie
 *     d'une date de valeur.
 *  2. Les montants sont au format français (« 1 234,56 »), avec signe ou
 *     suffixe éventuel (« -12,50 », « 12,50 CR »).
 *  3. Si l'en-tête « Débit / Crédit » est trouvé, la position horizontale du
 *     montant décide du sens de l'opération (fiabilité haute). Sinon : signe
 *     explicite, puis mots-clés (VIR RECU, SALAIRE…).
 *  4. Les lignes sans date, juste en dessous et alignées sur le libellé,
 *     complètent le libellé (libellés sur plusieurs lignes).
 *  5. Soldes, totaux et reports sont ignorés.
 */
import { TRANSACTION_TYPES } from '../db/schema.js';

const { INCOME, EXPENSE } = TRANSACTION_TYPES;

const MONTHS = {
  jan: 1, janv: 1, janvier: 1, fev: 2, fevr: 2, fevrier: 2, mar: 3, mars: 3,
  avr: 4, avril: 4, mai: 5, juin: 6, juil: 7, juillet: 7, aou: 8, aout: 8,
  sep: 9, sept: 9, septembre: 9, oct: 10, octobre: 10, nov: 11, novembre: 11,
  dec: 12, decembre: 12,
};

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const NUMERIC_DATE = /^\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?![\d/.-])/;
const TEXT_DATE = /^\s*(\d{1,2})(?:er)?\s+([A-Za-zÀ-ÿ]{3,9})\.?(?:\s+(\d{4}))?(?=\s|$)/;
const TRAILING_DATE = /\s+\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?$/;

const AMOUNT_RE =
  /(?<![\d,./])([-+−]\s?)?(\d{1,3}(?:[ .]\d{3})+|\d+),(\d{2})(?![\d,])(?:\s?(?:€|EUR))?(?:\s?([-+]|CR\b|DB\b|DR\b))?/gi;

const HAS_AMOUNT = new RegExp(AMOUNT_RE.source, 'i'); // sans « g » : pas d'état entre deux appels

const SKIP_RE = new RegExp([
  String.raw`^\s*(?:ancien|nouveau)\s+solde`,
  String.raw`^\s*solde\b`,
  String.raw`\bsolde\s+(?:pr[ée]c[ée]dent|au\b|cr[ée]diteur|d[ée]biteur|en\s+(?:euros?|eur)\b)`,
  String.raw`total\s+des\s+(?:op[ée]rations|mouvements)`,
  String.raw`^\s*(?:sous[-\s])?totaux?\b`,
  String.raw`\b[àa]\s+reporter\b`,
  String.raw`^\s*report\b`,
].join('|'), 'i');

const CREDIT_HINT =
  /\b(VIR(EMENT)?\s+(SEPA\s+|INST\S*\s+)?(RECU|DE\b|EN\s+VOTRE\s+FAVEUR)|SALAIRE|PAIE\b|REMBOURSEMENT|REMB\b|AVOIR|CAF\b|CPAM|REMISE\s+(CHQ|CHEQUE)|VERSEMENT|DEPOT|INTERETS\s+CREDITEURS|PRIME\b|PENSION|ALLOCATION)/i;
const DEBIT_HINT =
  /\b(CB|CARTE|PRLV|PRELEVEMENT|RETRAIT|PAIEMENT|ACHAT|FRAIS|COTIS|COMMISSION|VIR(EMENT)?\s+(SEPA\s+)?(EMIS|VERS|A\b|POUR))/i;

// ——— Dates ————————————————————————————————————————————————————————

function matchLeadingDate(text) {
  let m = NUMERIC_DATE.exec(text);
  if (m) {
    const day = +m[1];
    const month = +m[2];
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { day, month, year: m[3] ? +m[3] : null, end: m[0].length };
    }
    return null;
  }
  m = TEXT_DATE.exec(text);
  if (m) {
    const month = MONTHS[fold(m[2])];
    const day = +m[1];
    if (month && day >= 1 && day <= 31) {
      return { day, month, year: m[3] ? +m[3] : null, end: m[0].length };
    }
  }
  return null;
}

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Date réelle ou null (rejette le 31/02, etc.). */
function makeDate(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t : null;
}

function resolveDate({ day, month, year }, ref) {
  let y = year;
  if (y == null) {
    // Année absente : celle de la fin de période, sauf si la date tombe
    // nettement après (relevé de janvier contenant des opérations de décembre).
    y = ref.getUTCFullYear();
    const candidate = makeDate(y, month, day);
    if (candidate && candidate - ref > 45 * 86400000) y -= 1;
  } else if (y < 100) {
    y += 2000;
  }
  return makeDate(y, month, day) ? iso(y, month, day) : null;
}

/** Date de référence : fin de période (« … au 30/09/2026 »), sinon date la plus récente. */
function findReferenceDate(lines, today) {
  const PERIOD = /\bau\s+(\d{1,2})(?:er)?[\s/.-]+(\d{1,2}|[A-Za-zÀ-ÿ]{3,9})\.?[\s/.-]+(\d{4})\b/gi;
  const FULL = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g;
  let periodEnd = null;
  let latest = null;

  for (const { text } of lines) {
    for (const m of text.matchAll(PERIOD)) {
      const month = /^\d+$/.test(m[2]) ? +m[2] : MONTHS[fold(m[2])];
      const d = month && makeDate(+m[3], month, +m[1]);
      if (d && (!periodEnd || d > periodEnd)) periodEnd = d;
    }
    for (const m of text.matchAll(FULL)) {
      const d = makeDate(+m[3], +m[2], +m[1]);
      if (d && d <= today && (!latest || d > latest)) latest = d;
    }
  }
  return periodEnd ?? latest ?? today;
}

// ——— Montants et colonnes ——————————————————————————————————————————

/** Espace qui est en réalité un écart entre deux colonnes (et non un séparateur de milliers). */
const isColumnGap = (line, i) => line.text[i] === ' ' && line.xe[i] - line.xs[i] > line.size * 0.6;

function findAmounts(line) {
  const out = [];
  const re = new RegExp(AMOUNT_RE.source, 'gi');
  let m;
  while ((m = re.exec(line.text))) {
    const start = m.index;
    const end = m.index + m[0].length;
    const gap = [...m[0]].findLastIndex((_, i) => isColumnGap(line, start + i));
    if (gap !== -1 && /\d/.test(m[0].slice(0, gap))) {
      re.lastIndex = start + gap + 1; // « 12   300,00 » : on repart après l'écart
      continue;
    }
    const sign = (m[1] ?? '').trim();
    const suffix = (m[4] ?? '').toUpperCase();
    out.push({
      start,
      end,
      cents: parseInt(m[2].replace(/\D/g, ''), 10) * 100 + parseInt(m[3], 10),
      negative: sign === '-' || sign === '−' || suffix === '-' || suffix === 'DB' || suffix === 'DR',
      positive: sign === '+' || suffix === '+' || suffix === 'CR',
      x0: line.xs[start],
      x1: line.xe[end - 1],
    });
  }
  return out;
}

function isHeader(text) {
  return text.length < 160 && /d[ée]bit/i.test(text) && /cr[ée]dit/i.test(text)
    && !HAS_AMOUNT.test(text);
}

function wordBox(line, re) {
  const m = re.exec(line.text);
  if (!m) return null;
  return { x0: line.xs[m.index], x1: line.xe[m.index + m[0].length - 1] };
}

function readColumns(line) {
  return {
    debit: wordBox(line, /d[ée]bit/i),
    credit: wordBox(line, /cr[ée]dit/i),
    balance: wordBox(line, /\bsolde\b/i),
  };
}

function nearestColumn(amount, columns) {
  const center = (amount.x0 + amount.x1) / 2;
  let best = null;
  let bestDist = Infinity;
  for (const [name, box] of Object.entries(columns)) {
    if (!box) continue;
    const dist = Math.min(Math.abs(center - (box.x0 + box.x1) / 2), Math.abs(amount.x1 - box.x1));
    if (dist < bestDist) { best = name; bestDist = dist; }
  }
  return best;
}

/**
 * Choisit le montant de l'opération sur la ligne et en déduit le sens.
 * Renvoie { amount, type, confidence, start } ou null.
 */
function pickAmount(amounts, columns, text, size, signedDocument) {
  if (!amounts.length) return null;

  if (columns) {
    // Un montant loin à gauche des colonnes fait partie du libellé (« ECHEANCE PRET 1 250,00 »)
    const left = Math.min(...Object.values(columns).filter(Boolean).map((b) => b.x0));
    const inColumns = amounts.filter((a) => a.x1 >= left - size * 4);
    for (const a of inColumns) {
      const col = nearestColumn(a, columns);
      if (col === 'debit' || col === 'credit') {
        return { amount: a.cents, type: col === 'credit' ? INCOME : EXPENSE, confidence: 'haute', start: a.start };
      }
    }
    if (inColumns.length) return null; // uniquement un solde
  }

  // Sans colonnes : le premier montant (un éventuel second est souvent le solde)
  const a = amounts[0];
  if (a.negative) return { amount: a.cents, type: EXPENSE, confidence: 'haute', start: a.start };
  if (a.positive) return { amount: a.cents, type: INCOME, confidence: 'haute', start: a.start };
  // Relevé où seuls les débits portent un « - » : un montant sans signe est un crédit
  if (signedDocument) return { amount: a.cents, type: INCOME, confidence: 'moyenne', start: a.start };
  if (CREDIT_HINT.test(text)) return { amount: a.cents, type: INCOME, confidence: 'moyenne', start: a.start };
  if (DEBIT_HINT.test(text)) return { amount: a.cents, type: EXPENSE, confidence: 'moyenne', start: a.start };
  return { amount: a.cents, type: EXPENSE, confidence: 'basse', start: a.start };
}

const cleanLabel = (s) => s.replace(/\s+/g, ' ').trim().replace(TRAILING_DATE, '').replace(/[\s€]+$/, '');

const firstCharIndex = (text) => text.search(/\S/);

// ——— Parseur principal ———————————————————————————————————————————

/**
 * @param {Array} lines  sortie de pdf-layout.js
 * @returns {{ transactions: Array<{date, label, amount, type, confidence, page, raw}>,
 *             referenceDate: string, columnsDetected: boolean }}
 */
export function parseStatement(lines, { today = new Date() } = {}) {
  const ref = findReferenceDate(lines, today);
  const signedDocument = lines.some((l) => matchLeadingDate(l.text) && findAmounts(l).some((a) => a.negative));

  const transactions = [];
  let columns = null;
  let columnsDetected = false;
  let current = null;

  const close = () => {
    if (current?.amount) {
      const { date, label, amount, type, confidence, page, raw } = current;
      transactions.push({ date, label, amount, type, confidence, page, raw: raw.join('\n') });
    }
    current = null;
  };

  for (const line of lines) {
    const { text } = line;
    if (!text.trim()) continue;
    if (current && line.page !== current.page) close();

    if (isHeader(text)) {
      close();
      columns = readColumns(line);
      columnsDetected = true;
      continue;
    }
    if (SKIP_RE.test(text)) { close(); continue; }

    const amounts = findAmounts(line);
    const date = matchLeadingDate(text);

    if (date) {
      close();
      let labelStart = date.end;
      const valueDate = matchLeadingDate(text.slice(labelStart));
      if (valueDate) labelStart += valueDate.end;

      const after = amounts.filter((a) => a.start >= labelStart);
      const picked = pickAmount(after, columns, text, line.size, signedDocument);
      const labelEnd = picked ? picked.start : (after[0]?.start ?? text.length);
      const label = cleanLabel(text.slice(labelStart, labelEnd));
      const resolved = resolveDate(date, ref);
      if (!resolved || !label || SKIP_RE.test(label)) continue;

      const labelIndex = labelStart + Math.max(0, firstCharIndex(text.slice(labelStart)));
      current = {
        date: resolved,
        label,
        amount: picked?.amount ?? null,
        type: picked?.type ?? null,
        confidence: picked?.confidence ?? null,
        page: line.page,
        labelX: line.xs[labelIndex] ?? 0,
        lastY: line.y,
        size: line.size,
        extra: 0,
        raw: [text.trim()],
      };
      continue;
    }

    if (!current) continue;

    // Ligne de continuation ?
    const gap = current.lastY - line.y;
    const startX = line.xs[firstCharIndex(text)];
    const aligned = startX >= current.labelX - current.size;
    if (gap <= 0 || gap > current.size * 2.6 || !aligned || current.extra >= 3) { close(); continue; }

    if (amounts.length) {
      if (current.amount != null) { close(); continue; }
      const picked = pickAmount(amounts, columns, text, line.size, signedDocument);
      if (!picked) { close(); continue; }
      Object.assign(current, { amount: picked.amount, type: picked.type, confidence: picked.confidence });
      const rest = cleanLabel(text.slice(0, picked.start));
      if (rest) current.label += ` ${rest}`;
    } else {
      current.label += ` ${cleanLabel(text)}`;
      current.extra++;
    }
    current.lastY = line.y;
    current.raw.push(text.trim());
  }
  close();

  return { transactions, referenceDate: ref.toISOString().slice(0, 10), columnsDetected };
}
