import type { Page } from '@playwright/test'

/**
 * Fires a paste event carrying text or a PNG file. Firefox drops the
 * `clipboardData` of a constructed ClipboardEvent, so the data is defined on
 * a plain event instead, which every browser hands to the listener as is.
 */
export async function dispatchPaste(
  page: Page,
  content: { text: string } | { pngBase64: string; name: string },
  target: 'active' | 'body' = 'active',
): Promise<void> {
  await page.evaluate(
    ({ content, target }) => {
      const data = new DataTransfer()
      if ('text' in content) {
        data.setData('text/plain', content.text)
      } else {
        const bytes = Uint8Array.from(atob(content.pngBase64), (char) =>
          char.charCodeAt(0),
        )
        data.items.add(new File([bytes], content.name, { type: 'image/png' }))
      }
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: data })
      const element =
        target === 'body'
          ? document.body
          : (document.activeElement ?? document.body)
      element.dispatchEvent(event)
    },
    { content, target },
  )
}
