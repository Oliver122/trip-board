import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'

export type CheckName =
  | 'overflow-x'
  | 'target-size'
  | 'offscreen'
  | 'clipped-text'
  | 'truncated-no-full-text'
  | 'overlap'
  | 'small-text'

export type CheckResult = {
  check: CheckName
  screen: string
  width: 1280 | 768 | 390
  theme: 'light' | 'dark'
  locale: 'en' | 'de'
  name: string
  selector: string
  box: { x: number; y: number; width: number; height: number }
}

export type CheckContext = {
  screen: string
  width: 1280 | 768 | 390
  theme: 'light' | 'dark'
  locale: 'en' | 'de'
}

/** Runs the layout checks of R-40-04 in the page. A failing check is skipped. */
export async function runChecks(
  page: Page,
  context: CheckContext,
): Promise<CheckResult[]> {
  // Everything below runs in the browser, so it uses nothing from Node.
  return page.evaluate((ctx): CheckResult[] => {
    const results: CheckResult[] = []
    const interactiveSelector = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="checkbox"]',
      '[role="switch"]',
    ].join(',')

    const round = (rect: DOMRect) => ({
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    })

    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      const style = getComputedStyle(el)
      return style.visibility === 'visible' && style.display !== 'none'
    }

    // The sr-only pattern: 1x1 px, or clipped to nothing.
    const srOnly = (el: Element) => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 1 && rect.height <= 1) return true
      const style = getComputedStyle(el)
      return (
        /^rect\(0(px)?[, ]+0(px)?[, ]+0(px)?[, ]+0(px)?\)$/.test(style.clip) ||
        style.clipPath === 'inset(50%)'
      )
    }

    const hasVisibleChain = (el: Element, allowSelfSrOnly = false) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden')
          return false
        if (node.hasAttribute('hidden') || node.hasAttribute('inert'))
          return false
        if (node.getAttribute('aria-hidden') === 'true') return false
        if (!(allowSelfSrOnly && node === el) && srOnly(node)) return false
      }
      return true
    }

    const isChoice = (el: Element): el is HTMLInputElement =>
      el.tagName === 'INPUT' &&
      ['checkbox', 'radio'].includes((el as HTMLInputElement).type)

    // The visible label of a checkbox or radio with the largest box.
    const labelOf = (el: HTMLInputElement) => {
      let best: Element | null = null
      let area = 0
      for (const label of Array.from(el.labels ?? [])) {
        if (!visible(label) || !hasVisibleChain(label)) continue
        const rect = label.getBoundingClientRect()
        if (rect.width * rect.height > area) {
          best = label
          area = rect.width * rect.height
        }
      }
      return best
    }

    // Inputs that are visually hidden and judged by their visible label.
    const labelJudged = new Set<Element>()

    const rectOf = (el: Element) => {
      const label = labelJudged.has(el) ? labelOf(el as HTMLInputElement) : null
      return (label ?? el).getBoundingClientRect()
    }

    // True when something else is drawn on top of the element's visible part.
    const covered = (el: Element) => {
      const rect = rectOf(el)
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      if (
        rect.right <= 0 ||
        rect.left >= vw ||
        rect.bottom <= 0 ||
        rect.top >= vh
      )
        return false
      if (getComputedStyle(el).pointerEvents === 'none') return false
      const clamp = (value: number, max: number) =>
        Math.min(Math.max(value, 0), max - 1)
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + 2, rect.top + 2],
        [rect.right - 2, rect.top + 2],
        [rect.left + 2, rect.bottom - 2],
        [rect.right - 2, rect.bottom - 2],
      ]
      const labels = isChoice(el) ? Array.from(el.labels ?? []) : []
      const holder = labelJudged.has(el)
        ? labelOf(el as HTMLInputElement)
        : null
      return !points.some(([x, y]) => {
        const hit = document.elementFromPoint(clamp(x, vw), clamp(y, vh))
        if (!hit) return false
        return (
          el.contains(hit) ||
          Boolean(holder?.contains(hit)) ||
          labels.some((label) => label.contains(hit))
        )
      })
    }

    const cut = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 60)

    const nameOf = (el: Element) => {
      const label = el.getAttribute('aria-label')
      if (label?.trim()) return cut(label)
      const by = el.getAttribute('aria-labelledby')
      if (by) {
        const text = by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
        if (text.trim()) return cut(text)
      }
      const alt = el.getAttribute('alt')
      if (alt?.trim()) return cut(alt)
      const labels = (el as HTMLInputElement).labels
      if (labels && labels.length > 0) {
        const text = Array.from(labels)
          .map((l) => l.textContent ?? '')
          .join(' ')
        if (text.trim()) return cut(text)
      }
      const text = el.textContent ?? ''
      if (text.trim()) return cut(text)
      const title = el.getAttribute('title')
      if (title?.trim()) return cut(title)
      const placeholder = el.getAttribute('placeholder')
      return placeholder ? cut(placeholder) : ''
    }

    const part = (el: Element) => {
      const tag = el.tagName.toLowerCase()
      const first = Array.from(el.classList).find((c) => /^[\w-]+$/.test(c))
      return first ? `${tag}.${first}` : tag
    }

    // Ids differ between runs: UUIDs in test ids and React's generated ids.
    const stable = (testid: string) =>
      testid.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '<id>',
      )
    const generatedId = /^_?r_|:r|^radix-|«/

    const selectorOf = (el: Element) => {
      const own = el.getAttribute('data-testid')
      if (own)
        return `${el.tagName.toLowerCase()}[data-testid="${stable(own)}"]`
      const holder = el.closest('[data-testid]')
      if (holder) {
        return `[data-testid="${stable(holder.getAttribute('data-testid') ?? '')}"] ${el.tagName.toLowerCase()}`
      }
      const parts: string[] = []
      for (
        let node: Element | null = el;
        node && node !== document.body && parts.length < 4;
        node = node.parentElement
      ) {
        parts.unshift(part(node))
        if (node.id && /^[\w-]+$/.test(node.id) && !generatedId.test(node.id)) {
          parts[0] = `${node.tagName.toLowerCase()}#${node.id}`
          break
        }
      }
      return parts.join(' > ')
    }

    const add = (check: CheckName, el: Element | null, name?: string) => {
      if (el) {
        results.push({
          check,
          screen: ctx.screen,
          width: ctx.width,
          theme: ctx.theme,
          locale: ctx.locale,
          name: name ?? nameOf(el),
          selector: selectorOf(el),
          box: round(rectOf(el)),
        })
      } else {
        results.push({
          check,
          screen: ctx.screen,
          width: ctx.width,
          theme: ctx.theme,
          locale: ctx.locale,
          name: name ?? '',
          selector: 'html',
          box: {
            x: 0,
            y: 0,
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
          },
        })
      }
    }

    const guard = (run: () => void) => {
      try {
        run()
      } catch {
        // a broken check must not hide the others
      }
    }

    const disabled = (el: Element) =>
      (el as HTMLButtonElement).disabled === true ||
      el.getAttribute('aria-disabled') === 'true' ||
      (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'hidden')

    const notCovered = (el: Element) => {
      try {
        return !covered(el)
      } catch {
        return true
      }
    }

    const candidates = Array.from(
      document.querySelectorAll(interactiveSelector),
    )
    for (const el of candidates) {
      if (
        isChoice(el) &&
        visible(el) &&
        hasVisibleChain(el, true) &&
        !hasVisibleChain(el) &&
        labelOf(el)
      ) {
        labelJudged.add(el)
      }
    }
    const interactive = candidates.filter(
      (el) =>
        visible(el) &&
        (hasVisibleChain(el) || labelJudged.has(el)) &&
        notCovered(el),
    )

    const ownText = (el: Element) =>
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim()

    const textElements = Array.from(document.body.querySelectorAll('*')).filter(
      (el) =>
        !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) &&
        ownText(el) !== '' &&
        visible(el) &&
        hasVisibleChain(el) &&
        notCovered(el),
    )

    guard(() => {
      if (document.documentElement.scrollWidth > window.innerWidth) {
        add('overflow-x', null)
      }
    })

    guard(() => {
      const min = ctx.width === 390 ? 44 : 24
      for (const el of interactive) {
        if (disabled(el)) continue
        let rect = rectOf(el)
        if (isChoice(el)) {
          const label = labelOf(el)
          const box = label?.getBoundingClientRect()
          if (box && box.width * box.height > rect.width * rect.height)
            rect = box
        }
        if (rect.width >= min && rect.height >= min) continue
        if (el.tagName === 'A') {
          const block = el.parentElement
          const around = Array.from(block?.childNodes ?? []).some(
            (n) =>
              n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim(),
          )
          if (around) continue
        }
        add('target-size', el)
      }
    })

    guard(() => {
      const scrolls = (el: Element) => {
        for (let n = el.parentElement; n; n = n.parentElement) {
          const x = getComputedStyle(n).overflowX
          if ((x === 'auto' || x === 'scroll') && n.scrollWidth > n.clientWidth)
            return true
        }
        return false
      }
      const right = document.documentElement.clientWidth
      for (const el of interactive) {
        if (labelJudged.has(el)) continue
        const rect = el.getBoundingClientRect()
        if (rect.left >= -1 && rect.right <= right + 1) continue
        if (scrolls(el)) continue
        add('offscreen', el)
      }
    })

    const truncating = (el: Element) => {
      const style = getComputedStyle(el)
      return (
        style.textOverflow === 'ellipsis' ||
        (style.getPropertyValue('-webkit-line-clamp') !== 'none' &&
          style.getPropertyValue('-webkit-line-clamp') !== '')
      )
    }

    guard(() => {
      for (const el of textElements) {
        const style = getComputedStyle(el)
        if (style.display === 'inline') continue
        if (truncating(el)) continue
        const clipX =
          (style.overflowX === 'hidden' || style.overflowX === 'clip') &&
          el.scrollWidth > el.clientWidth + 1
        const clipY =
          (style.overflowY === 'hidden' || style.overflowY === 'clip') &&
          el.scrollHeight > el.clientHeight + 1
        if (clipX || clipY) add('clipped-text', el, cut(ownText(el)))
      }
    })

    guard(() => {
      for (const el of textElements) {
        if (!truncating(el)) continue
        if (
          el.scrollWidth <= el.clientWidth + 1 &&
          el.scrollHeight <= el.clientHeight + 1
        )
          continue
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        let full = false
        let node: Element | null = el
        for (let depth = 0; node && depth < 4 && !full; depth += 1) {
          for (const attr of ['title', 'aria-label']) {
            const value = (node.getAttribute(attr) ?? '').trim()
            if (value && value.includes(text)) full = true
          }
          node = node.parentElement
        }
        if (!full) add('truncated-no-full-text', el, cut(text))
      }
    })

    guard(() => {
      const rects = interactive.map((el) => el.getBoundingClientRect())
      const skip = interactive.map((el) => labelJudged.has(el))
      for (let i = 0; i < interactive.length; i += 1) {
        for (let j = i + 1; j < interactive.length; j += 1) {
          const a = interactive[i]
          const b = interactive[j]
          if (skip[i] || skip[j] || a.contains(b) || b.contains(a)) continue
          const ra = rects[i]
          const rb = rects[j]
          const dx = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
          const dy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
          if (dx > 2 && dy > 2)
            add('overlap', a, `${nameOf(a)} / ${nameOf(b)}`.slice(0, 60))
        }
      }
    })

    guard(() => {
      for (const el of textElements) {
        if (parseFloat(getComputedStyle(el).fontSize) < 12) {
          add('small-text', el, cut(ownText(el)))
        }
      }
    })

    return results
  }, context)
}

/** Writes the results of one screenshot to test-results/ui-review/raw/. */
export async function writeChecks(
  dir: string,
  file: string,
  results: CheckResult[],
) {
  const raw = path.join(dir, 'raw')
  await mkdir(raw, { recursive: true })
  await writeFile(
    path.join(raw, `${file}.json`),
    `${JSON.stringify(results, null, 2)}\n`,
  )
}
