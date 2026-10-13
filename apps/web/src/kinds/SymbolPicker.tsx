import { kindSymbols, type KindSymbol } from '@tripboard/shared'
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { selectedRing, SelectedCheck } from './selection'
import { SymbolMark } from './textures'

/** Lower case without diacritics, so "kat" finds "Katze" and "ubung" finds "Übung". */
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * The 64 symbols as a searchable listbox. Arrow keys move between tiles,
 * Enter (or Space) picks, ArrowDown from the search field enters the grid.
 */
export function SymbolPicker({
  name,
  symbol,
  disabled,
  onPick,
}: {
  name: string
  symbol: KindSymbol
  disabled?: boolean
  onPick: (symbol: KindSymbol) => void
}) {
  const { t } = useTranslation()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const gridRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const needle = normalizeSearch(query)
    if (!needle) return [...kindSymbols]
    return kindSymbols.filter((key) =>
      normalizeSearch(t(`kinds.symbols.${key}`)).includes(needle),
    )
    // t changes with the language
  }, [query, t])

  const tiles = () => [
    ...(gridRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ??
      []),
  ]

  function columns(list: HTMLElement[]): number {
    const top = list[0]?.offsetTop
    const count = list.filter((tile) => tile.offsetTop === top).length
    return Math.max(1, count)
  }

  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const list = tiles()
    const index = list.indexOf(document.activeElement as HTMLElement)
    if (index < 0) return
    const cols = columns(list)
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: cols,
      ArrowUp: -cols,
    }
    let target = -1
    if (event.key in step) target = index + step[event.key]!
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = list.length - 1
    else return
    event.preventDefault()
    if (target >= 0 && target < list.length) list[target]?.focus()
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const list = tiles()
      ;(
        list.find((tile) => tile.getAttribute('aria-selected') === 'true') ??
        list[0]
      )?.focus()
    } else if (event.key === 'Enter') {
      // Never submits the surrounding form; picks the first match instead.
      event.preventDefault()
      const first = matches[0]
      if (first) onPick(first)
    }
  }

  const selectedVisible = matches.includes(symbol)

  return (
    <div className="flex flex-col gap-2" data-testid="symbol-picker">
      <label htmlFor={searchId} className="text-sm">
        {t('kinds.symbolSearch')}
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onSearchKey}
        className="w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground"
      />
      {matches.length === 0 ? (
        <p role="status" className="text-sm text-muted">
          {t('kinds.symbolNone')}
        </p>
      ) : (
        <div
          ref={gridRef}
          role="listbox"
          aria-label={t('kinds.symbolOf', { name })}
          onKeyDown={onGridKey}
          className="flex flex-wrap gap-2"
        >
          {matches.map((key, index) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={key === symbol}
              aria-label={t(`kinds.symbols.${key}`)}
              tabIndex={
                key === symbol || (!selectedVisible && index === 0) ? 0 : -1
              }
              disabled={disabled}
              data-testid="kind-symbol"
              data-symbol={key}
              className={cn(
                hoverClass.secondary,
                'relative inline-flex size-11 items-center justify-center rounded-[8px] text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                key === symbol && ['bg-hover', selectedRing],
              )}
              onClick={() => onPick(key)}
            >
              <span
                aria-hidden="true"
                className="inline-flex size-7 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-card"
              >
                <SymbolMark symbol={key} />
              </span>
              {key === symbol && <SelectedCheck />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
