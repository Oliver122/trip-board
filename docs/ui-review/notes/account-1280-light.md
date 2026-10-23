# account-1280-light

- Screen: account
- Width: 1280
- Theme: light
- Locale: en

## Seen

- Header: "Trip Board" logo at top left; top right a Light/Dark/System switch (Light selected, dark fill), a round "S" avatar and the name "sven"
- Title "Account & settings" with "Signed in as Sven" below, in a centred column about 704 px wide (x 288 to 992)
- Storage section: a full-width solid grey bar, "0/100 · 0 MB of 200 MB" and an outlined *Request more storage* button
- Low data section with a one-sentence explanation and three radio options, *Automatic* (selected, outlined), *On*, *Off*
- Settings section: *Language* EN/DE segmented control (EN selected), *Theme* Light/Dark/System control (Light selected), a native checkbox "List follows map"
- "Send places from Google Maps" section with its sentence and the buttons *Send to TripBoard* and *Copy*, cut by the bottom edge of the image

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The storage meter at 0 / 200 MB is a solid mid-grey bar across the full 704 px width, so empty looks like full and no fill or track can be told apart | middle left, under "Storage" | U-16 |
| 2 | low | visual | The EN/DE and Theme segmented controls stretch to the full column width with the buttons left-aligned, leaving about 600 px of empty bordered area to the right of "DE" and "System" | centre, under "Language" and "Theme" | U-12 |
| 3 | low | consistency | "Signed in as Sven" is capitalised while the header shows the same user as "sven"; one name appears in two spellings | top of the column and top right of the header | U-45 |
| 4 | low | consistency | "List follows map" is a small native 13 px checkbox while the neighbouring options (*Low data*, language, theme) are styled boxes or segmented buttons, and it is the only control that looks different and is much smaller | bottom left of the Settings section | U-25 |

## Raw checks

None.
