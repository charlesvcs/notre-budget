import { PROFILES } from './schema.js';

// Categories inserees au premier lancement. Les `id` sont des slugs stables :
// ne pas les renommer, les transactions y font reference.
export const DEFAULT_CATEGORIES = [
  // Base
  { id: 'courses',      name: 'Courses',                 kind: 'sortie',  icon: '', color: '#D97706', group: 'base' },
  { id: 'sorties',      name: 'Sorties',                 kind: 'sortie',  icon: '', color: '#E11D48', group: 'base' },
  { id: 'abonnements',  name: 'Abonnements',             kind: 'sortie',  icon: '', color: '#2563EB', group: 'base' },
  { id: 'frais',        name: 'Frais & assurances',      kind: 'sortie',  icon: '', color: '#475569', group: 'base' },
  // Etendues
  { id: 'logement',     name: 'Logement',                kind: 'sortie',  icon: '', color: '#B45309', group: 'etendue' },
  { id: 'transports',   name: 'Transports',              kind: 'sortie',  icon: '', color: '#0D9488', group: 'etendue' },
  { id: 'sante',        name: 'Santé',                   kind: 'sortie',  icon: '', color: '#16A34A', group: 'etendue' },
  { id: 'revenus',      name: 'Revenus',                 kind: 'entree',  icon: '', color: '#0E8A43', group: 'etendue' },
  { id: 'epargne',      name: 'Épargne & investissement', kind: 'epargne', icon: '', color: '#0F766E', group: 'etendue' },
  // Filet de securite pour les imports non categorises
  { id: 'autre',        name: 'Autre',                   kind: 'sortie',  icon: '', color: '#64748B', group: 'base' },
  // Categories personnelles
  { id: 'cadeaux',      name: 'Cadeaux',                 kind: 'sortie',  icon: '', color: '#DB2777', group: 'perso' },
  { id: 'vetements',    name: 'Vêtements',               kind: 'sortie',  icon: '', color: '#1D4ED8', group: 'perso' },
  { id: 'coiffeur',     name: 'Coiffeur',                kind: 'sortie',  icon: '', color: '#0284C7', group: 'perso' },
  { id: 'cafe',         name: 'Café',                    kind: 'sortie',  icon: '', color: '#92400E', group: 'perso' },
  { id: 'travail',      name: 'Travail',                 kind: 'sortie',  icon: '', color: '#0369A1', group: 'perso' },
  { id: 'parking',      name: 'Parking',                 kind: 'sortie',  icon: '', color: '#0F766E', group: 'perso' },
  // Virements ou depenses du compte commun
  { id: 'commun',       name: 'Courses communes',        kind: 'sortie',  icon: '', color: '#EA580C', group: 'perso' },
  { id: 'linges',       name: 'Linges',                  kind: 'sortie',  icon: '', color: '#0284C7', group: 'perso' },
  { id: 'beaute',       name: 'Beauté',                  kind: 'sortie',  icon: '', color: '#DB2777', group: 'perso' },
  { id: 'virements',    name: 'Virements',               kind: 'sortie',  icon: '', color: '#475569', group: 'perso' },
  { id: 'dejeuners',    name: 'Déjeuners',               kind: 'sortie',  icon: '', color: '#D97706', group: 'perso' },
  { id: 'sport',        name: 'Sport',                   kind: 'sortie',  icon: '', color: '#16A34A', group: 'perso' },
  { id: 'loisirs',      name: 'Loisirs',                 kind: 'sortie',  icon: '', color: '#2563EB', group: 'perso' },
].map((c, i) => ({ ...c, order: i, archived: false }));

export const DEFAULT_PROFILE_NAMES = Object.freeze({
  [PROFILES.ME]: 'Moi',
  [PROFILES.PARTNER]: 'Profil 2',
  [PROFILES.SHARED]: 'Commun',
});

export const DEFAULT_SETTINGS = [
  {
    key: 'profileNames',
    value: { ...DEFAULT_PROFILE_NAMES },
  },
  {
    key: 'activeProfiles',
    value: [PROFILES.ME],
  },
  { key: 'currency', value: 'EUR' },
  { key: 'locale', value: 'fr-FR' },
  { key: 'seededAt', value: null }, // renseigne a l'initialisation
];
