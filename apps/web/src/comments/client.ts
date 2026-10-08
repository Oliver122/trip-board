import {
  commentListSchema,
  commentSchema,
  newsSchema,
  type Comment,
  type News,
} from '@tripboard/shared'
import { writeInit } from '../api/write'
import { AuthError } from '../trips/client'

export class CommentError extends Error {
  readonly status: number

  constructor(status: number) {
    super('comment')
    this.name = 'CommentError'
    this.status = status
  }
}

/** Loads the whole thread, oldest first. Pages follow `nextCursor`. */
export async function listComments(
  spotId: string,
  signal?: AbortSignal,
): Promise<Comment[]> {
  const comments: Comment[] = []
  let cursor: string | null = null
  do {
    const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const response = await send(`/api/spots/${spotId}/comments${query}`, {
      signal,
    })
    if (!response.ok) throw new CommentError(response.status)
    const page = commentListSchema.parse(await response.json())
    comments.push(...page.comments)
    cursor = page.nextCursor
  } while (cursor)
  return comments
}

export async function createComment(
  spotId: string,
  body: string,
): Promise<Comment> {
  const response = await send(`/api/spots/${spotId}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) throw new CommentError(response.status)
  return commentSchema.parse(await response.json())
}

export async function updateComment(
  commentId: string,
  body: string,
): Promise<Comment> {
  const response = await send(`/api/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) throw new CommentError(response.status)
  return commentSchema.parse(await response.json())
}

export async function deleteComment(commentId: string): Promise<void> {
  const response = await send(`/api/comments/${commentId}`, {
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 204)
    throw new CommentError(response.status)
}

export async function markSpotRead(
  spotId: string,
  upTo: string,
): Promise<void> {
  const response = await send(`/api/spots/${spotId}/comments/read`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ upTo }),
  })
  if (!response.ok && response.status !== 204)
    throw new CommentError(response.status)
}

export async function markTripRead(tripId: string): Promise<void> {
  const response = await send(`/api/trips/${tripId}/news/read`, {
    method: 'POST',
  })
  if (!response.ok && response.status !== 204)
    throw new CommentError(response.status)
}

export async function getNews(
  tripId: string,
  signal?: AbortSignal,
): Promise<News> {
  const response = await send(`/api/trips/${tripId}/news`, { signal })
  if (!response.ok) throw new CommentError(response.status)
  return newsSchema.parse(await response.json())
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...writeInit(init),
    credentials: 'include',
  })
  if (response.status === 401) throw new AuthError()
  return response
}
