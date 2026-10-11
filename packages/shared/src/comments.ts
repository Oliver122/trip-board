import { z } from 'zod'
import { spotKindRefSchema } from './kinds.js'
import { displayCategorySchema } from './spots.js'

export const commentLimits = {
  body: 2000,
  /** Characters of a comment shown in the News panel. */
  excerpt: 140,
} as const

export const commentPageSize = 50
export const newsLimit = 50

const bodyErrors = (value: string, ctx: z.RefinementCtx) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['body'],
      message: 'empty',
    })
  } else if (trimmed.length > commentLimits.body) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['body'],
      message: 'too_long',
    })
  }
}

export const commentBodySchema = z
  .object({ body: z.string() })
  .superRefine((data, ctx) => bodyErrors(data.body, ctx))
  .transform((data) => ({ body: data.body.trim() }))

export type CommentBody = z.infer<typeof commentBodySchema>

export const createCommentSchema = commentBodySchema
export type CreateCommentBody = CommentBody
export const patchCommentSchema = commentBodySchema
export type PatchCommentBody = CommentBody

const authorSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
})

export const commentSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  author: authorSchema.nullable(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
})

export type Comment = z.infer<typeof commentSchema>

export const commentListSchema = z.object({
  comments: z.array(commentSchema),
  nextCursor: z.string().nullable(),
})

export type CommentList = z.infer<typeof commentListSchema>

export const newsEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  displayCategory: displayCategorySchema,
  kinds: z.array(spotKindRefSchema),
  unreadComments: z.number().int().positive(),
  author: authorSchema.nullable(),
  createdAt: z.string(),
  excerpt: z.string(),
})

export type NewsEntry = z.infer<typeof newsEntrySchema>

export const newsSchema = z.object({
  entries: z.array(newsEntrySchema),
  total: z.number().int().nonnegative(),
})

export type News = z.infer<typeof newsSchema>

export const commentReadSchema = z.object({
  upTo: z.string().datetime({ offset: true }),
})

export type CommentRead = z.infer<typeof commentReadSchema>

/** Excerpt for the News panel: the first characters of the body. */
export function commentExcerpt(body: string): string {
  return Array.from(body).slice(0, commentLimits.excerpt).join('')
}
