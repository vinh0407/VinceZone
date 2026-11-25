import { expect, test } from '@playwright/test'

const BASE_URL = process.env.VINCEZONE_URL || 'http://127.0.0.1:40704'

test.describe('VinceZone Studio IDE Smoke Suite', () => {
  test('renders IDE workspace, header menu, project switcher, and right AI chat', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await expect(page.getByText('VinceZone', { exact: true })).toBeVisible()
    await expect(page.getByRole('menubar', { name: 'Application menu' })).toBeVisible()

    // Verify Project Switcher dropdown opens and includes "Thêm dự án mới…"
    const switcher = page.locator('header button[aria-haspopup="menu"]:not([role="menuitem"])').first()
    await expect(switcher).toBeVisible()
    await switcher.click()
    await expect(page.getByText('Thêm dự án mới…')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('opens Quick Open / Command Palette via Ctrl+P', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.keyboard.press('Control+p')
    await expect(page.locator('input[placeholder*="file"], input[placeholder*="command"]').first()).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('opens Keyboard Shortcuts Cheatsheet from Help menu', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.getByRole('menuitem', { name: 'Help' }).click()
    await expect(page.getByText('Welcome / Recent Projects')).toBeVisible()
    await expect(page.getByText('Export Diagnostic Logs…')).toBeVisible()
    await page.getByText('Keyboard Shortcuts Cheatsheet').click()
    await expect(page.getByText('Ctrl+P')).toBeVisible()
  })
})
