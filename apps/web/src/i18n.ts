import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './locales/de/common.json'
import en from './locales/en/common.json'
import { browserLanguages, detectLocale, type AppLocale } from './lib/locale'

let localeLocked = false

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    de: { common: de },
  },
  lng: detectLocale(undefined, browserLanguages()),
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

export function activeLocale(language: string | undefined): AppLocale {
  return language?.toLowerCase().startsWith('de') ? 'de' : 'en'
}

/** User picked a language in this page view, so a late profile load must not overwrite it. */
export function chooseLocale(locale: AppLocale) {
  localeLocked = true
  return i18n.changeLanguage(locale)
}

/** Apply profile or browser language unless the user already chose one. */
export async function syncLocale(locale: AppLocale) {
  if (localeLocked) return
  if (i18n.language === locale) return
  await i18n.changeLanguage(locale)
}

export default i18n
