import { expect, type Page } from '@playwright/test'

// Answers the in-app ConfirmDialog (replaces native window.confirm dialogs).
export async function answerConfirm(
  page: Page,
  answer: 'accept' | 'dismiss',
): Promise<void> {
  const dialog = page.getByTestId('confirm-dialog')
  await expect(dialog).toBeVisible()
  await dialog
    .getByTestId(answer === 'accept' ? 'confirm-accept' : 'confirm-cancel')
    .click()
  await expect(dialog).toHaveCount(0)
}
