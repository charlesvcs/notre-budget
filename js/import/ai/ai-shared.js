/**
 * Partie « pure » de la catégorisation par IA locale : nettoyage des libellés,
 * description des catégories et construction du prompt. Aucune dépendance,
 * utilisable dans le worker comme dans les tests.
 */

/**
 * Modèles essayés dans l'ordre (installés dans /models par
 * scripts/installer-modele-ia.sh). Le 4B (≈ 3 Go) ne tient que sur la carte
 * graphique : WebAssembly est limité à 4 Go de mémoire. Le 2B sert de repli.
 */
export const AI_MODELS = [
  { id: 'onnx-community/Qwen3.5-4B-ONNX', device: 'webgpu', dtype: 'q4' },
  { id: 'onnx-community/Qwen3.5-2B-ONNX', device: 'webgpu', dtype: 'q4' },
  { id: 'onnx-community/Qwen3.5-2B-ONNX', device: 'wasm', dtype: 'q4' },
];

/** En dessous de cette confiance (0 à 1), la suggestion de l'IA est signalée « à vérifier ». */
export const AI_CONFIDENT = 0.5;

/** Description de chaque catégorie, telle que présentée au modèle. */
export const CATEGORY_GUIDE = {
  courses: 'courses alimentaires : supermarché, épicerie, boulangerie, boucherie, primeur, magasin bio, surgelés',
  sorties: 'sorties et loisirs : restaurant, fast-food, pizzeria, crêperie, bar, livraison de repas, cinéma, parc d\'attractions, spectacle, vacances, hôtel',
  abonnements: 'abonnements : streaming, téléphone mobile, box internet, presse, logiciel, VPN, salle de sport, service en ligne mensuel',
  frais: 'frais, assurances et impôts : assurance auto ou habitation, mutuelle, prévoyance, cotisation carte bancaire, frais et commissions bancaires, impôts, amendes',
  logement: 'logement : loyer, crédit immobilier, électricité, gaz, eau, charges, travaux, bricolage, jardinage, meubles, électroménager',
  transports: 'transports : carburant, recharge de voiture électrique, péage, train, bus, avion, VTC, taxi, autopartage, trottinette, entretien automobile',
  sante: 'santé : médecin, dentiste, pharmacie, opticien, laboratoire d\'analyses, kiné, hôpital, audioprothésiste, podologue',
  revenus: 'revenus : salaire, retraite, allocations, remboursement reçu, vente entre particuliers',
  epargne: 'épargne et investissement : livret, assurance vie, plan d\'épargne, bourse, cryptomonnaie',
  autre: 'autre : retrait d\'espèces, chèque, beauté, high-tech, achats en ligne divers, poste',
  cadeaux: 'cadeaux : coffret cadeau, carte cadeau, fleuriste, jouets, achats pour offrir',
  vetements: 'vêtements : prêt-à-porter, chaussures, mode, accessoires',
  coiffeur: 'coiffeur : salon de coiffure, barbier',
  cafe: 'café : café, salon de thé, coffee shop',
  travail: 'travail : frais professionnels, déplacements et formalités liées au travail',
  parking: 'parking : parking, stationnement, horodateur',
  commun: 'courses communes : virement vers le compte commun, qui paie les courses du couple',
};

/**
 * Retire le « bruit » bancaire qui n'aide pas à comprendre l'opération :
 * « CARTE X3403 12/06 CREP PIERRE DORE » → « CARTE CREP PIERRE DORE »
 * « VIR RECU 9049406507 DE: CALSUN HOLDING MOTIF: )VIREMENT NET A PAYER 07/0852 »
 *   → « VIR RECU de CALSUN HOLDING motif VIREMENT NET A PAYER »
 */
export function cleanForAI(label) {
  return label
    .replace(/\b(CARTE|CB)\s+X\d{4}\b/gi, '$1')
    .replace(/\b(ID|REF|MDT|N°)\s*:?\s*\S+/gi, ' ')
    .replace(/\bDE\s*:/gi, 'de ')
    .replace(/\bMOTIF\s*:/gi, 'motif ')
    .replace(/\bPOUR\s*:/gi, 'pour ')
    .replace(/\S*\d\S*/g, ' ') // références, dates, heures, montants
    .replace(/[()*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Descriptions effectives, y compris pour des catégories ajoutées par l'utilisateur. */
export function guideFor(categories) {
  return categories.map((c) => ({ id: c.id, text: CATEGORY_GUIDE[c.id] ?? c.name.toLowerCase() }));
}

const EXAMPLES = [
  ['dépense', 'CARTE LECLERC DRIVE', 'courses'],
  ['dépense', 'CARTE LE PETIT BOUCHON', 'sorties'],
  ['rentrée', 'VIR RECU de DUPONT SA motif PAIE', 'revenus'],
  ['dépense', 'PRELEVEMENT EUROPEEN de MAAF ASSURANCES', 'frais'],
];

/** Messages de chat pour un modèle génératif (réponse attendue : un identifiant). */
export function buildMessages(item, guide) {
  const list = guide.map((g) => `- ${g.id} = ${g.text}`).join('\n');
  const sens = item.type === 'entree' ? 'rentrée' : 'dépense';
  const shots = EXAMPLES.map(([s, l, id]) => `Opération (${s}) : ${l}\nCatégorie : ${id}`).join('\n\n');
  return [
    {
      role: 'system',
      content: 'Tu ranges des opérations de relevés bancaires français dans une catégorie de budget. '
        + 'Tu connais les enseignes et entreprises françaises. Réponds uniquement par l\'identifiant de la catégorie.',
    },
    {
      role: 'user',
      content: `Catégories :\n${list}\n\nExemples :\n${shots}\n\nOpération (${sens}) : ${cleanForAI(item.label)}\nCatégorie :`,
    },
  ];
}

/**
 * Variante par lots : plusieurs opérations dans une seule requête. Les
 * descriptions de catégories (la partie longue du prompt) ne sont lues qu'une fois.
 */
export function buildBatchMessages(items, guide) {
  const list = guide.map((g) => `- ${g.id} = ${g.text}`).join('\n');
  const shots = EXAMPLES.map(([s, l, id], i) => `${i + 1}. (${s}) ${l} → ${id}`).join('\n');
  const ops = items.map((it, i) => `${i + 1}. (${it.type === 'entree' ? 'rentrée' : 'dépense'}) ${cleanForAI(it.label)}`).join('\n');
  return [
    {
      role: 'system',
      content: 'Tu ranges des opérations de relevés bancaires français dans une catégorie de budget. '
        + 'Tu connais les enseignes et entreprises françaises. Pour chaque opération numérotée, '
        + 'réponds sur une ligne « numéro. identifiant », sans aucun autre texte.',
    },
    {
      role: 'user',
      content: `Catégories :\n${list}\n\nExemples :\n${shots}\n\nOpérations à classer :\n${ops}`,
    },
  ];
}

/**
 * Variante « QCM » : chaque catégorie reçoit une lettre (A, B, C…) et on lit
 * directement la probabilité que le modèle donne à chaque lettre, au lieu de
 * le laisser écrire. Toutes les réponses font alors un seul jeton : les
 * identifiants courts (« courses », « autre ») ne sont plus avantagés.
 */
export const CHOICE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function buildChoiceMessages(item, guide) {
  const letterOf = new Map(guide.map((g, i) => [g.id, CHOICE_LETTERS[i]]));
  const list = guide.map((g, i) => `${CHOICE_LETTERS[i]}. ${g.text}`).join('\n');
  const shots = EXAMPLES.filter(([, , id]) => letterOf.has(id))
    .map(([s, l, id]) => `Opération (${s}) : ${l}\nRéponse : ${letterOf.get(id)}`).join('\n\n');
  const sens = item.type === 'entree' ? 'rentrée' : 'dépense';
  return [
    {
      role: 'system',
      content: 'Tu ranges des opérations de relevés bancaires français dans une catégorie de budget. '
        + 'Tu connais les enseignes et entreprises françaises. Réponds uniquement par la lettre de la catégorie.',
    },
    {
      role: 'user',
      content: `Catégories :\n${list}\n\nExemples :\n${shots}\n\nOpération (${sens}) : ${cleanForAI(item.label)}\nRéponse :`,
    },
  ];
}

/** Probabilités (somme = 1) des lettres, à partir des logits du prochain jeton. */
export function choiceProbabilities(logits, letterTokens) {
  const scores = letterTokens.map((ids) => Math.max(...ids.map((t) => logits[t])));
  const max = Math.max(...scores);
  const exp = scores.map((s) => Math.exp(s - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((e) => e / sum);
}

/**
 * Calibration contextuelle (Zhao et al., 2021) : on mesure la préférence du
 * modèle pour chaque catégorie face à une opération vide, puis on la retire.
 * Corrige la tendance à répondre « courses » ou « autre » quand il hésite.
 */
export function calibrate(probs, prior) {
  const adjusted = probs.map((p, i) => p / Math.max(prior[i], 1e-6));
  const sum = adjusted.reduce((a, b) => a + b, 0);
  return adjusted.map((p) => p / sum);
}

/** Opération « sans contenu » servant à mesurer le biais du modèle. */
export const NEUTRAL_LABEL = 'N/A';

/** Lit une réponse « 1. courses\n2. sorties… » → tableau d'identifiants (null si absent). */
export function parseBatchAnswer(text, count, ids) {
  const out = new Array(count).fill(null);
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s*[.):-]\s*(.+)$/.exec(line);
    if (m && +m[1] >= 1 && +m[1] <= count) out[+m[1] - 1] = parseAnswer(m[2], ids);
  }
  return out;
}

/** Extrait l'identifiant de catégorie de la réponse du modèle (ou null). */
export function parseAnswer(text, ids) {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let best = null;
  for (const id of ids) {
    const i = t.search(new RegExp(`\\b${id}\\b`));
    if (i !== -1 && (best === null || i < best.i)) best = { id, i };
  }
  return best?.id ?? null;
}
