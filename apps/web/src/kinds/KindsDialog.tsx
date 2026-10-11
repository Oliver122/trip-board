import {
  kindErrorCodes,
  kindSwatches,
  presetKinds,
  type KindPreset,
  type KindSymbol,
  type SpotKind,
} from '@tripboard/shared'
import { ArrowDown, ArrowUp, Palette, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, isAuth } from '../api/http'
import { ErrorNotice } from '../components/notice'
import { ErrorState, LoadingState } from '../components/states'
import { Button, buttonVariants } from '../components/ui/button'
import { hoverClass } from '../components/ui/hover'
import { Menu, MenuItem } from '../components/ui/menu'
import { Modal } from '../components/ui/modal'
import { Select } from '../components/ui/select'
import { cn } from '../lib/utils'
import { useSession } from '../session'
import {
  createKind,
  createPresetKind,
  deleteKind,
  reorderKinds,
  updateKind,
} from './client'
import { kindLabel } from './label'
import { KindPreview } from './KindPreview'
import { LimitRequest } from './LimitRequest'
import { reloadKinds, setKinds, useTripKinds } from './store'
import { SymbolPicker } from './SymbolPicker'
import { KindSymbolIcon } from './symbols'

const inputClass =
  'w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground'

const defaultColor = '#D9480F'

type Move = { id: string; dir: 'up' | 'down' }

export function KindsDialog({
  tripId,
  onClose,
}: {
  tripId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { reload: reloadSession } = useSession()
  const {
    kinds,
    limit,
    count,
    error: loadFailed,
    reload,
  } = useTripKinds(tripId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<SpotKind | null>(null)
  const [styling, setStyling] = useState<string | null>(null)
  const [focusMove, setFocusMove] = useState<Move | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // After a move the button may have become disabled at an end; keep focus on
  // the row's other move button so keyboard reordering never loses its place.
  useEffect(() => {
    if (!focusMove) return
    const find = (dir: string) =>
      listRef.current?.querySelector<HTMLButtonElement>(
        `[data-move="${focusMove.id}:${dir}"]`,
      )
    const same = find(focusMove.dir)
    const other = find(focusMove.dir === 'up' ? 'down' : 'up')
    ;(same && !same.disabled ? same : other)?.focus()
    setFocusMove(null)
  }, [focusMove, kinds])

  function describe(caught: unknown): string {
    if (caught instanceof ApiError) {
      if ((kindErrorCodes as readonly string[]).includes(caught.code)) {
        return t(`kinds.errors.${caught.code}`, { limit })
      }
      if (caught.fields.color) return t('kinds.errors.invalid_color')
      if (caught.fields.name) return t('kinds.errors.invalid_name')
    }
    return t('kinds.errors.generic')
  }

  /** Runs a write, then reloads the kinds. Returns true when it worked. */
  async function write(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      await action()
      await reloadKinds(tripId)
      return true
    } catch (caught) {
      if (handleAuth(caught)) return false
      setError(describe(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  /** A lost session closes the dialog; true when it did. */
  function handleAuth(caught: unknown): boolean {
    if (!isAuth(caught)) return false
    reloadSession()
    onClose()
    return true
  }

  async function move(kind: SpotKind, dir: 'up' | 'down') {
    if (!kinds) return
    const index = kinds.findIndex((item) => item.id === kind.id)
    const target = dir === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= kinds.length) return
    const ids = kinds.map((item) => item.id)
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    const done = await write(async () => {
      setKinds(tripId, await reorderKinds(tripId, ids))
    })
    if (done) setFocusMove({ id: kind.id, dir })
  }

  async function patch(
    kind: SpotKind,
    body: { name?: string; color?: string; symbol?: KindSymbol },
  ) {
    return write(async () => {
      await updateKind(tripId, kind.id, body)
    })
  }

  let content
  if (!kinds && loadFailed) {
    content = (
      <ErrorState message={t('kinds.loadError')} retry={() => void reload()} />
    )
  } else if (!kinds) {
    content = <LoadingState />
  } else {
    content = (
      <>
        {error ? (
          <ErrorNotice className="mb-3" testId="kinds-error">
            {error}
          </ErrorNotice>
        ) : null}
        {loadFailed ? (
          <ErrorNotice className="mb-3">{t('kinds.loadError')}</ErrorNotice>
        ) : null}
        <ul
          ref={listRef}
          aria-label={t('kinds.list')}
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {kinds.map((kind, index) => (
            <KindRow
              key={kind.id}
              kind={kind}
              first={index === 0}
              last={index === kinds.length - 1}
              only={kinds.length === 1}
              busy={busy}
              styleOpen={styling === kind.id}
              onToggleStyle={() =>
                setStyling(styling === kind.id ? null : kind.id)
              }
              onRename={(name) => patch(kind, { name })}
              onColor={(color) => patch(kind, { color })}
              onSymbol={(symbol) => patch(kind, { symbol })}
              onMove={(dir) => void move(kind, dir)}
              onDelete={() => {
                setError('')
                setDeleting(kind)
              }}
            />
          ))}
        </ul>
        <AddKind
          tripId={tripId}
          kinds={kinds}
          limit={limit}
          count={count}
          busy={busy}
          onAuthError={handleAuth}
          onPreset={(preset) =>
            write(async () => {
              await createPresetKind(tripId, preset)
            })
          }
          onAdd={(body) =>
            write(async () => {
              await createKind(tripId, body)
            })
          }
        />
      </>
    )
  }

  return (
    <>
      <Modal
        title={t('kinds.title')}
        size="lg"
        testId="kinds-dialog"
        onClose={onClose}
      >
        <div className="p-4">{content}</div>
      </Modal>
      {deleting && kinds ? (
        <DeleteKind
          kind={deleting}
          others={kinds.filter((item) => item.id !== deleting.id)}
          onCancel={() => setDeleting(null)}
          onDelete={async (moveTo) => {
            const done = await write(async () => {
              await deleteKind(tripId, deleting.id, moveTo)
            })
            if (done) setDeleting(null)
            return done
          }}
          error={error}
        />
      ) : null}
    </>
  )
}

function KindRow({
  kind,
  first,
  last,
  only,
  busy,
  styleOpen,
  onToggleStyle,
  onRename,
  onColor,
  onSymbol,
  onMove,
  onDelete,
}: {
  kind: SpotKind
  first: boolean
  last: boolean
  only: boolean
  busy: boolean
  styleOpen: boolean
  onToggleStyle: () => void
  onRename: (name: string) => Promise<boolean>
  onColor: (color: string) => Promise<boolean>
  onSymbol: (symbol: KindSymbol) => Promise<boolean>
  onMove: (dir: 'up' | 'down') => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const label = kindLabel(t, kind)
  const [draft, setDraft] = useState<string | null>(null)
  const nameId = useId()

  async function commit() {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (next === label) return
    await onRename(next)
  }

  return (
    <li
      data-testid="kind-row"
      className="rounded-[8px] border border-border bg-background p-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          data-testid="kind-swatch"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: kind.color }}
        >
          <KindSymbolIcon symbol={kind.symbol} />
        </span>
        <div className="min-w-32 flex-1">
          <label htmlFor={nameId} className="sr-only">
            {t('kinds.rename', { name: label })}
          </label>
          <input
            id={nameId}
            value={draft ?? label}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commit()
              } else if (event.key === 'Escape' && draft !== null) {
                event.preventDefault()
                event.stopPropagation()
                setDraft(null)
              }
            }}
            className={inputClass}
          />
        </div>
        <span className="text-sm text-muted" data-testid="kind-count">
          {t('kinds.spotCount', { count: kind.spotCount })}
        </span>
        <div className="flex items-center">
          <IconButton
            label={t('kinds.style', { name: label })}
            pressed={styleOpen}
            onClick={onToggleStyle}
          >
            <Palette aria-hidden="true" className="size-4" />
          </IconButton>
          <IconButton
            label={t('kinds.moveUp', { name: label })}
            disabled={first || busy}
            move={`${kind.id}:up`}
            onClick={() => onMove('up')}
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </IconButton>
          <IconButton
            label={t('kinds.moveDown', { name: label })}
            disabled={last || busy}
            move={`${kind.id}:down`}
            onClick={() => onMove('down')}
          >
            <ArrowDown aria-hidden="true" className="size-4" />
          </IconButton>
          {only ? null : (
            <IconButton
              label={t('kinds.delete', { name: label })}
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </IconButton>
          )}
        </div>
      </div>
      {styleOpen ? (
        <div className="mt-2 border-t border-border pt-2">
          <StylePicker
            name={label}
            color={kind.color}
            symbol={kind.symbol}
            busy={busy}
            onColor={(color) => void onColor(color)}
            onSymbol={(symbol) => void onSymbol(symbol)}
          />
        </div>
      ) : null}
    </li>
  )
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
  pressed,
  move,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  move?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-move={move}
      disabled={disabled}
      className={cn(
        hoverClass.ghost,
        'inline-flex size-11 items-center justify-center rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
        pressed && 'bg-hover text-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function StylePicker({
  name,
  previewName = name,
  color,
  symbol,
  busy,
  onColor,
  onSymbol,
}: {
  name: string
  /** Pin preview label; empty falls back to the placeholder name. */
  previewName?: string
  color: string
  symbol: KindSymbol
  busy: boolean
  onColor: (color: string) => void
  onSymbol: (symbol: KindSymbol) => void
}) {
  const { t } = useTranslation()
  const hexId = useId()
  const [hex, setHex] = useState<string | null>(null)

  function applyHex() {
    if (hex === null) return
    const next = hex.trim()
    setHex(null)
    if (next.toUpperCase() !== color.toUpperCase()) onColor(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t('kinds.colorOf', { name })}>
        <div className="flex flex-wrap gap-2">
          {kindSwatches.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              aria-pressed={swatch === color.toUpperCase()}
              disabled={busy}
              data-testid="kind-color-swatch"
              onClick={() => onColor(swatch)}
              className={cn(
                hoverClass.pin,
                'inline-flex size-11 items-center justify-center rounded-full border-2 border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                swatch === color.toUpperCase() && 'border-foreground',
              )}
            >
              <span
                aria-hidden="true"
                className="size-7 rounded-full"
                style={{ backgroundColor: swatch }}
              />
            </button>
          ))}
        </div>
        <label htmlFor={hexId} className="mb-1 mt-2 block text-sm">
          {t('kinds.hex')}
        </label>
        <input
          id={hexId}
          value={hex ?? color}
          disabled={busy}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => setHex(event.target.value)}
          onBlur={applyHex}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              applyHex()
            }
          }}
          className={cn(inputClass, 'max-w-40 font-mono')}
        />
      </div>
      <SymbolPicker
        name={name}
        symbol={symbol}
        disabled={busy}
        onPick={onSymbol}
      />
      <KindPreview name={previewName} color={color} symbol={symbol} />
    </div>
  )
}

/** Add kind: a menu of the presets the trip lacks plus the custom form. */
function AddKind({
  tripId,
  kinds,
  limit,
  count,
  busy,
  onPreset,
  onAdd,
  onAuthError,
}: {
  tripId: string
  kinds: SpotKind[]
  limit: number
  count: number
  busy: boolean
  onPreset: (preset: KindPreset) => Promise<boolean>
  onAdd: (body: {
    name: string
    color: string
    symbol: KindSymbol
  }) => Promise<boolean>
  onAuthError: (caught: unknown) => boolean
}) {
  const { t } = useTranslation()
  const nameId = useId()
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(defaultColor)
  const [symbol, setSymbol] = useState<KindSymbol>('dot')
  const full = count >= limit
  const taken = new Set(kinds.map((kind) => kind.preset))
  const presets = presetKinds.filter((item) => !taken.has(item.preset))

  async function submit() {
    const done = await onAdd({ name: name.trim(), color: color.trim(), symbol })
    if (done) {
      setName('')
      setColor(defaultColor)
      setSymbol('dot')
      setCustom(false)
    }
  }

  return (
    <section
      className="mt-4 flex flex-col gap-3 border-t border-border pt-4"
      aria-label={t('kinds.addMenu')}
    >
      <div className="flex flex-wrap items-center gap-3">
        {full ? (
          <Button type="button" variant="outline" disabled>
            {t('kinds.addMenu')}
          </Button>
        ) : (
          <Menu
            label={t('kinds.addMenu')}
            testId="kind-add-menu"
            align="start"
            trigger={
              <>
                <Plus aria-hidden="true" className="size-4" />
                {t('kinds.addMenu')}
              </>
            }
            triggerClassName="border border-border bg-card px-4"
          >
            {presets.map((item) => (
              <MenuItem
                key={item.preset}
                testId={`kind-add-${item.preset}`}
                onSelect={() => void onPreset(item.preset)}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: item.color }}
                >
                  <KindSymbolIcon symbol={item.symbol} className="size-3" />
                </span>
                {kindLabel(t, { name: null, preset: item.preset })}
              </MenuItem>
            ))}
            <MenuItem testId="kind-add-custom" onSelect={() => setCustom(true)}>
              {t('kinds.custom')}
            </MenuItem>
          </Menu>
        )}
        <span className="text-sm text-muted" data-testid="kind-total">
          {t('kinds.count', { count, limit })}
        </span>
      </div>
      <LimitRequest
        tripId={tripId}
        limit={limit}
        full={full}
        onAuthError={onAuthError}
      />
      {custom && !full ? (
        <form
          className="flex flex-col gap-3"
          aria-labelledby={`${nameId}-title`}
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <h3 id={`${nameId}-title`} className="text-base font-semibold">
            {t('kinds.addTitle')}
          </h3>
          <div>
            <label htmlFor={nameId} className="mb-1 block text-sm">
              {t('kinds.name')}
            </label>
            <input
              id={nameId}
              data-testid="kind-name-input"
              value={name}
              disabled={busy}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </div>
          <StylePicker
            name={name.trim() || t('kinds.addTitle')}
            previewName={name}
            color={color}
            symbol={symbol}
            busy={busy}
            onColor={setColor}
            onSymbol={setSymbol}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || name.trim().length === 0}>
              {t('kinds.add')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCustom(false)}
            >
              {t('ui.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}

function DeleteKind({
  kind,
  others,
  error,
  onCancel,
  onDelete,
}: {
  kind: SpotKind
  others: SpotKind[]
  error: string
  onCancel: () => void
  onDelete: (moveTo: string | undefined) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const label = kindLabel(t, kind)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const used = kind.spotCount > 0

  return (
    <Modal
      size="sm"
      layer="top"
      title={t('kinds.deleteTitle', { name: label })}
      testId="kind-delete-dialog"
      onClose={onCancel}
      initialFocus={cancelRef}
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            className={buttonVariants({ variant: 'outline' })}
            data-testid="kind-delete-cancel"
            onClick={onCancel}
          >
            {t('ui.cancel')}
          </button>
          <button
            type="button"
            className={buttonVariants({ variant: 'dangerSolid' })}
            data-testid="kind-delete-accept"
            disabled={busy || (used && target === '')}
            onClick={() => {
              setBusy(true)
              void onDelete(used ? target : undefined).finally(() =>
                setBusy(false),
              )
            }}
          >
            {t('confirm.deleteAction')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-4 text-sm">
        <p>
          {used
            ? t('kinds.deleteUsed', { count: kind.spotCount, name: label })
            : t('kinds.deleteUnused', { name: label })}
        </p>
        {used ? (
          <Select
            label={t('kinds.moveTo')}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">{t('kinds.movePick')}</option>
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {kindLabel(t, other)}
              </option>
            ))}
          </Select>
        ) : null}
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      </div>
    </Modal>
  )
}
