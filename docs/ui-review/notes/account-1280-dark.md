# account-1280-dark

- Screen: account
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- Header on one row: "Trip Board" logo with pin icon top left; top right a Light/Dark/System switch (Dark selected, white), an "S" avatar and the name "sven".
- Centred column titled "Account & settings", "Signed in as Sven", then a "Storage" section with a full-width solid grey bar, "0/100 · 0 MB of 200 MB" and a "Request more storage" button.
- "Low data" section with a two-line explanation and three radio pills Automatic (selected, outlined), On, Off.
- "Settings" section: "Language" with an EN (selected, white) / DE segmented control and "Theme" with Light / Dark (selected) / System, both stretched to the full column width with the buttons left-aligned; a "List follows map" checkbox.
- "Send places from Google Maps" section with a one-line hint and the buttons "Send to TripBoard" and "Copy" cut by the bottom edge of the image (below the fold).

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The storage meter at 0 MB of 200 MB is a solid mid-grey bar across the full 704 px width, so empty looks the same as full and no fill or track is distinguishable | top of the page, under the "Storage" heading | U-16 |
| 2 | low | visual | The EN/DE and Light/Dark/System segmented controls stretch to the full column width with the buttons left-aligned, leaving a large empty bordered area to the right (about 600 px beside DE, about 500 px beside System) | middle of the page, under "Language" and "Theme" | U-12 |
| 3 | low | consistency | The page greets "Signed in as Sven" (capitalised) while the header shows the same user as "sven" (lowercase), so one user appears with two spellings | top of the page, subtitle and header top right | U-45 |
| 4 | low | consistency | The Light/Dark/System switch appears twice, in the header and again under "Theme" in the settings, with the same selection; a user may wonder whether they differ | top right in the header and in the "Theme" row | rejected: both controls bind to the same preference and the header switch is the global shortcut by design |

## Raw checks

None.
