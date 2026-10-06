import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export function Sparkline({
  values,
  href,
}: {
  values: number[]
  href: string
}) {
  const { t } = useTranslation()
  const max = Math.max(1, ...values)
  const width = 140
  const height = 36
  const gap = 2
  const bar = values.length > 0 ? width / values.length : width
  return (
    <section className="mb-6" aria-labelledby="spark-heading">
      <h2 id="spark-heading" className="mb-2 font-semibold">
        {t('admin.spark.title')}
      </h2>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mb-2 h-9 w-36 text-foreground"
        aria-hidden="true"
      >
        {values.map((value, index) => {
          const h = (value / max) * height
          return (
            <rect
              key={index}
              x={index * bar}
              y={height - h}
              width={Math.max(1, bar - gap)}
              height={h}
              fill="currentColor"
            />
          )
        })}
      </svg>
      <p className="sr-only">{values.join(', ')}</p>
      <Link to={href} className="underline">
        {t('admin.spark.view')}
      </Link>
    </section>
  )
}
