import type { NewsEntry } from '@tripboard/shared'
import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { hoverClass } from '../components/ui/hover'
import { activeLocale } from '../i18n'
import { cn } from '../lib/utils'
import { pinCategory } from '../spots/model'
import { Dialog } from '../spots/Dialog'
import { isAuth } from '../api/http'
import { useSession } from '../session'
import { emitCommentsChanged, onCommentsChanged } from './bus'
import { getNews, markTripRead } from './client'
import { relativeTime } from './time'

/** Header button with the trip's unread total; opens the News panel. */
export function NewsButton({
  tripId,
  total,
}: {
  tripId: string
  total: number
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const label =
    total > 0 ? t('news.buttonUnread', { count: total }) : t('news.button')
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="news-button"
        className={cn(
          hoverClass.ghost,
          'relative inline-flex min-h-11 items-center gap-2 rounded-[8px] px-2',
        )}
        onClick={() => setOpen(true)}
      >
        <Bell aria-hidden="true" className="size-4" />
        <span>{t('news.button')}</span>
        {total > 0 ? (
          <span
            aria-hidden="true"
            data-testid="news-badge"
            className="inline-flex min-w-5 justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground"
          >
            {total > 99 ? t('news.overflow') : total}
          </span>
        ) : null}
      </button>
      {open ? (
        <NewsPanel tripId={tripId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}

function NewsPanel({
  tripId,
  onClose,
}: {
  tripId: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { reload } = useSession()
  const navigate = useNavigate()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [entries, setEntries] = useState<NewsEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getNews(tripId, controller.signal)
      .then((news) => {
        setFailed(false)
        setEntries(news.entries)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isAuth(error)) reload()
        else setFailed(true)
      })
    return () => controller.abort()
  }, [tripId, reloadToken, reload])

  useEffect(
    () =>
      onCommentsChanged(() => {
        setReloadToken((value) => value + 1)
      }),
    [],
  )

  async function markAll() {
    try {
      await markTripRead(tripId)
      emitCommentsChanged(null)
      setReloadToken((value) => value + 1)
    } catch (error) {
      if (isAuth(error)) reload()
      else setFailed(true)
    }
  }

  function open(entry: NewsEntry) {
    onClose()
    navigate(`/trips/${tripId}?spot=${entry.id}`, {
      state: { discussion: true },
    })
  }

  return (
    <Dialog
      title={t('news.title')}
      closeLabel={t('board.close')}
      onClose={onClose}
      layer="top"
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
        {failed && entries === null ? (
          <ErrorState
            message={t('news.loadError')}
            retry={() => setReloadToken((value) => value + 1)}
          />
        ) : entries === null ? (
          <LoadingState />
        ) : entries.length === 0 ? (
          <p className="text-muted" data-testid="news-empty">
            {t('news.caughtUp')}
          </p>
        ) : (
          <>
            <ul className="m-0 list-none space-y-2 p-0">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    data-testid={`news-entry-${entry.id}`}
                    onClick={() => open(entry)}
                    className={cn(
                      hoverClass.card,
                      'flex w-full items-stretch gap-3 rounded-[8px] border border-border p-3 text-left',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="w-1 shrink-0 rounded-full"
                      style={{
                        backgroundColor: `var(--cat-${pinCategory(entry.displayCategory)})`,
                      }}
                    />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">{entry.title}</span>
                        <span className="text-xs font-semibold text-accent">
                          {t('news.newCount', { count: entry.unreadComments })}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        {entry.author?.displayName ?? t('comments.former')}
                        <time dateTime={entry.createdAt}>
                          {relativeTime(entry.createdAt, locale)}
                        </time>
                      </span>
                      <span className="block whitespace-pre-wrap break-words text-sm">
                        {entry.excerpt}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              onClick={() => {
                void markAll()
              }}
            >
              {t('news.markAll')}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}
