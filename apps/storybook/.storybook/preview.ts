import type { Decorator, Preview } from '@storybook/web-components-vite';
import '@surgijs/ui/themes.css';
import '@surgijs/ui';
import './preview.css';

/** Sets `data-theme` on the root, so tokens from themes.css switch for the whole canvas. */
const withTheme: Decorator = (story, context) => {
  document.documentElement.dataset.theme = context.globals.theme ?? 'light';
  return story();
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Theme from @surgijs/ui/themes.css',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    layout: 'centered',
    // Accessibility violations fail story tests, not just show up in the panel.
    a11y: { test: 'error' },
    controls: { expanded: true },
  },
  tags: ['autodocs'],
};

export default preview;
