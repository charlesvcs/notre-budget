/**
 * Données publiques mises à jour automatiquement. Aucune donnée personnelle
 * n'est envoyée : l'app demande seulement des séries officielles publiques.
 *
 *  - INSEE, API « Séries chronologiques » (accès libre) : inflation sur un an
 *    (IPC, IPCH, sous-jacente) et inflation moyenne de chaque année.
 *  - BCE, portail de données : €STR, le taux du marché monétaire.
 *  - Taux du Livret A et du LEP : la page officielle service-public.gouv.fr,
 *    lue par le serveur local du Mac (le navigateur ne peut pas la lire
 *    directement). Sans lui (iPhone, site publié), les données ouvertes de la
 *    Caisse des Dépôts, publiées avec quelques mois de retard.
 *
 * Le résultat est rangé dans le réglage « donneesOfficielles » : il passe dans
 * la sauvegarde chiffrée, donc l'iPhone profite de ce que le Mac a récupéré.
 */

const INSEE = 'https://api.insee.fr/series/BDM/data/SERIES_BDM/';
// Identifiants des séries (base 2025) : France, ensemble des ménages, ensemble
export const INSEE_SERIES = {
  ipc: '011814632',   // IPC, glissement annuel
  ipch: '011812232',  // IPCH, glissement annuel
  core: '011814145',  // inflation sous-jacente, glissement annuel
  annual: '011814640', // IPC, variation annuelle (moyenne de l'année)
};
const ECB_ESTR = 'https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?lastNObservations=1&format=csvdata';
const CDC_RATES = 'https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets/flux-et-taux-la-ldds-lep/records'
  + '?select=date,tla_tldds_percent,tlep_percent&order_by=date%20desc&limit=100';
const LOCAL_RATES = './api/taux-livrets';

export const SOURCES = {
  insee: { name: 'INSEE', url: 'https://www.insee.fr/fr/statistiques/serie/011814632' },
  bce: { name: 'BCE', url: 'https://data.ecb.europa.eu/data/datasets/EST' },
  servicePublic: { name: 'service-public.gouv.fr', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2365' },
  cdc: { name: 'Caisse des Dépôts (données ouvertes)', url: 'https://opendata.caissedesdepots.fr/explore/dataset/flux-et-taux-la-ldds-lep/' },
};

/** Délai au-delà duquel on redemande les données (12 h). */
export const REFRESH_MS = 12 * 3600 * 1000;
const TIMEOUT_MS = 12000;

async function get(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`réponse ${res.status}`);
    return res;
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'délai dépassé' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

/** INSEE : les quatre séries en une seule requête (format SDMX-ML). */
export async function fetchInsee() {
  const ids = Object.values(INSEE_SERIES).join('+');
  const xml = await (await get(`${INSEE}${ids}?lastNObservations=10`)).text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const series = {};
  for (const node of doc.getElementsByTagName('Series')) {
    series[node.getAttribute('IDBANK')] = [...node.getElementsByTagName('Obs')]
      .map((o) => ({ period: o.getAttribute('TIME_PERIOD'), value: Number(o.getAttribute('OBS_VALUE')) }))
      .filter((o) => o.period && Number.isFinite(o.value))
      .sort((a, b) => b.period.localeCompare(a.period));
  }
  const latest = (key) => series[INSEE_SERIES[key]]?.[0] ?? null;
  const ipc = latest('ipc');
  if (!ipc) throw new Error('série de l\'inflation absente de la réponse');
  return {
    inflation: { rate: ipc.value, month: ipc.period },
    indices: {
      month: ipc.period,
      ipch: latest('ipch')?.value ?? null,
      core: latest('core')?.value ?? null,
    },
    annual: Object.fromEntries((series[INSEE_SERIES.annual] ?? []).map((o) => [o.period, o.value])),
  };
}

/** BCE : dernier €STR publié (CSV). */
export async function fetchEstr() {
  const csv = (await (await get(ECB_ESTR)).text()).trim().split('\n');
  const header = parseCsvLine(csv[0]);
  const row = parseCsvLine(csv[1] ?? '');
  const rate = Number(row[header.indexOf('OBS_VALUE')]);
  const date = row[header.indexOf('TIME_PERIOD')];
  if (!Number.isFinite(rate) || !date) throw new Error('€STR absent de la réponse');
  return { rate, date };
}

/**
 * Taux des livrets : d'abord le serveur local (service-public.gouv.fr, à jour
 * le jour même), sinon la Caisse des Dépôts (série mensuelle, en retard).
 * @returns {{ rates: Array<{from, livretA?, lep?}>, source: string, asOf: string }}
 */
export async function fetchLivretRates() {
  try {
    const data = await (await get(LOCAL_RATES)).json();
    const taux = data?.taux ?? {};
    if (taux.livretA || taux.lep) {
      const byDate = new Map();
      for (const [product, t] of Object.entries(taux)) {
        if (!t?.since || !Number.isFinite(t.rate)) continue;
        byDate.set(t.since, { ...byDate.get(t.since), from: t.since, [product]: t.rate });
      }
      if (byDate.size) return { rates: [...byDate.values()], source: 'servicePublic', asOf: data.lu?.slice(0, 10) };
    }
  } catch {
    // Pas de serveur local (iPhone, site publié) : on passe à la source suivante
  }
  const data = await (await get(CDC_RATES)).json();
  const rows = (data.results ?? [])
    .filter((r) => r.date && Number.isFinite(r.tla_tldds_percent) && Number.isFinite(r.tlep_percent))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) throw new Error('aucun taux dans la réponse');
  // Un changement de taux d'un mois à l'autre = un nouveau taux au 1er de ce mois
  const rates = [];
  let previous = null;
  for (const r of rows) {
    const livretA = Math.round(r.tla_tldds_percent * 100) / 100;
    const lep = Math.round(r.tlep_percent * 100) / 100;
    if (!previous || previous.livretA !== livretA || previous.lep !== lep) rates.push({ from: `${r.date}-01`, livretA, lep });
    previous = { livretA, lep };
  }
  return { rates, source: 'cdc', asOf: rows.at(-1).date };
}

/**
 * Récupère tout ce qui est disponible ; une source en panne n'empêche pas les autres.
 * @param {object} previous  dernier résultat enregistré (conservé pour une source en échec)
 */
export async function refreshOfficialData(previous = null) {
  const [insee, estr, livrets] = await Promise.allSettled([fetchInsee(), fetchEstr(), fetchLivretRates()]);
  const errors = {};
  const pick = (result, key, fallback) => {
    if (result.status === 'fulfilled') return result.value;
    errors[key] = result.reason?.message ?? 'erreur inconnue';
    return fallback;
  };
  return {
    fetchedAt: new Date().toISOString(),
    insee: pick(insee, 'insee', previous?.insee ?? null),
    estr: pick(estr, 'bce', previous?.estr ?? null),
    livrets: pick(livrets, 'livrets', previous?.livrets ?? null),
    errors,
  };
}

export const isStale = (data) => !data?.fetchedAt || Date.now() - Date.parse(data.fetchedAt) > REFRESH_MS;

function parseCsvLine(line) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cell); cell = ''; } else cell += c;
  }
  out.push(cell);
  return out;
}
