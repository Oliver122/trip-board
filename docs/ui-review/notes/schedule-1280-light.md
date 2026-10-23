# schedule-1280-light

- Screen: schedule
- Width: 1280
- Theme: light
- Locale: en

## Seen

- One-row header: Trip Board logo, tabs Board / Schedule (active, black) / Trip settings, then News, three member avatars (S, A, T), the Light/Dark/System switch (Light active) and the user "sven".
- Left list column about 420 px wide, titled "Schedule", with black "+ Bucket" and outlined "+ Single" buttons.
- Single entry "Arrival" (black dot, ⌂ Hotel Gracery, 12 Apr 2026 15:00) with a pencil icon and an "Add spot" button below it.
- Bucket "Tokyo" (⌂ Hotel Gracery, 12 Apr 2026 – 16 Apr 2026) with spots Shibuya Sky (13 Apr 2026 18:00) and teamLab Borderless (14 Apr 2026); each row has a drag handle, up and down chevrons and a red-outlined ✕; then "Add spot".
- Bucket "Kyoto" (⌂ Kyoto Ryokan, 17 Apr 2026 – 20 Apr 2026) with the spot Fushimi Inari (18 Apr 2026 09:00), its chevrons both greyed, a red ✕ and "Add spot".
- Right of the list a map filling about 860 px, zoomed out over Japan and Korea with a few pins around Osaka and Tokyo (one orange house pin), long thin route lines across the sea, zoom and locate buttons bottom right and the OpenFreeMap · OpenStreetMap credit bottom left. Empty list space below Kyoto.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | Each spot row ends with two chevrons and a loud red-outlined ✕ side by side; the ✕ looks like delete, sits right next to the down chevron, and the disabled chevrons (up on Shibuya Sky, down on teamLab Borderless, both on Fushimi Inari) are still drawn. Rows show no category mark. | right end of every spot row in the Tokyo and Kyoto buckets | U-05 |
| 2 | low | state | The map does not show the selected entry as DESIGN §3.4 describes ("map zoomed to the selected entry"): it is zoomed out so that Korea, Hokkaido and Taipei are in view and the pins around Osaka and Tokyo overlap into small clumps, with long straight lines crossing the sea. Nothing on the screen says what the lines are. | right side, the whole map | U-24 |
| 3 | low | consistency | The single entry "Arrival" has its own "Add spot" button, while the design shows singles as one line without spots; the dot, text and pencil also sit in a different column rhythm than the bucket chevrons below. | top of the list, under "Arrival" | U-39 |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: the map credit line of the map library, 177 × 21 px at the bottom left, readable and required by the licence
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: credit link of the map library, 14 px high, not an action on this screen
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: credit link of the map library, 14 px high, not an action on this screen
