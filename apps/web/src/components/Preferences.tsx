import { useTranslation } from 'react-i18next'
import type { AppLocale } from '../lib/locale'
import { cn } from '../lib/utils'
import { useTheme, type ThemeChoice } from '../theme'
import { useLocaleSwitcher } from '../use-locale'
import { hoverClass } from './ui/hover'

const themeOrder: ThemeChoice[] = ['light', 'dark', 'system']

const themeLabel: Record<ThemeChoice, string> = {
  light: 'header.themeLight',
  dark: 'header.themeDark',
  system: 'header.themeSystem',
}

export function LanguageSwitch() {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocaleSwitcher()
  return (
    <div
      role="group"
      aria-label={t('header.language')}
      className="flex overflow-hidden rounded-[8px] border border-border"
    >
      <LocaleButton
        locale="en"
        current={locale}
        label={t('header.localeEn')}
        onSelect={setLocale}
      />
      <LocaleButton
        locale="de"
        current={locale}
        label={t('header.localeDe')}
        onSelect={setLocale}
      />
    </div>
  )
}

function LocaleButton({
  locale,
  current,
  label,
  onSelect,
}: {
  locale: AppLocale
  current: AppLocale
  label: string
  onSelect: (locale: AppLocale) => void
}) {
  const selected = locale === current
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'min-h-11 cursor-pointer px-3 text-sm',
        selected
          ? 'bg-accent text-accent-foreground'
          : cn(hoverClass.tab, 'bg-card text-foreground'),
      )}
      onClick={() => {
        void onSelect(locale)
      }}
    >
      {label}
    </button>
  )
}

export function ThemeSwitch() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  return (
    <div
      role="group"
      aria-label={t('header.theme')}
      className="flex overflow-hidden rounded-[8px] border border-border"
    >
      {themeOrder.map((choice) => {
        const selected = theme === choice
        return (
          <button
            key={choice}
            type="button"
            aria-pressed={selected}
            className={cn(
              'min-h-11 cursor-pointer px-3 text-sm',
              selected
                ? 'bg-accent text-accent-foreground'
                : cn(hoverClass.tab, 'bg-card text-foreground'),
            )}
            onClick={() => setTheme(choice)}
          >
            {t(themeLabel[choice])}
          </button>
        )
      })}
    </div>
  )
}
