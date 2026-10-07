import { expect, type Locator } from '@playwright/test'
import { settle } from './settle'

type Paint = {
  backgroundColor: string
  borderColor: string
  boxShadow: string
  transform: string
  textDecoration: string
  cursor: string
  color: string
}

export async function expectHover(locator: Locator) {
  const page = locator.page()
  await settle(page)
  const before = await paint(locator)
  await locator.hover()
  await settle(page)
  const after = await paint(locator)
  expect(after.cursor).toBe('pointer')
  expect(visual(after)).not.toEqual(visual(before))
}

function visual(value: Paint) {
  return {
    backgroundColor: value.backgroundColor,
    borderColor: value.borderColor,
    boxShadow: value.boxShadow,
    transform: value.transform,
    textDecoration: value.textDecoration,
    color: value.color,
  }
}

function paint(locator: Locator): Promise<Paint> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      boxShadow: style.boxShadow,
      transform: style.transform,
      textDecoration: style.textDecorationLine,
      cursor: style.cursor,
      color: style.color,
    }
  })
}
