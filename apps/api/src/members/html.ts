const genericTitle = 'Join on Trip Board'

export function isPreviewBot(userAgent: string | undefined): boolean {
  const ua = userAgent ?? ''
  return /bot|facebookexternalhit|embedly|quora|whatsapp|slack|telegram|discord|preview/i.test(
    ua,
  )
}

/** Open Graph document. A null title means the code is not a live invite. */
export function joinPreviewHtml(tripName: string | null): string {
  const title = tripName ?? genericTitle
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(genericTitle)}">
<meta property="og:type" content="website">
</head>
<body>
<p>${escapeHtml(genericTitle)}</p>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
