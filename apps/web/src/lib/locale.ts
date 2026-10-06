export type AppLocale = 'en' | 'de'

/** Profile wins, then the first supported browser language, then English. */
export function detectLocale(
  profile: string | null | undefined,
  languages: readonly string[] | undefined,
): AppLocale {
  if (profile === 'en' || profile === 'de') return profile
  for (const language of languages ?? []) {
    const base = language.toLowerCase().split('-')[0]
    if (base === 'de' || base === 'en') return base
  }
  return 'en'
}

export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  if (navigator.languages.length > 0) return navigator.languages
  return navigator.language ? [navigator.language] : []
}
