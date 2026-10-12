import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, buttonVariants } from '../components/ui/button'
import { bookmarkletCode } from './bookmarklet'

/** Account page section: how to send places from Google Maps (R-33-10). */
export function GoogleMapsSection() {
  const { t } = useTranslation()
  const headingId = useId()
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [copied, setCopied] = useState(false)
  const code = bookmarkletCode(window.location.origin)

  // React 19 refuses javascript: URLs in href, so the attribute is set here.
  useEffect(() => {
    linkRef.current?.setAttribute('href', code)
  }, [code])

  const copy = () => {
    void navigator.clipboard
      .writeText(code)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid="google-maps-section"
      className="mt-6 space-y-3"
    >
      <h2 id={headingId} className="text-base font-semibold">
        {t('share.account.title')}
      </h2>
      <p>{t('share.account.intro')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          ref={linkRef}
          draggable
          data-testid="bookmarklet"
          className={buttonVariants({ variant: 'outline' })}
        >
          {t('share.account.bookmarklet')}
        </a>
        <Button variant="outline" onClick={copy}>
          {t('share.account.copy')}
        </Button>
        {copied ? <span role="status">{t('share.account.copied')}</span> : null}
      </div>
      <h3 className="text-sm font-semibold">{t('share.account.desktop')}</h3>
      <p>{t('share.account.desktopHow')}</p>
      <h3 className="text-sm font-semibold">{t('share.account.android')}</h3>
      <p>{t('share.account.androidHow')}</p>
      <h3 className="text-sm font-semibold">{t('share.account.iphone')}</h3>
      <p>{t('share.account.iphoneHow')}</p>
    </section>
  )
}
