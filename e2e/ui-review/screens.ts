import type { Page } from '@playwright/test'
import { waitForMapLoaded } from '../map'

export type Width = 1280 | 768 | 390

export const viewports: Record<Width, { width: number; height: number }> = {
  1280: { width: 1280, height: 900 },
  768: { width: 768, height: 1024 },
  390: { width: 390, height: 844 },
}

export type Screen = {
  id: string
  path: string
  user: 'sven' | null
  widths: Width[]
  /** The map is on this screen, so its tiles are awaited. */
  map: boolean
  prepare: (page: Page, width: Width) => Promise<void>
  /** Waits for content that only exists once the screen's data has loaded. */
  ready: (page: Page, width: Width) => Promise<void>
}

export const sven = '100000000000000001'

// seedIds.trip of apps/api/src/db/seed.ts: the seeded Japan 2026
const japan = '/trips/10000000-0000-0000-0000-000000000001'

const all: Width[] = [1280, 768, 390]
const wide: Width[] = [1280, 768]
const phone: Width[] = [390]

const nothing = async () => {}

// Prepare also runs in German at 390 px, so names match both languages.
const tripSections = /^(Trip sections|Reisebereiche)$/
const more = /^(More|Mehr)$/
const members = /^(Members|Mitglieder)$/

const heading = async (page: Page) => {
  await page.getByRole('heading', { level: 1 }).first().waitFor()
}

// A seeded spot pin is on the map once the spots have loaded.
const pinned = async (page: Page) => {
  await page
    .locator('button[data-testid^="pin-2"]')
    .first()
    .waitFor({ state: 'attached' })
}

const rows = (page: Page, selector: string, text?: RegExp) =>
  page.locator(selector, text ? { hasText: text } : undefined).first()

async function openList(page: Page, width: Width) {
  if (width !== 390) return
  await page
    .getByRole('navigation', { name: tripSections })
    .getByRole('link', { name: /^(List|Liste)$/ })
    .click()
}

async function showAllSpots(page: Page) {
  const only = page.getByRole('checkbox', {
    name: /Only visible on map|Nur auf der Karte sichtbar/,
  })
  if (await only.isChecked().catch(() => false)) await only.uncheck()
}

async function openMore(page: Page) {
  await page
    .getByRole('navigation', { name: tripSections })
    .getByRole('button', { name: more })
    .click()
  await page.getByRole('dialog', { name: more }).waitFor({ timeout: 15_000 })
}

async function openMembers(page: Page, width: Width) {
  if (width === 390) {
    await openMore(page)
    await page
      .getByRole('dialog', { name: more })
      .getByRole('button', { name: members })
      .click()
  } else {
    await page.getByRole('button', { name: /Members|Mitglieder/ }).click()
  }
  await page.getByRole('dialog', { name: members }).waitFor({ timeout: 15_000 })
}

export const screens: Screen[] = [
  {
    id: 'login',
    path: '/login',
    user: null,
    widths: all,
    map: false,
    prepare: nothing,
    ready: heading,
  },
  {
    id: 'trips',
    path: '/trips',
    user: 'sven',
    widths: all,
    map: false,
    prepare: nothing,
    ready: async (page) => {
      await rows(page, 'article', /Japan 2026/).waitFor()
    },
  },
  {
    id: 'board-map',
    path: japan,
    user: 'sven',
    widths: all,
    map: true,
    prepare: nothing,
    ready: pinned,
  },
  {
    id: 'board-list',
    path: `${japan}?view=list`,
    user: 'sven',
    widths: phone,
    map: false,
    prepare: async (page) => {
      await page.getByTestId('spot-list').waitFor({ timeout: 15_000 })
    },
    ready: async (page) => {
      await page
        .getByTestId('spot-list')
        .getByText('Fushimi Inari')
        .first()
        .waitFor()
    },
  },
  {
    id: 'spot-panel',
    path: japan,
    user: 'sven',
    widths: all,
    map: true,
    prepare: async (page, width) => {
      await openList(page, width)
      await showAllSpots(page)
      await page
        .getByTestId('spot-list')
        .getByRole('button', { name: /Fushimi Inari/ })
        .click()
      await page.getByRole('dialog').waitFor({ timeout: 15_000 })
    },
    ready: async (page) => {
      await page.waitForFunction(() =>
        Array.from(
          document.querySelectorAll<HTMLInputElement>('[role="dialog"] input'),
        ).some((input) => input.value === 'Fushimi Inari'),
      )
      await pinned(page)
    },
  },
  {
    id: 'add-spot',
    path: japan,
    user: 'sven',
    widths: all,
    map: true,
    prepare: async (page) => {
      await page.getByTestId('add-new').click()
      await page
        .getByRole('dialog', { name: /^(New spot|Neuer Ort)$/ })
        .waitFor({ timeout: 15_000 })
    },
    ready: pinned,
  },
  {
    id: 'schedule',
    path: `${japan}/schedule`,
    user: 'sven',
    widths: all,
    map: false,
    prepare: nothing,
    ready: async (page, width) => {
      await rows(page, '[data-testid^="entry-row-"]').waitFor()
      // The map sits beside the schedule on wide screens only.
      if (width !== 390) await waitForMapLoaded(page)
    },
  },
  {
    id: 'trip-settings',
    path: `${japan}/settings`,
    user: 'sven',
    widths: all,
    map: false,
    prepare: nothing,
    ready: async (page, width) => {
      // Spot kinds are edited on a larger screen only.
      const kinds = width === 390 ? 'kinds-phone-note' : 'kind-row'
      await rows(page, `[data-testid="${kinds}"]`).waitFor()
    },
  },
  {
    id: 'members',
    path: japan,
    user: 'sven',
    widths: all,
    map: true,
    prepare: (page, width) => openMembers(page, width),
    ready: async (page) => {
      await page
        .getByRole('dialog', { name: members })
        .locator('[data-testid^="member-"]', { hasText: 'Aiko' })
        .waitFor()
      await pinned(page)
    },
  },
  {
    id: 'export',
    path: japan,
    user: 'sven',
    widths: wide,
    map: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Export' }).click()
      await page
        .getByRole('dialog', { name: /Export .*Japan 2026/ })
        .waitFor({ timeout: 15_000 })
    },
    ready: async (page) => {
      await page
        .getByRole('dialog')
        .getByRole('link', { name: /Download|Herunterladen/ })
        .waitFor()
      await pinned(page)
    },
  },
  {
    id: 'more-sheet',
    path: japan,
    user: 'sven',
    widths: phone,
    map: true,
    prepare: (page) => openMore(page),
    ready: pinned,
  },
  {
    id: 'account',
    path: '/account',
    user: 'sven',
    widths: all,
    map: false,
    prepare: nothing,
    ready: async (page) => {
      await page.getByTestId('account-quota').waitFor()
    },
  },
  {
    id: 'join-invalid',
    path: '/join/unknown',
    user: 'sven',
    widths: all,
    map: false,
    prepare: nothing,
    ready: heading,
  },
  {
    id: 'not-found',
    path: '/does-not-exist',
    user: 'sven',
    widths: all,
    map: false,
    prepare: nothing,
    ready: heading,
  },
  {
    id: 'admin-dashboard',
    path: '/admin',
    user: 'sven',
    widths: all,
    map: false,
    prepare: nothing,
    ready: async (page, width) => {
      // The admin area shows only a notice on a phone.
      await page
        .getByTestId(width === 390 ? 'admin-phone-notice' : 'kpi-events')
        .waitFor()
    },
  },
  {
    id: 'admin-users',
    path: '/admin/users',
    user: 'sven',
    widths: all,
    map: false,
    prepare: nothing,
    ready: async (page, width) => {
      await (
        width === 390
          ? page.getByTestId('admin-phone-notice')
          : rows(page, 'tbody tr')
      ).waitFor()
    },
  },
]
