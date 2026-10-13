/**
 * The code behind the "Send to TripBoard" bookmark (R-33-10): it opens the
 * share page of this app with the current page's address and title.
 * Pure, so a test can run it against a fake window.
 */
export function bookmarkletCode(origin: string): string {
  const base = JSON.stringify(`${origin}/share`)
  return (
    'javascript:(function(){' +
    `window.open(${base}+'?url='+encodeURIComponent(window.location.href)` +
    "+'&title='+encodeURIComponent(window.document.title),'_blank')" +
    '})()'
  )
}
