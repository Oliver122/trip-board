# account-768-light

- Screen: account
- Width: 768
- Theme: light
- Locale: en

## Seen

- Header on one row, about 62 px high: pin icon and "Trip Board" on the left, the Light / Dark / System switch (Light selected) and the avatar "S" with "sven" on the right
- Title "Account & settings" with "Signed in as Sven" below it, then a *Storage* section: a full-width solid grey bar, "0/100 · 0 MB of 200 MB" and a "Request more storage" button
- *Low data* section with a short explanation and three radio pills: Automatic (selected), On, Off
- *Settings* section: Language with an EN (selected) / DE segmented control and Theme with Light (selected) / Dark / System, both stretched across the full 704 px width with the buttons left-aligned; below them a "List follows map" checkbox
- *Send places from Google Maps* section: explanation text, "Send to TripBoard" and "Copy" buttons, then "On a computer" with its instructions and the "On Android" heading cut off at the bottom of the image

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The storage meter at 0 of 200 MB is a solid mid-grey bar across the full width, so an empty meter looks the same as a full one | top third, under the "Storage" heading | U-16 |
| 2 | low | visual | The EN/DE and Light/Dark/System controls stretch to the container width with the buttons packed on the left, leaving a large empty bordered area (about 620 px for EN/DE) | middle, under "Language" and "Theme" | U-12 |
| 3 | low | consistency | The theme is set twice on this screen, in the header switch and in the Theme control under Settings, with the same three options | top right and middle | U-37 |
| 4 | low | consistency | The header is a single 62 px row here, so the two-row header described in U-01 does not apply to this image | top, in the header | rejected: the logo, theme switch and avatar share one row at 768 px, no wrap |

## Raw checks

None.
