/**
 * Region ordering used everywhere a vendor lists locations (AWS health events, regional probes…):
 * Saudi Arabia first, then the rest of the Arab world, then every other country alphabetically.
 */

const SAUDI_ALIASES = [
  'saudi arabia', 'saudi', 'ksa', 'kingdom of saudi arabia', 'me-central', 'riyadh', 'jeddah', 'dammam',
  'السعودية', 'المملكة العربية السعودية',
];

const ARAB_COUNTRIES = [
  'uae', 'united arab emirates', 'emirates', 'dubai', 'abu dhabi', 'الإمارات',
  'bahrain', 'البحرين',
  'qatar', 'doha', 'قطر',
  'kuwait', 'الكويت',
  'oman', 'muscat', 'عمان',
  'jordan', 'الأردن',
  'egypt', 'cairo', 'مصر',
  'morocco', 'المغرب',
  'tunisia', 'تونس',
  'algeria', 'الجزائر',
  'libya', 'ليبيا',
  'lebanon', 'لبنان',
  'iraq', 'العراق',
  'yemen', 'اليمن',
  'syria', 'سوريا',
  'sudan', 'السودان',
  'palestine', 'فلسطين',
  'mauritania', 'موريتانيا',
  'djibouti', 'جيبوتي',
  'somalia', 'الصومال',
  'comoros', 'جزر القمر',
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isSaudiRegion(value: string): boolean {
  const normalized = normalize(value);
  return SAUDI_ALIASES.some((alias) => normalized.includes(normalize(alias)));
}

export function isArabRegion(value: string): boolean {
  const normalized = normalize(value);
  return ARAB_COUNTRIES.some((country) => normalized.includes(normalize(country)));
}

/** 0 = Saudi Arabia, 1 = other Arab countries, 2 = the rest, 3 = global / unknown buckets. */
export function regionRank(value: string): number {
  if (!value || /^(global|worldwide|all|unknown|—|-)$/i.test(value.trim())) return 3;
  if (isSaudiRegion(value)) return 0;
  if (isArabRegion(value)) return 1;
  return 2;
}

export function compareRegions(a: string, b: string): number {
  const rank = regionRank(a) - regionRank(b);
  if (rank !== 0) return rank;
  return a.localeCompare(b, 'en');
}

export function sortRegions<T>(items: T[], selector: (item: T) => string): T[] {
  return [...items].sort((left, right) => compareRegions(selector(left), selector(right)));
}

export const ARAB_COUNTRY_LABELS_AR: Record<string, string> = {
  'saudi arabia': 'السعودية',
  uae: 'الإمارات',
  bahrain: 'البحرين',
  qatar: 'قطر',
  kuwait: 'الكويت',
  oman: 'عمان',
  jordan: 'الأردن',
  egypt: 'مصر',
  morocco: 'المغرب',
  iraq: 'العراق',
};
