# trips-1280-dark

- Screen: trips
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- One-row header: pin icon and "Trip Board" at the left, then a Light / Dark / System switch (Dark selected, white fill) and the avatar "S" with "sven" at the right
- Title "My trips" at the left with a white "New trip" button at the right (x 1032 to 1120), both inside a 960 px content column
- One card "Japan 2026" (472 px wide, left half of the column) with an "Owner" badge top right, the dates "12 Apr 2026 – 24 Apr 2026", three overlapping avatars S, A, T and "Created by Sven"
- A plain white-text "Trip settings" link at the bottom of the card, drawn like body text
- No unread-comment line on the card; the rest of the screen below the card (about 540 px) is empty

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | "Trip settings" is a text-only link about 20 px high (the check box is 438×20 px) with no underline or icon, so it looks like a caption and is a small target; it is the only visible action inside the card | bottom of the Japan 2026 card | U-04 |
| 2 | low | consistency | The header content starts at x=32 and ends at x=1244 while the page content sits in a 960 px column (x 160 to 1120), so the logo and avatar menu do not line up with the title and "New trip" button | header versus the My trips title row | U-43 |
| 3 | low | visual | The "Owner" badge is near-black on the dark card with 11 px light text, so its outline is hard to see and the text is small | top right of the card | U-44 |

## Raw checks

- `target-size` Trip settings (`main.mx-auto > div.grid > article.flex > a.cursor-pointer`) → U-04
