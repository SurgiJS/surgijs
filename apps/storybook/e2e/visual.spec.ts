import { expect, test, type Page } from '@playwright/test';
import { stories, storyUrl, themes } from './stories';

test.skip(!process.env.PLAYWRIGHT_DOCKER, 'Baselines come from the Playwright image: run `pnpm test:e2e`.');
test.use({ viewport: { width: 640, height: 200 } });

async function open(page: Page, id: string, theme: string, dir = 'ltr'): Promise<void> {
  await page.goto(storyUrl(id, theme, dir));
  await page.locator('#storybook-root s-button').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** Stories where direction changes the layout: icon placement, spinner, spacing between buttons. */
const rtlStories = ['components-button--variants', 'components-button--with-icon', 'components-button--loading', 'components-button--icon-only'];

test.describe('dir="rtl"', () => {
  for (const id of rtlStories) {
    test(`${id} · rtl`, async ({ page }) => {
      await open(page, id, 'light', 'rtl');
      await expect(page).toHaveScreenshot(`${id}--rtl.png`);
    });
  }
});

for (const theme of themes) {
  for (const story of stories) {
    test(`${story.id} · ${theme}`, async ({ page }) => {
      await open(page, story.id, theme);
      await expect(page).toHaveScreenshot(`${story.id}--${theme}.png`);
    });
  }

  test(`states · ${theme}`, async ({ page }) => {
    await open(page, 'components-button--variants', theme);
    const buttons = page.locator('s-button');
    await buttons.nth(0).hover();
    await expect(page).toHaveScreenshot(`state-hover--${theme}.png`);
    await page.mouse.move(0, 0);
    await page.locator('s-button').first().focus();
    // Programmatic focus after keyboard input shows the focus-visible ring in Chromium.
    await page.keyboard.press('Shift');
    await expect(page).toHaveScreenshot(`state-focus-visible--${theme}.png`);
  });
}
