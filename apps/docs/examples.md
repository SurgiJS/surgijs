# Live examples

These elements come from `apps/playground/src` and run on this page.

## Counter

<my-counter title="Clicks" step="2"></my-counter>

```html
<my-counter title="Clicks" step="2"></my-counter>
```

## Dropdown

<ui-dropdown placeholder="Choose a language" options='[{"value":"ts","label":"TypeScript"},{"value":"go","label":"Go"},{"value":"rs","label":"Rust"}]'></ui-dropdown>

```html
<ui-dropdown
  placeholder="Choose a language"
  options='[{"value":"ts","label":"TypeScript"},{"value":"go","label":"Go"}]'
></ui-dropdown>
```

## Virtual table

100 000 rows, computed from their index. The DOM holds only the rows that fit the viewport plus four above and below. Each row element owns one slot; scrolling by one row moves one slot to the newly visible row and rewrites only its cells. Click a row or focus the table and use the arrow keys, Page Up, Page Down, Home and End.

<ui-virtual-table rows="100000" height="420"></ui-virtual-table>

```html
<ui-virtual-table rows="100000" height="420"></ui-virtual-table>
```

## Virtual tile grid

200 000 tiles in a grid whose column count follows its width. Rows of tiles are virtualized the same way, so the DOM holds about (visible rows + 8) × columns tiles.

<ui-tile-grid count="200000" height="420"></ui-tile-grid>

```html
<ui-tile-grid count="200000" height="420"></ui-tile-grid>
```

Both use `createVirtualWindow` from `apps/playground/src/virtual.ts`: a fixed pool of slots, where slot `k` shows the item in the rendered range whose index is congruent to `k` modulo the pool size.
