import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (typeof window === 'undefined') return;
    // The examples register custom elements, so they load only in the browser.
    void import('../../../playground/src/counter.tsx');
    void import('../../../playground/src/dropdown.tsx');
  },
} satisfies Theme;
