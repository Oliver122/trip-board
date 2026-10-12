import type { Comment, Spot } from '@tripboard/shared'
import { commentLimits } from '@tripboard/shared'
import { Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { isAuth } from '../api/http'
import { ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { useConfirm } from '../components/ui/confirm'
import { hoverClass } from '../components/ui/hover'
import { activeLocale } from '../i18n'
import { useSession } from '../session'
import { cn } from '../lib/utils'
import { CommentBody } from './body'
import { emitCommentsChanged, onCommentsChanged } from './bus'
import {
  createComment,
  deleteComment,
  listComments,
  markSpotRead,
  updateComment,
} from './client'
import { fullDate, relativeTime } from './time'

const pageSize = 50
const counterFrom = 1800

const inputClass =
  'w-full rounded-[8px] border border-border bg-card px-3 py-2 text-foreground'

/**
 * The discussion thread of one spot, shown in the spot panel. Unread comments
 * count as read once this section has been on screen (R-24-26).
 */
export function SpotDiscussion({
  spot,
  onToast,
  focusOnMount = false,
}: {
  spot: Spot
  onToast: (message: string) => void
  focusOnMount?: boolean
}) {
  const { t, i18n } = useTranslation()
  const confirm = useConfirm()
  const { user } = useSession()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const headingId = useId()
  const composerId = useId()
  const sectionRef = useRef<HTMLElement>(null)
  const visible = useRef(false)
  const markedUpTo = useRef<string | null>(null)
  const unreadAtOpen = useRef(spot.unreadComments)
  const dividerSet = useRef(false)
  const loadedOnce = useRef(false)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [dividerId, setDividerId] = useState<string | null>(null)
  const [shownFrom, setShownFrom] = useState(0)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const spotId = spot.id

  // Load the thread; the first load decides where the "New" divider sits.
  useEffect(() => {
    const controller = new AbortController()
    listComments(spotId, controller.signal)
      .then((loaded) => {
        setLoadFailed(false)
        setComments(loaded)
        if (!loadedOnce.current) {
          loadedOnce.current = true
          setShownFrom(Math.max(0, loaded.length - pageSize))
        }
        if (!dividerSet.current) {
          dividerSet.current = true
          setDividerId(firstUnread(loaded, unreadAtOpen.current))
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isAuth(error)) return
        setLoadFailed(true)
      })
    return () => controller.abort()
  }, [spotId, reloadToken])

  // Other tabs and other people: refetch when this spot changes.
  useEffect(
    () =>
      onCommentsChanged((changed) => {
        if (changed === spotId) setReloadToken((value) => value + 1)
      }),
    [spotId],
  )

  // Mark read once the section is on screen, and again when new comments
  // arrive while it stays visible.
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const observer = new IntersectionObserver(
      (entries) => {
        visible.current = entries.some((entry) => entry.isIntersecting)
        if (visible.current) markRead()
      },
      { threshold: 0.2 },
    )
    observer.observe(section)
    return () => observer.disconnect()
    // markRead reads refs and the latest comments through `commentsRef`.
  }, [spotId])

  const commentsRef = useRef<Comment[] | null>(null)
  commentsRef.current = comments

  useEffect(() => {
    if (visible.current) markRead()
  }, [comments])

  useEffect(() => {
    if (focusOnMount) sectionRef.current?.scrollIntoView({ block: 'start' })
  }, [focusOnMount])

  function markRead() {
    const list = commentsRef.current
    const newest = list?.at(-1)
    if (!newest || newest.id.startsWith('temp-')) return
    if (markedUpTo.current === newest.createdAt) return
    markedUpTo.current = newest.createdAt
    void markSpotRead(spotId, newest.createdAt)
      .then(() => emitCommentsChanged(spotId))
      .catch(() => {
        markedUpTo.current = null
      })
  }

  async function send() {
    const body = draft.trim()
    if (body.length === 0 || body.length > commentLimits.body || busy) return
    const tempId = `temp-${Date.now()}`
    const optimistic: Comment = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      author: user
        ? {
            id: user.id,
            displayName: user.displayName ?? user.username,
            avatarUrl: user.avatarUrl,
          }
        : null,
      canEdit: true,
      canDelete: true,
    }
    setComments((current) => [...(current ?? []), optimistic])
    setDraft('')
    setBusy(true)
    try {
      const created = await createComment(spotId, body)
      setComments((current) =>
        (current ?? []).map((item) => (item.id === tempId ? created : item)),
      )
      emitCommentsChanged(spotId)
    } catch {
      setComments((current) =>
        (current ?? []).filter((item) => item.id !== tempId),
      )
      setDraft((current) => (current === '' ? body : current))
      onToast(t('comments.saveError'))
    } finally {
      setBusy(false)
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void send()
    }
  }

  async function saveEdit() {
    if (!editing) return
    const body = editing.text.trim()
    if (body.length === 0 || body.length > commentLimits.body) return
    try {
      const updated = await updateComment(editing.id, body)
      setComments((current) =>
        (current ?? []).map((item) =>
          item.id === updated.id ? updated : item,
        ),
      )
      setEditing(null)
      emitCommentsChanged(spotId)
    } catch {
      onToast(t('comments.saveError'))
    }
  }

  async function remove(comment: Comment) {
    const ok = await confirm({
      title: t('confirm.deleteCommentTitle'),
      message: t('comments.confirmDelete'),
      confirmLabel: t('confirm.deleteAction'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteComment(comment.id)
      setComments((current) =>
        (current ?? []).filter((item) => item.id !== comment.id),
      )
      emitCommentsChanged(spotId)
    } catch {
      onToast(t('comments.saveError'))
    }
  }

  const list = comments ?? []
  const shown = list.slice(shownFrom)
  const counterVisible = draft.length >= counterFrom
  const overLimit = draft.length > commentLimits.body
  const canSend = draft.trim().length > 0 && !overLimit && !busy

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      data-testid="discussion"
      className="space-y-3 border-t border-border pt-4"
    >
      <h3 id={headingId} className="font-semibold">
        {t('comments.section')}
      </h3>
      {comments === null && !loadFailed ? (
        <LoadingState />
      ) : loadFailed && comments === null ? (
        <ErrorState
          message={t('comments.loadError')}
          retry={() => setReloadToken((value) => value + 1)}
        />
      ) : list.length === 0 ? (
        <p className="text-muted" data-testid="discussion-empty">
          {t('comments.empty')}
        </p>
      ) : (
        <>
          {shownFrom > 0 ? (
            <Button
              variant="outline"
              onClick={() =>
                setShownFrom((value) => Math.max(0, value - pageSize))
              }
            >
              {t('comments.showOlder')}
            </Button>
          ) : null}
          <ol className="m-0 list-none space-y-3 p-0">
            {shown.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                locale={locale}
                divider={comment.id === dividerId}
                editing={editing?.id === comment.id ? editing : null}
                onEdit={() =>
                  setEditing({ id: comment.id, text: comment.body })
                }
                onEditText={(text) =>
                  setEditing((current) =>
                    current ? { ...current, text } : current,
                  )
                }
                onSaveEdit={() => void saveEdit()}
                onCancelEdit={() => setEditing(null)}
                onDelete={() => void remove(comment)}
              />
            ))}
          </ol>
        </>
      )}
      <div className="space-y-2">
        <label htmlFor={composerId} className="sr-only">
          {t('comments.placeholder')}
        </label>
        <textarea
          id={composerId}
          value={draft}
          rows={2}
          placeholder={t('comments.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKey}
          aria-describedby={`${composerId}-hint`}
          className={inputClass}
        />
        <div className="flex items-center justify-between gap-2">
          <p id={`${composerId}-hint`} className="text-xs text-muted">
            {counterVisible
              ? t('comments.counter', { count: draft.length })
              : t('comments.hint')}
          </p>
          <Button
            type="button"
            disabled={!canSend}
            onClick={() => void send()}
            className={cn(overLimit && 'text-danger')}
          >
            {t('comments.send')}
          </Button>
        </div>
      </div>
    </section>
  )
}

function CommentItem({
  comment,
  locale,
  divider,
  editing,
  onEdit,
  onEditText,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  comment: Comment
  locale: 'en' | 'de'
  divider: boolean
  editing: { id: string; text: string } | null
  onEdit: () => void
  onEditText: (text: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const editId = useId()
  const name = comment.author?.displayName || t('comments.former')
  return (
    <>
      {divider ? (
        <li
          role="presentation"
          data-testid="new-divider"
          className="flex items-center gap-2 text-xs text-accent"
        >
          <span className="h-px flex-1 bg-accent" aria-hidden="true" />
          <span>{t('comments.newDivider')}</span>
          <span className="h-px flex-1 bg-accent" aria-hidden="true" />
        </li>
      ) : null}
      <li data-testid="comment" className="flex gap-2">
        <Avatar name={name} url={comment.author?.avatarUrl ?? null} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold">{name}</span>
            <time
              dateTime={comment.createdAt}
              title={fullDate(comment.createdAt, locale)}
              className="text-muted"
            >
              {relativeTime(comment.createdAt, locale)}
            </time>
            {comment.editedAt ? (
              <span className="text-muted">{t('comments.edited')}</span>
            ) : null}
          </p>
          {editing ? (
            <div className="space-y-2">
              <label htmlFor={editId} className="sr-only">
                {t('comments.editLabel')}
              </label>
              <textarea
                id={editId}
                value={editing.text}
                rows={2}
                onChange={(event) => onEditText(event.target.value)}
                className={inputClass}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={onCancelEdit}>
                  {t('comments.cancel')}
                </Button>
                <Button
                  onClick={onSaveEdit}
                  disabled={
                    editing.text.trim().length === 0 ||
                    editing.text.trim().length > commentLimits.body
                  }
                >
                  {t('comments.save')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <CommentBody body={comment.body} />
              {comment.canEdit || comment.canDelete ? (
                <div className="flex items-center gap-3 text-sm">
                  {comment.canEdit ? (
                    <button
                      type="button"
                      className={cn(hoverClass.link, 'min-h-11')}
                      onClick={onEdit}
                    >
                      {t('comments.edit')}
                    </button>
                  ) : null}
                  {comment.canDelete ? (
                    <Button
                      variant="danger"
                      size="icon"
                      aria-label={t('comments.deleteComment')}
                      title={t('comments.deleteComment')}
                      data-testid="comment-delete"
                      onClick={onDelete}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </li>
    </>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={28}
        height={28}
        className="size-7 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-border text-sm"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/**
 * The first unread comment: unread comments are the newest comments written by
 * others, so count back over those.
 */
export function firstUnread(
  comments: Comment[],
  unread: number,
): string | null {
  if (unread <= 0) return null
  let seen = 0
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index]!
    if (comment.canEdit) continue
    seen += 1
    if (seen === unread) return comment.id
  }
  return null
}
