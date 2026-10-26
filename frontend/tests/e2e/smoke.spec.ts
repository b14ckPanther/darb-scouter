import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import jobs from '../../src/data/fixtures/jobs.json' with { type: 'json' }

const first = [...jobs].sort((a, b) => b.score.total - a.score.total)[0]

test('radar → scouter: the first blip opens its scan and the power level settles', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(first.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click()
  await expect(page).toHaveURL(/\/job\//)
  await expect(page.locator('.hs-num')).toHaveText(first.score.total.toLocaleString('en-US'), { timeout: 6000 })
})

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })
  test('the power level shows its final value straight away', async ({ page }) => {
    await page.goto(`/job/${encodeURIComponent(first.id)}`)
    await expect(page.locator('.hs-num')).toHaveText(first.score.total.toLocaleString('en-US'), { timeout: 1500 })
  })
})

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  for (const path of ['/', `/job/${encodeURIComponent(first.id)}`, '/journey', '/log', '/settings']) {
    test(`no sideways scroll on ${path}`, async ({ page }) => {
      await page.goto(path)
      await page.waitForTimeout(600)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    })
  }
})

test('keyboard: Tab reaches a blip and Enter opens it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { level: 1 }).waitFor()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
    if (label.includes('out of 10,000')) break
  }
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/job\//)
})

for (const path of ['/', `/job/${encodeURIComponent(first.id)}`, '/journey', '/log', '/settings']) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForTimeout(3500)
    const r = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
}
