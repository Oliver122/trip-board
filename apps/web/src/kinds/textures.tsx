import { kindSymbolIndex, type KindSymbol } from '@tripboard/shared'
import { useSyncExternalStore } from 'react'
import { cn } from '../lib/utils'
import bundledManifest from './texture-manifest.json'
import { KindSymbolIcon } from './symbols'

/**
 * A symbol's texture is a cell of `/textures/kind-symbols.png` (8 x 8 cells),
 * listed in `texture-manifest.json` only when the cell is filled (R-29-19).
 */
export type SymbolTexture = {
  /** `/textures/kind-symbols.png?v=<version>` */
  url: string
  /** CSS `background-position` of the symbol's cell, e.g. `"71.43% 0%"`. */
  position: string
}

type Manifest = { version: string; filled: readonly number[] }

const atlasPath = '/textures/kind-symbols.png'
const gridCells = 8

/** Dev builds let Playwright swap the manifest through localStorage. */
function loadManifest(): Manifest {
  if (import.meta.env.DEV) {
    try {
      const raw = localStorage.getItem('tripboard.textureManifest')
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Manifest>
        if (
          typeof parsed.version === 'string' &&
          Array.isArray(parsed.filled)
        ) {
          return { version: parsed.version, filled: parsed.filled }
        }
      }
    } catch {
      // Storage may be blocked or hold junk; the bundled manifest applies.
    }
  }
  return bundledManifest
}

let manifest: Manifest | null = null

function current(): Manifest {
  manifest ??= loadManifest()
  return manifest
}

/** The symbol's texture when its cell is filled, else null. Pure. */
export function symbolTexture(symbol: KindSymbol): SymbolTexture | null {
  const { version, filled } = current()
  const index = kindSymbolIndex(symbol)
  if (index < 0 || !filled.includes(index)) return null
  const column = index % gridCells
  const row = Math.floor(index / gridCells)
  const step = 100 / (gridCells - 1)
  return {
    url: `${atlasPath}?v=${version}`,
    position: `${column * step}% ${row * step}%`,
  }
}

// One probe per atlas version, shared by every pin (R-29-20).
const failed = new Set<string>()
const probed = new Set<string>()
const listeners = new Set<() => void>()

function probe(url: string) {
  if (probed.has(url)) return
  probed.add(url)
  const image = new Image()
  image.onerror = () => {
    failed.add(url)
    for (const listener of listeners) listener()
  }
  image.src = url
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test hook: forget the manifest and every probe result. */
export function resetTextureState() {
  manifest = null
  failed.clear()
  probed.clear()
}

/**
 * Like {@link symbolTexture}, but null once the atlas failed to load at
 * runtime (R-29-20), and it never triggers a request when the manifest is
 * empty.
 */
export function useSymbolTexture(symbol: KindSymbol): SymbolTexture | null {
  const texture = symbolTexture(symbol)
  const url = texture?.url ?? ''
  const hasFailed = useSyncExternalStore(
    subscribe,
    () => failed.has(url),
    () => false,
  )
  if (!texture) return null
  probe(texture.url)
  return hasFailed ? null : texture
}

/**
 * The symbol as a pin or tile shows it: the round texture (with `ringColor`
 * as a 2 px ring) when filled, otherwise the white vector symbol.
 */
export function SymbolMark({
  symbol,
  ringColor,
  className,
}: {
  symbol: KindSymbol
  ringColor?: string
  className?: string
}) {
  const texture = useSymbolTexture(symbol)
  if (!texture) return <KindSymbolIcon symbol={symbol} className={className} />
  return (
    <span
      aria-hidden="true"
      data-texture={symbol}
      className={cn('block shrink-0 rounded-full', className)}
      style={{
        backgroundImage: `url("${texture.url}")`,
        backgroundSize: `${gridCells * 100}%`,
        backgroundPosition: texture.position,
        backgroundRepeat: 'no-repeat',
        border: `2px solid ${ringColor ?? 'currentColor'}`,
      }}
    />
  )
}
