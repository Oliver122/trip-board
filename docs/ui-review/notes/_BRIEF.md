# Review brief: {{image}}

You review **one** screenshot of Trip Board, `{{image}}`, and write **one** note about it. Your judgement must rest on this image only, so it stays free of every other screenshot (step 41, R-41-03 to R-41-06 in `requirements/41-per-screenshot-review-and-phone-sketch.md`).

## Read exactly these, nothing else

1. `test-results/ui-review/{{image}}.jpg`: the screenshot (Read it as an image; look at it closely, zoom into the corners and edges).
2. `test-results/ui-review/raw/{{image}}.json`: the layout check results for this screenshot (an array; empty when nothing was found). Each has `check`, `name`, `selector` and `box` in CSS pixels of the screenshot.
3. The `docs/DESIGN.md` section of this screen from the table below (read only that section, by its line range), and the core rule rows it names (search `requirements/core/` for lines starting with `| C-APP-25 |`).
4. The `## Findings` table of `docs/UI_REVIEW.md` (read only that section): the known problems `U-01`, `U-02`, … you map your problems to.
5. Your note `docs/ui-review/notes/{{image}}.md`, a stub you fill in.

Read with the Read and Grep tools only. The one shell command you run is `node scripts/ui-review/notes.mjs --note {{image}}`, exactly like that (no `cd`, no pipes, nothing chained).

Do **not** read any other screenshot, any other note, any other raw JSON, the app source, or the git history. If you think another screen would help, write what you would compare in the issue text instead; the head agent compares the notes later.

## The image

The name is `<screen>-<width>-<theme>[-de]`: width 1280, 768 or 390 CSS px (viewports 1280×900, 768×1024, 390×844), theme `light` or `dark`, `-de` means the UI is in German (otherwise English). The capture ran against a freshly seeded database: the user is *sven* (owner of *Japan 2026* and platform admin); the trip has spots in Tokyo, Kyoto and Nara, two buckets (Tokyo, Kyoto), one single entry and two home spots. The app scrolls inside its own containers, so the JPEG shows only the top of a long screen; what is below the fold is not a problem of this image. Below 640 px the phone layout applies (bottom bar C-APP-25, one-row trip header C-APP-35, hidden setup and bulk work C-APP-36); 640 to 1023 px is the tablet layout (C-APP-24).

| Screen | What it shows | DESIGN.md section | Core rules |
| --- | --- | --- | --- |
| `login` | `/login`, signed out | §4.1 Discord login + invite join | C-APP-06, C-APP-07, C-APP-09, C-AUTH-17 |
| `trips` | `/trips`, *My trips* | §2 Screen map | C-TRIP-10, C-MEMB-22, C-APP-03, C-APP-05 |
| `board-map` | the trip board, map (at 1280 and 768 with the list column) | §3.1 Trip board, §3.7 Tablet and phone | C-APP-03, C-APP-24, C-APP-25, C-APP-35, C-MAP-04, C-MAP-06, C-MAP-07, C-LIST-07, C-LIST-13 |
| `board-list` | the board's *List* tab on the phone | §3.7 Tablet and phone | C-APP-25, C-APP-35, C-LIST-13, C-LIST-16 |
| `spot-panel` | the board with the panel of *Fushimi Inari* open | §3.3 Spot panel, §3.7 Tablet and phone | C-SPOT-15, C-SPOT-16, C-SPOT-18, C-SPOT-28, C-SPOT-29, C-KIND-16, C-APP-24, C-APP-31 |
| `add-spot` | the board with the add panel open, nothing typed | §3.3 Spot panel | C-SPOT-13, C-SPOT-14, C-SPOT-15, C-SPOT-27, C-KIND-16, C-APP-24, C-APP-31 |
| `schedule` | `/trips/<id>/schedule` | §3.4 Schedule view | C-PLAN-10, C-PLAN-11, C-HOME-06, C-APP-25, C-APP-36 |
| `trip-settings` | `/trips/<id>/settings` | §2 Screen map, §3.7 Tablet and phone | C-TRIP-12, C-TRIP-13, C-KIND-18, C-APP-36 |
| `members` | the Members dialog | §3.5 Members & invite dialog | C-MEMB-19, C-MEMB-20, C-APP-19 |
| `export` | the Export dialog | §3.6 Export dialog | C-EXP-03, C-APP-19 |
| `more-sheet` | the phone *More* sheet | §3.7 Tablet and phone | C-APP-25, C-APP-37 |
| `account` | `/account`, *Account & settings* | §3.12 Account | C-APP-06, C-APP-09, C-APP-34 |
| `join-invalid` | `/join/unknown`, an invalid invite | §4.1 Discord login + invite join | C-MEMB-18, C-APP-12 |
| `not-found` | `/does-not-exist` | §2 Screen map | C-APP-01, C-APP-12 |
| `admin-dashboard` | `/admin` (at 390 px the larger-screen notice) | §3.8 Admin — layout and dashboard | C-ADMIN-03, C-ADMIN-28, C-ADMIN-29, C-APP-36 |
| `admin-users` | `/admin/users` (at 390 px the larger-screen notice) | §3.9 Admin — users table | C-ADMIN-03, C-ADMIN-04, C-APP-36 |

Look for: controls that overlap, are cut off, hidden or off screen; text that is clipped, truncated without a way to read it, too small or too low in contrast; touch targets under 44 px at 390 (24 px otherwise); spacing that is uneven or not 16 px from the screen edge on the phone; empty space or chrome that pushes content down; elements that look clickable and are not, or the other way round; labels in the wrong language or mixed formats (dates, numbers); states that leave the user without a next step; anything that contradicts the DESIGN.md section or a core rule above. Judge only what the image shows; do not guess at behaviour you cannot see.

## Write the note

Fill `docs/ui-review/notes/{{image}}.md` and keep its first six lines as they are. Exactly this shape:

```
# {{image}}

- Screen: <screen>
- Width: <width>
- Theme: <light|dark>
- Locale: <en|de>

## Seen

- 3 to 8 bullets: the title, the main controls and the data on screen, top to bottom, specific enough that a reader can tell you looked at this image

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | What is wrong and why it matters, with sizes or text you can read | bottom right, above the tab bar | U-04 |

## Raw checks

- `target-size` Back home (`div.flex > main.mx-auto > a.cursor-pointer`) → U-04
```

- **Problems:** the line `None.` when you find nothing, else one row per problem, numbered 1, 2, … Severity: `high` (a task cannot be finished or content is unreachable or unreadable at this width), `medium` (it works but is hard: tiny target, clipped label, overlapping or hidden controls), `low` (cosmetic or inconsistent). Category: `mobile`, `layout`, `touch`, `text`, `i18n`, `visual`, `state` or `consistency`. *Where* names the place on screen in words (e.g. "top right, in the header"). *Known* is the `U-` ID from *Findings* when that row describes the same problem on this screen, `new` when no row does, or `rejected: <reason>` when you noticed something and decided it is not a problem (e.g. the design asks for it). Escape a `|` inside a cell as `\|`.
- **Raw checks:** the line `None.` when the JSON is an empty array, else one bullet per result in the JSON: `` `<check>` <name> (`<selector>`) → `` followed by the `U-` ID it belongs to, `new` (then it is also a row in Problems), or `accepted: <reason>` when it is not a real problem in this image.
- Do not edit any other file. Then run `node scripts/ui-review/notes.mjs --note {{image}}` and fix your note until it prints `ok`.

Reply with one line: `{{image}}: <n> problems (<k> new)`.
