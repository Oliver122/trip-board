import {
  commentListSchema,
  commentSchema,
  newsSchema,
  type Comment,
  type News,
} from '@tripboard/shared'
import { request, requestJson } from '../api/http'

/** Loads the whole thread, oldest first. Pages follow `nextCursor`. */
export async function listComments(
  spotId: string,
  signal?: AbortSignal,
): Promise<Comment[]> {
  const comments: Comment[] = []
  let cursor: string | null = null
  do {
    const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const page = await requestJson(
      `/api/spots/${spotId}/comments${query}`,
      commentListSchema,
      { signal },
    )
    comments.push(...page.comments)
    cursor = page.nextCursor
  } while (cursor)
  return comments
}

export async function createComment(
  spotId: string,
  body: string,
): Promise<Comment> {
  return requestJson(`/api/spots/${spotId}/comments`, commentSchema, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export async function updateComment(
  commentId: string,
  body: string,
): Promise<Comment> {
  return requestJson(`/api/comments/${commentId}`, commentSchema, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  })
}

export async function deleteComment(commentId: string): Promise<void> {
  await request(`/api/comments/${commentId}`, { method: 'DELETE' })
}

export async function markSpotRead(
  spotId: string,
  upTo: string,
): Promise<void> {
  await request(`/api/spots/${spotId}/comments/read`, {
    method: 'PUT',
    body: JSON.stringify({ upTo }),
  })
}

export async function markTripRead(tripId: string): Promise<void> {
  await request(`/api/trips/${tripId}/news/read`, { method: 'POST' })
}

export async function getNews(
  tripId: string,
  signal?: AbortSignal,
): Promise<News> {
  return requestJson(`/api/trips/${tripId}/news`, newsSchema, { signal })
}
