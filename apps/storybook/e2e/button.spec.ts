import { expect, test, type Page } from '@playwright/test';
import { storyUrl } from './stories';

/**
 * The focused host: with delegatesFocus the inner button holds focus and the host is
 * `document.activeElement`. Asserting on the host also works in Firefox, where
 * `toBeFocused` on a node inside a shadow root reports it as inactive.
 */
const host = (page: Page, text: string) => page.locator('s-button', { hasText: text });

/**
 * Focuses an invisible sentinel placed before the story, so the next Tab reaches the first
 * control. Browsers disagree on where Tab starts after a click or on a fresh page.
 */
const focusPage = async (page: Page) => {
  await page.locator('#storybook-root s-button').first().waitFor();
  await page.evaluate(() => {
    const start = document.createElement('div');
    start.tabIndex = 0;
    start.setAttribute('aria-label', 'start');
    start.style.cssText = 'position: fixed; width: 1px; height: 1px; overflow: hidden';
    document.body.prepend(start);
    start.focus();
  });
};

test('exposes a named button to assistive technology', async ({ page }) => {
  await page.goto(storyUrl('components-button--primary'));
  await expect(page.getByRole('button', { name: 'Button' })).toBeVisible();
  await page.goto(storyUrl('components-button--icon-only'));
  await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();
  await page.goto(storyUrl('components-button--loading'));
  const busy = page.getByRole('button', { name: 'Saving' });
  await expect(busy).toHaveAttribute('aria-busy', 'true');
  await expect(busy).toHaveAttribute('aria-disabled', 'true');
});

test('submits with Enter and resets with Space through the keyboard', async ({ page }) => {
  await page.goto(storyUrl('components-button--in-form'));
  const form = page.locator('form');
  await focusPage(page);
  await page.keyboard.press('Tab');
  await expect(host(page, 'Submit')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(form).toHaveAttribute('data-submitted', 'true');

  await form.evaluate((f) => {
    delete (f as HTMLFormElement).dataset.submitted;
    f.addEventListener('reset', () => ((f as HTMLFormElement).dataset.reset = 'true'));
  });
  await page.keyboard.press('Tab');
  await expect(host(page, 'Reset')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(form).toHaveAttribute('data-reset', 'true');
  await expect(form).not.toHaveAttribute('data-submitted');
});

test('skips disabled buttons in the tab order and keeps loading ones', async ({ page }) => {
  await page.goto(storyUrl('components-button--disabled'));
  await focusPage(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('s-button:focus')).toHaveCount(0);

  await page.goto(storyUrl('components-button--loading'));
  await focusPage(page);
  await page.keyboard.press('Tab');
  await expect(host(page, 'Saving')).toBeFocused();
});

test('host.focus() delegates to the inner button', async ({ page }) => {
  await page.goto(storyUrl('components-button--primary'));
  const focused = await page.locator('s-button').evaluate((host) => {
    (host as HTMLElement).focus();
    return host.shadowRoot!.activeElement?.localName;
  });
  expect(focused).toBe('button');
});

test('blocks clicks while disabled or loading', async ({ page }) => {
  await page.goto(storyUrl('components-button--loading'));
  const clicks = await page.locator('s-button').evaluate((host) => {
    let n = 0;
    host.addEventListener('click', () => n++);
    host.shadowRoot!.querySelector('button')!.click();
    (host as HTMLElement & { loading: boolean }).loading = false;
    return new Promise<number>((r) => queueMicrotask(() => {
      host.shadowRoot!.querySelector('button')!.click();
      r(n);
    }));
  });
  expect(clicks).toBe(1);
});

test('mirrors start and end slots and keeps padding symmetric under dir="rtl"', async ({ page }) => {
  const box = async (dir: string) => {
    await page.goto(storyUrl('components-button--with-icon', 'light', dir));
    const button = page.locator('s-button');
    await button.waitFor();
    return button.evaluate((el) => {
      const rect = (n: Element) => n.getBoundingClientRect();
      const base = el.shadowRoot!.querySelector('.base')!;
      const style = getComputedStyle(base);
      return {
        dir: getComputedStyle(el).direction,
        iconBeforeText: rect(el.querySelector('svg')!).left < rect(base).left + rect(base).width / 2,
        start: style.paddingInlineStart,
        end: style.paddingInlineEnd,
      };
    });
  };
  const ltr = await box('ltr');
  expect(ltr).toMatchObject({ dir: 'ltr', iconBeforeText: true });
  const rtl = await box('rtl');
  expect(rtl).toMatchObject({ dir: 'rtl', iconBeforeText: false });
  expect(rtl.start).toBe(rtl.end);
});
