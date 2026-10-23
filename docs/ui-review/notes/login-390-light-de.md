# login-390-light-de

- Screen: login
- Width: 390
- Theme: light
- Locale: de

## Seen

- A one-row header: pin icon and "Trip Board" at the left, a Light / Dark / System segmented switch at the right (Light selected, dark fill)
- Under the header, a 175 px wide language switch with "EN" (dark fill, selected) and "DE" at its left; the bordered control has a large empty area to the right of the buttons
- The title "Log in" in English, left-aligned at x≈108
- A dark "Continue with Discord" button, also English and about 175 px wide
- Everything below y≈245 is empty light grey, about 600 px of the 844 px viewport

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | i18n | This is the German capture, but the page is in English: the title "Log in", the button "Continue with Discord" and the Light / Dark / System labels are English and the language switch has "EN" selected, so the German locale is not applied on the signed-out login screen (compare the German *add-spot* capture, which shows "Abbrechen") | center of the page, under the header | rejected: the capture cannot show German here: signed out, `GET /api/me` answers 401, so the German override of the capture (e2e/locale.ts) never applies and the browser is en-US; not a defect of the login page |
| 2 | low | touch | The language buttons are 43 px (EN) and 42 px (DE) wide, under the 44 px touch target; `min-h-11` fixes only the height. The DE button is as narrow as EN, so U-11 applies to both | top left of the form, below the header | U-11 |
| 3 | low | visual | The EN / DE control stretches over the container with its buttons left-aligned, leaving an empty bordered area to the right; the whole form is 175 px wide, sits at x≈108 instead of the 16 px phone margin, and the "Continue with Discord" button is half the screen wide | center of the page, form column | U-12 |

## Raw checks

- `target-size` EN (`main.mx-auto > div.mb-4 > div.flex > button.min-h-11`) → U-11
- `target-size` DE (`main.mx-auto > div.mb-4 > div.flex > button.min-h-11`) → U-11
