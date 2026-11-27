import { readFileSync } from 'node:fs';

interface Entry {
  id: string;
  type: 'story' | 'docs';
  title: string;
  name: string;
  tags?: string[];
}

/** Stories from the static build's index.json, so a new story is tested without edits here. */
export const stories: Entry[] = Object.values(
  (JSON.parse(readFileSync(new URL('../storybook-static/index.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries,
).filter((e) => e.type === 'story');

export const themes = ['light', 'dark'] as const;

/** Story iframe URL. `a11y.manual` stops the addon's own axe run, which would collide with ours. */
export const storyUrl = (id: string, theme: string = 'light'): string =>
  `/iframe.html?id=${id}&viewMode=story&globals=theme:${theme};a11y.manual:!true`;
