import { useId, useRef, type ClipboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { phoneQuery, useMediaQuery } from '../lib/media'
import { cn } from '../lib/utils'
import { parseTransfer, type Dropped } from './drop'

/** Paste handler for a gallery: files and links are taken, other pastes into fields are left alone (R-34-02). */
export function onPasteImage(handle: (dropped: Dropped) => void) {
  return (event: ClipboardEvent) => {
    const target = event.target
    if (
      target instanceof HTMLInputElement &&
      target.type !== 'file' &&
      target.type !== 'checkbox'
    ) {
      return
    }
    if (target instanceof HTMLTextAreaElement) return
    const data = event.clipboardData
    if (!data) return
    event.preventDefault()
    handle(parseTransfer(data))
  }
}

/** The focusable drop target with a file picker behind it (R-34-02). */
export function DropZone({
  testId = 'image-drop',
  disabled = false,
  onDropped,
}: {
  testId?: string
  disabled?: boolean
  onDropped: (dropped: Dropped) => void
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const phone = useMediaQuery(phoneQuery)
  return (
    <label
      data-testid={testId}
      htmlFor={inputId}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        'flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-border px-3 text-center',
        disabled ? 'opacity-60' : '',
      )}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        input.current?.click()
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        if (!disabled) onDropped(parseTransfer(event.dataTransfer))
      }}
    >
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={
          phone ? 'image/*' : 'image/jpeg,image/png,image/webp,image/heic,.heic'
        }
        multiple
        tabIndex={-1}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          if (files.length > 0) onDropped({ kind: 'files', files })
        }}
      />
      {phone ? (
        <span>{t('lowData.addPhotos')}</span>
      ) : (
        <>
          <span>{t('board.dropImages')}</span>
          <span className="text-xs text-muted">{t('images.webPasteHint')}</span>
        </>
      )}
    </label>
  )
}
