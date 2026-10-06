# Step 12 — Home spots (option D)

**Goal:** home spots with optional stay periods, a primary home base, and the right home shown for each part of the trip.
**Depends on:** 11

## Scope
- In: stay from/to fields for home spots, “Primary home base” toggle, home resolution per plan entry (`plan_entry_home` view), home shown in schedule and on the map, overlap warning.
- Out: distance/travel time from home (backlog).

## Requirements
| ID | Requirement |
| --- | --- |
| R-12-01 | When category is Home, the panel shows **Stay from / to** (optional) and a **Primary home base** checkbox |
| R-12-02 | Setting a primary home base unsets the previous one (one per trip); changing its category away from Home clears it |
| R-12-03 | `GET /trips/:id/plan` includes `home: {spotId, title}` per entry, resolved by overlapping stay period, else the primary home base, else null |
| R-12-04 | Schedule shows the home next to each bucket (⌂ Hotel Gracery); single entries show it only when they fall inside a stay |
| R-12-05 | Home pins use the house icon and stay Home even when they appear in plans |
| R-12-06 | Overlapping stay periods for two home spots show a warning (allowed, e.g. a hotel change day) |
| R-12-07 | The primary home base has a distinct marker (filled house) and appears first among home spots in the list |
| R-12-08 | Clearing stay dates is allowed; the spot remains a home spot |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-12-01 | api | R-12-03 | Seed: Tokyo bucket resolves to Hotel Gracery (stay 12–16), Kyoto bucket to the Ryokan, Nara single (20 Apr, no stay) to the primary home base |
| T-12-02 | api | R-12-02 | Setting spot B as primary replaces spot A; recategorising B to Maybe makes primary null |
| T-12-03 | api | R-12-01 | Stay dates on a Must go spot → 400; stay_to before stay_from → 400 |
| T-12-04 | api | R-12-05 | A home spot added to a plan keeps `displayCategory = home` |
| T-12-05 | e2e | R-12-01 | Switching the category to Home reveals the stay fields; switching away hides and clears them (with confirm) |
| T-12-06 | e2e | R-12-04 | Schedule shows “⌂ Hotel Gracery” in the Tokyo bucket header |
| T-12-07 | e2e | R-12-06 | Two overlapping stays show the overlap warning in both panels |
| T-12-08 | unit | R-12-07 | Primary home pin renders the filled-house variant |
