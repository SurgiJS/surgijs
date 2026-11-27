import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// The built package, exactly as consumers import it on the server (`pnpm build` first).
// Loaded at run time so typecheck does not need the build; the type comes from the source.
const SERVER = '../../../packages/ui/dist/server.js';
const { renderButton } = (await import(SERVER)) as typeof import('../../../packages/ui/src/server');

const ORIGIN = 'http://ssr.test';
const DIST: Record<string, URL> = {
  core: new URL('../../../packages/surgijs/dist/', import.meta.url),
  ui: new URL('../../../packages/ui/dist/', import.meta.url),
};

const page = (body: string): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SSR</title>
  <link rel="stylesheet" href="/ui/themes.css">
  <script type="importmap">${JSON.stringify({
    imports: { '@surgijs/core': '/core/index.js', '@surgijs/core/hydrate': '/core/hydrate.js', '@surgijs/ui/button': '/ui/button.js' },
  })}</script>
  <style>body { margin: 24px; font-family: var(--s-font-family); } form { display: flex; gap: 12px; }</style>
</head>
<body>
  <form>${body}</form>
  <script type="module">
    window.hydrate = async () => {
      const { enableHydration } = await import('@surgijs/core/hydrate');
      enableHydration();
      await import('@surgijs/ui/button');
    };
  </script>
</body>
</html>`;

async function serve(p: Page, html: string): Promise<void> {
  await p.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    const [, dir, ...rest] = pathname.split('/');
    const base = DIST[dir!];
    if (!base) return route.fulfill({ status: 404 });
    const type = pathname.endsWith('.css') ? 'text/css' : 'text/javascript';
    return route.fulfill({ contentType: type, body: await readFile(new URL(rest.join('/'), base)) });
  });
  await p.goto(`${ORIGIN}/`);
}

const BODY = [
  renderButton({ type: 'submit' }, 'Send'),
  renderButton({ variant: 'secondary', loading: true }, 'Saving'),
  renderButton({ variant: 'danger', disabled: true }, 'Delete'),
].join('');

test('server HTML renders before any script and hydrates in place', async ({ page: p }) => {
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await serve(p, page(BODY));

  // Declarative shadow DOM: styled shadow roots exist with no JavaScript run yet.
  expect(await p.evaluate(() => customElements.get('s-button'))).toBeUndefined();
  await expect(p.getByRole('button', { name: 'Send' })).toBeVisible();
  const before = await p.screenshot({ animations: 'disabled' });
  await p.locator('s-button').evaluateAll((hosts) => {
    for (const h of hosts) (h.shadowRoot!.querySelector('button') as HTMLButtonElement & { server?: true }).server = true;
  });

  await p.evaluate(() => (window as unknown as { hydrate(): Promise<void> }).hydrate());
  expect(await p.evaluate(() => !!customElements.get('s-button'))).toBe(true);

  // Hydration adopts the server nodes instead of re-rendering, and the pixels do not move.
  const adopted = await p.locator('s-button').evaluateAll((hosts) =>
    hosts.map((h) => h.shadowRoot!.querySelectorAll('button').length === 1 && !!(h.shadowRoot!.querySelector('button') as { server?: true }).server),
  );
  expect(adopted).toEqual([true, true, true]);
  expect(await p.screenshot({ animations: 'disabled' })).toEqual(before);

  // And it is interactive: submit works, focus delegates, state updates the same nodes.
  const submitted = p.evaluate(() => new Promise<boolean>((r) => document.querySelector('form')!.addEventListener('submit', (e) => (e.preventDefault(), r(true)))));
  await p.getByRole('button', { name: 'Send' }).click();
  expect(await submitted).toBe(true);
  const state = await p.locator('s-button').nth(1).evaluate((host) => {
    (host as HTMLElement).focus();
    (host as HTMLElement & { loading: boolean }).loading = false;
    const button = host.shadowRoot!.querySelector('button')!;
    return new Promise<[string | undefined, string | null]>((r) =>
      queueMicrotask(() => r([host.shadowRoot!.activeElement?.localName, button.getAttribute('aria-busy')])),
    );
  });
  expect(state).toEqual(['button', null]);
  expect(errors).toEqual([]);
});
