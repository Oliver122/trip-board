// Step 38 (R-38-06, R-38-07): low-data controls. The header renders the badge
// and the avatar-menu entry, the phone's More sheet the switch, the account
// page the three-value setting.
import { Check, ImageOff } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDataSaver, type DataSaverSetting } from '../lib/data-saver'
import { cn } from '../lib/utils'
import { hoverClass } from './ui/hover'
import { MenuItem } from './ui/menu'

export const dataSaverAnchor = 'data-saver'

/** Header badge shown while low data is on; links to the account page setting. */
export function DataSaverBadge() {
  const { t } = useTranslation()
  const { on } = useDataSaver()
  if (!on) return null
  return (
    <Link
      to={`/account#${dataSaverAnchor}`}
      data-testid="data-saver-badge"
      aria-label={t('lowData.badgeLabel')}
      className={cn(
        hoverClass.secondary,
        'inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-foreground',
      )}
    >
      <ImageOff aria-hidden="true" className="size-3.5" />
      {t('lowData.badge')}
    </Link>
  )
}

/** Avatar menu entry that turns low data on or off. Render inside a `Menu`. */
export function DataSaverMenuItem() {
  const { t } = useTranslation()
  const { on, setSetting } = useDataSaver()
  return (
    <MenuItem
      testId="data-saver-menu-item"
      onSelect={() => setSetting(on ? 'off' : 'on')}
    >
      <ImageOff aria-hidden="true" className="size-4" />
      <span className="flex-1">{t('lowData.title')}</span>
      {on ? (
        <>
          <Check aria-hidden="true" className="size-4" />
          <span className="sr-only">{t('lowData.on')}</span>
        </>
      ) : (
        <span className="sr-only">{t('lowData.off')}</span>
      )}
    </MenuItem>
  )
}

/** Plain on/off switch (`button` with `aria-pressed`) for the phone's More sheet. */
export function DataSaverSwitch() {
  const { t } = useTranslation()
  const { on, setSetting } = useDataSaver()
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid="data-saver-switch"
      className={cn(
        hoverClass.item,
        'flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm',
      )}
      onClick={() => setSetting(on ? 'off' : 'on')}
    >
      <ImageOff aria-hidden="true" className="size-4" />
      <span className="flex-1">{t('lowData.switch')}</span>
      <span className="text-muted">
        {on ? t('lowData.on') : t('lowData.off')}
      </span>
    </button>
  )
}

const values: DataSaverSetting[] = ['auto', 'on', 'off']

/** Account page setting with the three values auto / on / off and a short explanation. */
export function DataSaverSetting() {
  const { t } = useTranslation()
  const { setting, setSetting } = useDataSaver()
  const name = useId()
  return (
    <section
      id={dataSaverAnchor}
      data-testid="data-saver-setting"
      aria-labelledby={`${name}-title`}
      className="space-y-2"
    >
      <h2 id={`${name}-title`} className="text-lg font-semibold">
        {t('lowData.settingTitle')}
      </h2>
      <p className="text-sm text-muted">{t('lowData.settingHint')}</p>
      <div
        role="radiogroup"
        aria-labelledby={`${name}-title`}
        className="flex flex-wrap gap-2"
      >
        {values.map((value) => (
          <label
            key={value}
            className={cn(
              hoverClass.secondary,
              'inline-flex min-h-11 items-center gap-2 rounded-[8px] px-3 text-sm has-[:checked]:border-foreground',
            )}
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={setting === value}
              onChange={() => setSetting(value)}
            />
            {t(`lowData.${value}`)}
          </label>
        ))}
      </div>
    </section>
  )
}
