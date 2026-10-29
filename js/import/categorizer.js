/**
 * Catégorisation automatique des libellés bancaires.
 *
 * Priorité :
 *  1. Règles apprises (corrections faites par vous lors des imports précédents)
 *  2. Dictionnaire de mots-clés (enseignes françaises courantes) : le mot-clé
 *     le plus long gagne, « UBER EATS » (Sorties) l'emporte sur « UBER » (Transports)
 *  3. Par défaut : Revenus pour une entrée, Autre pour une sortie
 */

const KEYWORDS = {
  abonnements: [
    'NETFLIX', 'SPOTIFY', 'DEEZER', 'DISNEY PLUS', 'DISNEYPLUS', 'CANAL', 'CANALSAT', 'AMAZON PRIME',
    'PRIME VIDEO', 'APPLE COM BILL', 'APPLE COM', 'ITUNES', 'ICLOUD', 'GOOGLE STORAGE', 'GOOGLE ONE',
    'YOUTUBE', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'ADOBE', 'MICROSOFT', 'AUDIBLE', 'KINDLE',
    'OPENAI', 'CHATGPT', 'MOLOTOV', 'DAZN', 'BEIN', 'PARAMOUNT', 'CRUNCHYROLL', 'HBO',
    'FREE MOBILE', 'FREEBOX', 'FREE TELECOM', 'ORANGE', 'SOSH', 'SFR', 'RED BY SFR', 'BOUYGUES', 'BOUYGUES TELECOM',
    'BASIC FIT', 'FITNESS PARK', 'NEONESS', 'KEEP COOL', 'ON AIR', 'CMG SPORTS', 'ABONNEMENT',
  ],
  courses: [
    'CARREFOUR', 'CARREFOUR MARKET', 'CARREFOUR CITY', 'LECLERC', 'E LECLERC', 'AUCHAN', 'INTERMARCHE',
    'LIDL', 'ALDI', 'MONOPRIX', 'FRANPRIX', 'CASINO', 'SUPER U', 'HYPER U', 'U EXPRESS', 'SYSTEME U',
    'COOP', 'BIOCOOP', 'NATURALIA', 'LA VIE CLAIRE', 'PICARD', 'GRAND FRAIS', 'CORA', 'NETTO',
    'LEADER PRICE', 'SPAR', 'G20', 'PROXI', 'VIVAL', 'CARREFOUR CONTACT', 'BOULANGERIE', 'BOUCHERIE',
    'PRIMEUR', 'FROMAGERIE', 'CAVISTE', 'NICOLAS', 'DRIVE',
  ],
  sorties: [
    'RESTAURANT', 'RESTO', 'BRASSERIE', 'BISTROT', 'BAR', 'PUB', 'MCDONALDS', 'MC DONALDS',
    'MCDO', 'BURGER KING', 'KFC', 'QUICK', 'FIVE GUYS', 'DOMINOS', 'PIZZA', 'SUSHI', 'DELIVEROO',
    'UBER EATS', 'UBEREATS', 'JUST EAT', 'CINEMA', 'UGC', 'PATHE', 'GAUMONT', 'MK2',
    'TICKETMASTER', 'FNAC SPECTACLES', 'THEATRE', 'CONCERT', 'MUSEE', 'BOWLING', 'AIRBNB', 'BOOKING',
  ],
  logement: [
    'LOYER', 'FONCIA', 'NEXITY', 'CITYA', 'SYNDIC', 'EDF', 'ENGIE', 'TOTALENERGIES ELEC', 'EKWATEUR',
    'OHM ENERGIE', 'MINT ENERGIE', 'VEOLIA', 'SUEZ', 'SAUR', 'EAU DE', 'GRDF', 'TAXE FONCIERE',
    'TAXE HABITATION', 'IKEA', 'LEROY MERLIN', 'CASTORAMA', 'BRICOMARCHE', 'BRICO DEPOT', 'CONFORAMA',
    'MAISONS DU MONDE', 'PRET IMMO', 'ECHEANCE PRET', 'CREDIT IMMOBILIER',
  ],
  transports: [
    'SNCF', 'SNCF CONNECT', 'OUIGO', 'TGV', 'TER', 'RATP', 'NAVIGO', 'TCL', 'TISSEO', 'RTM', 'TAN',
    'UBER', 'BOLT', 'HEETCH', 'G7', 'BLABLACAR', 'LIME', 'DOTT', 'VELIB', 'TOTAL', 'TOTALENERGIES',
    'CHARGEMAP',
    'ESSO', 'SHELL', 'AVIA', 'BP', 'CARBURANT', 'STATION', 'AUTOROUTE', 'VINCI AUTOROUTES', 'SANEF',
    'APRR', 'PEAGE', 'AIR FRANCE', 'EASYJET', 'RYANAIR',
    'TRANSAVIA', 'VOLOTEA', 'NORAUTO', 'FEU VERT', 'SPEEDY', 'MIDAS', 'CONTROLE TECHNIQUE',
  ],
  sante: [
    'PHARMACIE', 'PHARMA', 'DOCTEUR', 'MEDECIN', 'DENTISTE', 'ORTHODONTISTE', 'OPTICIEN', 'KRYS',
    'AFFLELOU', 'ATOL', 'OPTIC', 'LABORATOIRE', 'LABO', 'KINE', 'OSTEO', 'OSTEOPATHE', 'HOPITAL',
    'CLINIQUE', 'DOCTOLIB', 'CPAM', 'AMELI',
  ],
  frais: [
    'ASSURANCE', 'ASSUR', 'MAIF', 'MACIF', 'MAAF', 'MATMUT', 'GMF', 'AXA', 'ALLIANZ', 'GENERALI',
    'GROUPAMA', 'ABEILLE', 'SWISS LIFE', 'MUTUELLE', 'HARMONIE', 'MGEN', 'ALAN', 'PREVOYANCE',
    'AG2R', 'MALAKOFF', 'HUMANIS', 'APRIL', 'LUKO', 'COTISATION', 'COTIS', 'FRAIS', 'COMMISSION',
    'AGIOS', 'OFFRE GROUPEE', 'IMPOT', 'IMPOTS', 'DGFIP', 'FINANCES PUBLIQUES', 'AMENDE', 'ANTAI',
  ],
  revenus: [
    'SALAIRE', 'PAIE', 'CAF', 'POLE EMPLOI', 'FRANCE TRAVAIL', 'PENSION', 'RETRAITE', 'PRIME',
    'DIVIDENDE', 'DIVIDENDES', 'INTERETS CREDITEURS',
  ],
  cadeaux: ['CADEAU', 'CADEAUX', 'SMARTBOX', 'WONDERBOX', 'BONGO', 'CARTE CADEAU'],
  vetements: [
    'VETEMENT', 'VETEMENTS', 'ZARA', 'H M', 'KIABI', 'UNIQLO', 'PRIMARK', 'CELIO', 'JULES', 'BERSHKA',
    'PULL AND BEAR', 'MANGO', 'PROMOD', 'CAMAIEU', 'SEZANE', 'GALERIES LAFAYETTE', 'ZALANDO', 'SHEIN',
  ],
  coiffeur: [
    'COIFFEUR', 'COIFFURE', 'COIFF', 'BARBIER', 'BARBER', 'CAMILLE ALBANE', 'JEAN LOUIS DAVID',
    'FRANCK PROVOST', 'DESSANGE', 'SAINT ALGUE', 'TCHIP',
  ],
  cafe: ['CAFE', 'CAFES', 'COFFEE', 'STARBUCKS', 'COLUMBUS', 'COLUMBUS CAFE', 'COSTA COFFEE'],
  travail: ['TRAVAIL'],
  parking: [
    'PARKING', 'INDIGO', 'EFFIA', 'SAEMES', 'Q PARK', 'QPARK', 'ONEPARK', 'ZENPARK', 'PAYBYPHONE',
    'FLOWBIRD', 'STATIONNEMENT',
  ],
  // Virements vers le compte commun
  commun: ['COMMUN', 'COMPTE COMMUN'],
  linges: [
    'LINGE', 'LINGES', 'PRESSING', 'LAVERIE', 'BLANCHISSERIE', '5 A SEC', 'LINVOSGES',
    'CARRE BLANC', 'BOUCHARA', 'COMPAGNIE DU BLANC', 'BLANC CERISE',
  ],
  beaute: [
    'BEAUTE', 'SEPHORA', 'NOCIBE', 'MARIONNAUD', 'YVES ROCHER', 'KIKO', 'ADOPT', 'L OCCITANE',
    'OCCITANE', 'RITUALS', 'NYX', 'ESTHETICIENNE', 'INSTITUT DE BEAUTE', 'PARFUMERIE',
    'MANUCURE', 'ONGLERIE', 'AROMA ZONE', 'AROMAZONE', 'THE BODY SHOP', 'AESOP', 'OH MY CREAM',
  ],
  virements: [
    'VIREMENT', 'VIREMENTS', 'VIREMENT SEPA', 'VIREMENT INSTANTANE', 'VIR SEPA', 'VIR INST',
    'WERO', 'PAYLIB', 'LYDIA', 'SUMERIA', 'PAYPAL', 'REVOLUT',
  ],
  dejeuners: [
    'DEJEUNER', 'DEJEUNERS', 'SWILE', 'EDENRED', 'TICKET RESTAURANT', 'BIMPLI', 'SODEXO', 'PLUXEE',
    'UP DEJEUNER', 'CANTINE', 'SELF', 'PAUL', 'BRIOCHE DOREE', 'PRET A MANGER', 'COJEAN', 'EXKI',
    'CLASS CROUTE', 'POMME DE PAIN', 'LA MIE CALINE', 'SUBWAY', 'POKAWA', 'BOULANGERIE ANGE',
    'MARIE BLACHERE', 'FEUILLETTE',
  ],
  sport: [
    'SPORT', 'DECATHLON', 'INTERSPORT', 'GO SPORT', 'SPORT 2000', 'COURIR', 'NIKE', 'ADIDAS',
    'ASICS', 'SALOMON', 'PISCINE', 'TENNIS', 'PADEL', 'ESCALADE', 'ARKOSE', 'CLIMB UP',
    'RUNNING', 'FITNESS', 'YOGA', 'CROSSFIT',
  ],
  loisirs: [
    'LOISIR', 'LOISIRS', 'FNAC', 'CULTURA', 'DECITRE', 'GIBERT', 'MICROMANIA', 'STEAM', 'LEGO',
    'JOUECLUB', 'KING JOUET', 'NATURE ET DECOUVERTES', 'DISNEYLAND', 'PARC ASTERIX', 'PUY DU FOU',
    'FUTUROSCOPE', 'ZOO', 'AQUARIUM', 'ESCAPE GAME', 'LASER GAME', 'KARTING', 'BILLARD',
  ],
  // Opérations sans commerçant identifiable
  autre: ['CHEQUE', 'CHQ', 'RETRAIT', 'RETRAIT DAB', 'DAB', 'RETRAIT ESPECES'],
  epargne: [
    'LIVRET A', 'LIVRET', 'LDDS', 'LEP', 'PEL', 'CEL', 'ASSURANCE VIE', 'PEA', 'EPARGNE',
    'TRADE REPUBLIC', 'BOURSE DIRECT', 'LINXEA', 'YOMONI', 'NALO', 'GOODVEST', 'RAMIFY',
  ],
};

const NOISE = new Set([
  'CB', 'CARTE', 'PAIEMENT', 'PAIEMT', 'PAR', 'PRLV', 'PRELEVEMENT', 'PRELEV', 'SEPA', 'VIR', 'VIREMENT',
  'VIRT', 'INST', 'INSTANTANE', 'RECU', 'EMIS', 'FACTURE', 'FACT', 'FAC', 'DU', 'LE', 'LA', 'LES',
  'DE', 'DES', 'REF', 'ECH', 'MDT', 'ID', 'NUM', 'ACHAT', 'WEB', 'INTERNET', 'EUR', 'FR', 'SAS',
  'SARL', 'SA', 'ET', 'EN', 'AU', 'VERS', 'POUR', 'M', 'MR', 'MME', 'MLLE', 'MONSIEUR', 'MADAME',
]);

const RECURRING_HINT = /\b(PRLV|PRELEVEMENT|ECHEANCE|ABONNEMENT|LOYER|MENSUALITE|COTISATION)\b/;

/** Majuscules, sans accents ni ponctuation : « Café d'Écosse » → « CAFE D ECOSSE ». */
export function normalizeLabel(label) {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/['’]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
}

/**
 * Clé « marchand » stable d'un libellé, débarrassée des préfixes bancaires,
 * dates et références : « CB BOULANGERIE MARIE 12/10 X4521 » → « BOULANGERIE MARIE ».
 */
export function merchantKey(label) {
  return normalizeLabel(label).split(' ')
    .filter((t) => t.length > 1 && !NOISE.has(t) && !/\d/.test(t))
    .slice(0, 3)
    .join(' ');
}

const containsWord = (haystack, needle) => haystack.includes(` ${needle} `);

// Mots collés (« CARREFOURMARKET ») : un mot-clé long est aussi cherché sans espaces
const COMPACT_MIN = 6;
const matches = (padded, compact, word) =>
  containsWord(padded, word) || (word.length >= COMPACT_MIN && compact.includes(word.replace(/ /g, '')));

/**
 * @param {Array} categories  catégories actives de la base
 * @param {Array} rules       règles apprises { key, categoryId, recurring }
 */
export function createCategorizer(categories, rules = []) {
  const known = new Set(categories.map((c) => c.id));
  const byKind = Object.fromEntries(categories.map((c) => [c.id, c.kind]));

  const keywords = Object.entries(KEYWORDS)
    .filter(([id]) => known.has(id))
    .flatMap(([categoryId, words]) => words.map((w) => ({ word: normalizeLabel(w), categoryId })));

  const learned = rules.filter((r) => known.has(r.categoryId));
  const learnedByKey = new Map(learned.map((r) => [r.key, r]));
  const learnedFuzzy = learned.filter((r) => r.key.length >= 4);

  const fallback = (type) => (type === 'entree' && known.has('revenus') ? 'revenus' : 'autre');

  /** @returns {{ categoryId, source: 'appris'|'mot-cle'|'defaut', recurring: boolean }} */
  function suggest(label, type) {
    const norm = normalizeLabel(label);
    const padded = ` ${norm} `;
    const compact = norm.replace(/ /g, '');
    const recurringHint = RECURRING_HINT.test(norm);

    const exact = learnedByKey.get(merchantKey(label));
    const rule = exact ?? longest(learnedFuzzy.filter((r) => containsWord(padded, r.key)), (r) => r.key);
    if (rule) {
      return { categoryId: rule.categoryId, source: 'appris', recurring: Boolean(rule.recurring) || recurringHint };
    }

    const hit = longest(keywords.filter((k) => matches(padded, compact, k.word)), (k) => k.word);
    // Un mot-clé de revenu sur une sortie (« PRIME » d'assurance…) n'est pas fiable
    if (hit && !(byKind[hit.categoryId] === 'entree' && type === 'sortie')) {
      return {
        categoryId: hit.categoryId,
        source: 'mot-cle',
        recurring: recurringHint || hit.categoryId === 'abonnements',
      };
    }

    return { categoryId: fallback(type), source: 'defaut', recurring: recurringHint };
  }

  return { suggest };
}

function longest(list, keyOf) {
  let best = null;
  for (const item of list) if (!best || keyOf(item).length > keyOf(best).length) best = item;
  return best;
}
