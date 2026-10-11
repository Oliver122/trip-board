import type { SpotKindRef } from '@tripboard/shared'
import type { TFunction } from 'i18next'

/** A kind's display name: the custom name, or the translated preset label. */
export function kindLabel(
  t: TFunction,
  kind: Pick<SpotKindRef, 'name' | 'preset'>,
): string {
  if (kind.name) return kind.name
  if (kind.preset === 'must_go') return t('category.must-go')
  if (kind.preset === 'maybe') return t('category.maybe')
  return ''
}

/** Names of a spot's kinds, joined for badges and accessible names. */
export function kindLabels(
  t: TFunction,
  kinds: readonly Pick<SpotKindRef, 'name' | 'preset'>[],
): string[] {
  return kinds.map((kind) => kindLabel(t, kind))
}
