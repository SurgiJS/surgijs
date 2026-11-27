import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import '@surgijs/ui/themes.css';
import './custom.css';

/** Mirrors VitePress dark mode (`html.dark`) into `data-theme`, which @surgijs/ui themes read. */
function syncTheme(): void {
  const root = document.documentElement;
  const apply = () => (root.dataset.theme = root.classList.contains('dark') ? 'dark' : 'light');
  apply();
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['class'] });
}

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (typeof window === 'undefined') return;
    syncTheme();
    // The examples register custom elements, so they load only in the browser.
    void import('@surgijs/ui');
    void import('../../../playground/src/counter.tsx');
    void import('../../../playground/src/dropdown.tsx');
    void import('../../../playground/src/virtual-table.tsx');
    void import('../../../playground/src/virtual-tiles.tsx');
  },
} satisfies Theme;
