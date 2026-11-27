import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { stories, storyUrl, themes } from './stories';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

for (const theme of themes) {
  for (const story of stories) {
    test(`axe: ${story.id} · ${theme}`, async ({ page }) => {
      await page.goto(storyUrl(story.id, theme));
      await page.locator('#storybook-root s-button').first().waitFor();
      const { violations } = await new AxeBuilder({ page }).include('#storybook-root').withTags(TAGS).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
