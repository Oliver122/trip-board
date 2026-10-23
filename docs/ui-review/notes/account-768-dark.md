# account-768-dark

- Screen: account
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Header in one row: pin logo and "Trip Board" on the left, a Light / Dark / System switch (Dark selected, white fill) and the avatar "S" with "sven" on the right
- Title "Account & settings" with "Signed in as Sven", then a Storage section: a full-width solid grey bar, "0/100 · 0 MB of 200 MB" and a "Request more storage" button
- Low data section with a help text and three radio buttons: Automatic (selected), On, Off
- Settings: Language control EN (selected) / DE, Theme control Light / Dark (selected) / System, both stretched over the full width, and a small checkbox "List follows map"
- "Send places from Google Maps" section with the buttons "Send to TripBoard" and "Copy", then "On a computer" instructions and the start of "On Android" cut off at the bottom of the image

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The storage meter at 0 of 200 MB is a solid mid-grey bar over the full width (about 8 px high), so empty looks the same as full and no fill or track can be told apart | top of the page, under the "Storage" heading | U-16 |
| 2 | low | visual | The EN/DE and Light/Dark/System controls stretch to the full 704 px width with the buttons left-aligned, leaving a large empty bordered area to the right of the buttons | middle of the page, under "Language" and "Theme" | U-12 |
| 3 | low | consistency | The theme can be set twice on this screen: the header switch (Light/Dark/System) and the Theme control in Settings do the same thing and look different (the header one is boxed, the Settings one is stretched) | top right in the header and in the Settings section | U-37 |
| 4 | low | touch | The "List follows map" checkbox is only about 13 px, small beside the 44 px buttons and radios around it; the label next to it is the only larger target | left, below the Theme control | U-25 |

## Raw checks

None.
