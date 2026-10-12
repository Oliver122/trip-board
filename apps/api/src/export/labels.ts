import type {
  KindPreset,
  PlanEntryType,
  SpotKindRef,
  TripRole,
} from '@tripboard/shared'

export type ExportLocale = 'en' | 'de'

export const csvHeaders: Record<ExportLocale, readonly string[]> = {
  en: [
    'Title',
    'Category',
    'Address',
    'Lat',
    'Lng',
    'Info',
    'Link',
    'Plan entry',
    'Entry type',
    'Date',
    'Time',
    'Created by',
  ],
  de: [
    'Titel',
    'Kategorie',
    'Adresse',
    'Breite',
    'Länge',
    'Info',
    'Link',
    'Planeintrag',
    'Eintragstyp',
    'Datum',
    'Uhrzeit',
    'Erstellt von',
  ],
}

const categories: Record<ExportLocale, Record<'planned' | 'home', string>> = {
  en: { planned: 'Planned', home: 'Home' },
  de: { planned: 'Geplant', home: 'Unterkunft' },
}

const presets: Record<ExportLocale, Record<KindPreset, string>> = {
  en: {
    must_go: 'Must go',
    maybe: 'Maybe',
    food: 'Food',
    sights: 'Sights',
    shopping: 'Shopping',
    coffee: 'Coffee',
    nature: 'Nature',
    nightlife: 'Nightlife',
  },
  de: {
    must_go: 'Muss hin',
    maybe: 'Vielleicht',
    food: 'Essen',
    sights: 'Sehenswürdigkeiten',
    shopping: 'Einkaufen',
    coffee: 'Kaffee',
    nature: 'Natur',
    nightlife: 'Nachtleben',
  },
}

/** A kind's display name: the custom name, or the preset label in the language. */
export function kindName(
  locale: ExportLocale,
  kind: Pick<SpotKindRef, 'name' | 'preset'>,
): string {
  if (kind.name) return kind.name
  return kind.preset ? presets[locale][kind.preset] : ''
}

const entryTypes: Record<ExportLocale, Record<PlanEntryType, string>> = {
  en: { bucket: 'Bucket', single: 'Single' },
  de: { bucket: 'Abschnitt', single: 'Einzeltermin' },
}

const roles: Record<ExportLocale, Record<TripRole, string>> = {
  en: {
    owner: 'Owner',
    admin: 'Board admin',
    planner: 'Planner',
    visitor: 'Visitor',
  },
  de: {
    owner: 'Besitzer',
    admin: 'Board-Admin',
    planner: 'Planer',
    visitor: 'Besucher',
  },
}

const copy = {
  en: { schedule: 'Schedule', unscheduled: 'Unscheduled', home: 'Home' },
  de: {
    schedule: 'Zeitplan',
    unscheduled: 'Nicht geplant',
    home: 'Unterkunft',
  },
} as const

export function exportLabels(locale: ExportLocale) {
  return {
    headers: csvHeaders[locale],
    category: categories[locale],
    kind: (kind: Pick<SpotKindRef, 'name' | 'preset'>) =>
      kindName(locale, kind),
    entryType: entryTypes[locale],
    role: roles[locale],
    schedule: copy[locale].schedule,
    unscheduled: copy[locale].unscheduled,
    home: copy[locale].home,
  }
}

const intlLocale: Record<ExportLocale, string> = {
  en: 'en-GB',
  de: 'de-DE',
}

/** Calendar date in the profile language. Date-only strings stay on that day. */
export function formatExportDate(iso: string, locale: ExportLocale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  )
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
