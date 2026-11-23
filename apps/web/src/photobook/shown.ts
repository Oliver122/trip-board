import { useCallback, useState } from 'react'

/**
 * Photos shown or asked for while the page is open (R-47-10): they stay shown
 * when low data turns on, like the gallery's (R-38-08).
 */
const shownPhotos = new Set<string>()

function markShown(ids: Iterable<string>) {
  for (const id of ids) shownPhotos.add(id)
}

/** `isShown` follows low data; `show` marks photos and re-renders the caller. */
export function useShownPhotos(lowData: boolean) {
  const [revision, setRevision] = useState(0)
  const show = useCallback((ids: string[]) => {
    markShown(ids)
    setRevision((value) => value + 1)
  }, [])
  const isShown = useCallback(
    (id: string) => !lowData || shownPhotos.has(id),
    // `revision` makes the callback new after every `show`.
    [lowData, revision],
  )
  return { isShown, show }
}
