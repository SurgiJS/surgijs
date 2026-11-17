import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';

const view = (items) =>
  html`${repeat(
    items,
    (r) => r.id,
    (r) => html`<div class=${r.on ? 'row on' : 'row'}><span class="id">${r.id}</span><span class="label">${r.label}</span></div>`,
  )}`;

export default function create(root) {
  let items = [];
  const paint = () => render(view(items), root);
  return {
    init(data) {
      items = data.map((d) => ({ ...d, on: false }));
      paint();
    },
    label(i, value) {
      items[i].label = value;
      paint();
    },
    labels(values) {
      for (let i = 0; i < items.length; i++) items[i].label = values[i];
      paint();
    },
    toggle(i) {
      items[i].on = !items[i].on;
      paint();
    },
    toggleAll() {
      for (const r of items) r.on = !r.on;
      paint();
    },
    commit() {},
    dispose() {
      items = [];
      paint();
    },
  };
}
