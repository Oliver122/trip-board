import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'

export type ChartColumn = { key: string; label: string }

export function InsightChart({
  testId,
  title,
  points,
  columns,
  rows,
  children,
}: {
  testId: string
  title: string
  points: number
  columns: ChartColumn[]
  rows: { key: string; cells: string[] }[]
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [table, setTable] = useState(false)
  return (
    <section
      data-testid={testId}
      data-points={points}
      aria-labelledby={`${testId}-title`}
      className="rounded-card border border-border bg-card p-4 shadow-panel"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${testId}-title`} className="font-semibold">
          {title}
        </h2>
        <button
          type="button"
          className={cn(
            hoverClass.secondary,
            'inline-flex min-h-11 items-center rounded-[8px] px-3',
          )}
          aria-pressed={table}
          onClick={() => setTable((value) => !value)}
        >
          {table
            ? t('admin.dashboard.showChart')
            : t('admin.dashboard.showTable')}
        </button>
      </div>
      {table ? (
        rows.length === 0 ? (
          <p className="text-muted">{t('admin.dashboard.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className="border-b border-border px-2 py-2"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    {row.cells.map((cell, index) => (
                      <td key={`${row.key}-${index}`} className="px-2 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : rows.length === 0 ? (
        <p className="text-muted">{t('admin.dashboard.empty')}</p>
      ) : (
        <div className="text-foreground" aria-hidden="true">
          {children}
        </div>
      )}
    </section>
  )
}

export function LineChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const width = 320
  const height = 120
  const step = values.length > 1 ? width / (values.length - 1) : width
  const points = values
    .map((value, index) => {
      const x = index * step
      const y = height - (value / max) * (height - 8) - 4
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={points}
      />
    </svg>
  )
}

export function BarChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const width = 320
  const height = 120
  const gap = 2
  const bar = values.length > 0 ? width / values.length : width
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img">
      {values.map((value, index) => {
        const h = (value / max) * (height - 4)
        return (
          <rect
            key={index}
            x={index * bar + gap / 2}
            y={height - h}
            width={Math.max(1, bar - gap)}
            height={h}
            fill="currentColor"
          />
        )
      })}
    </svg>
  )
}

export function StackedChart({
  series,
}: {
  series: { color: string; values: number[] }[]
}) {
  const count = series[0]?.values.length ?? 0
  const totals = Array.from({ length: count }, (_, index) =>
    series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0),
  )
  const max = Math.max(1, ...totals)
  const width = 320
  const height = 120
  const gap = 2
  const bar = count > 0 ? width / count : width
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img">
      {totals.map((_, index) => {
        let y = height
        return (
          <g key={index}>
            {series.map((item) => {
              const h = ((item.values[index] ?? 0) / max) * (height - 4)
              y -= h
              return (
                <rect
                  key={item.color}
                  x={index * bar + gap / 2}
                  y={y}
                  width={Math.max(1, bar - gap)}
                  height={h}
                  fill={item.color}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

export function AreaChart({
  left,
  right,
  capacity,
}: {
  left: number[]
  right: number[]
  capacity: number[]
}) {
  const max = Math.max(1, ...left, ...right, ...capacity)
  const width = 320
  const height = 120
  const path = (values: number[]) => {
    if (values.length === 0) return ''
    const step = values.length > 1 ? width / (values.length - 1) : width
    const coords = values.map((value, index) => {
      const x = index * step
      const y = height - (value / max) * (height - 8) - 4
      return `${x},${y}`
    })
    return `M ${coords[0]} L ${coords.join(' L ')} L ${width},${height} L 0,${height} Z`
  }
  const line = (values: number[]) => {
    const step = values.length > 1 ? width / (values.length - 1) : width
    return values
      .map((value, index) => {
        const x = index * step
        const y = height - (value / max) * (height - 8) - 4
        return `${x},${y}`
      })
      .join(' ')
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img">
      <path d={path(left)} fill="var(--cat-planned)" opacity="0.35" />
      <path d={path(right)} fill="var(--cat-home)" opacity="0.45" />
      <polyline
        fill="none"
        stroke="currentColor"
        strokeDasharray="4 3"
        strokeWidth="1.5"
        points={line(capacity)}
      />
    </svg>
  )
}

export function HorizontalChart({
  rows,
}: {
  rows: { label: string; value: number }[]
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span>{row.label}</span>
          </div>
          <div className="h-2 rounded-full bg-border">
            <div
              className="h-2 rounded-full bg-foreground"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
