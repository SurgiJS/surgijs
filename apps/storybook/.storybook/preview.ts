import { setCustomElementsManifest, type Decorator, type Preview } from '@storybook/web-components-vite';
import manifest from '@surgijs/ui/custom-elements.json';
import '@surgijs/ui/themes.css';
import '@surgijs/ui';
import './preview.css';

// Autodocs and Controls read attributes, types, defaults, slots, CSS parts and custom properties from the manifest.
setCustomElementsManifest(manifest);

/** Slots, CSS parts and custom properties appear in the docs table without a control: they are not args. */
const documentationOnly = Object.fromEntries(
  manifest.modules
    .flatMap((m) => m.declarations)
    .flatMap((d) => [...d.slots, ...d.cssParts, ...d.cssProperties])
    .filter((item) => item.name)
    .map((item) => [item.name, { control: false as const }]),
);

/** Sets `data-theme` on the root, so tokens from themes.css switch for the whole canvas. */
const withTheme: Decorator = (story, context) => {
  document.documentElement.dataset.theme = context.globals.theme ?? 'light';
  return story();
};

const preview: Preview = {
  decorators: [withTheme],
  argTypes: documentationOnly,
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
