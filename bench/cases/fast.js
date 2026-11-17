import { FASTElement, Updates, html, observable, repeat } from '@microsoft/fast-element';

class Row {
  constructor(d) {
    this.id = d.id;
    this.label = d.label;
    this.on = false;
  }
}
observable(Row.prototype, 'label');
observable(Row.prototype, 'on');

const row = html`<div class="${(r) => (r.on ? 'row on' : 'row')}"><span class="id">${(r) => r.id}</span><span class="label">${(r) => r.label}</span></div>`;

class BenchApp extends FASTElement {
  constructor() {
    super();
    this.items = [];
  }
}
observable(BenchApp.prototype, 'items');

const defined = BenchApp.define({
  name: 'fast-bench-app',
  template: html`${repeat((x) => x.items, row)}`,
  shadowOptions: null,
});

export default async function create(root) {
  await defined;
  const app = document.createElement('fast-bench-app');
  root.appendChild(app);
  let items = [];
  return {
    init(data) {
      items = data.map((d) => new Row(d));
      app.items = items;
    },
    label(i, value) {
      items[i].label = value;
    },
    labels(values) {
      for (let i = 0; i < items.length; i++) items[i].label = values[i];
    },
    toggle(i) {
      items[i].on = !items[i].on;
    },
    toggleAll() {
      for (const r of items) r.on = !r.on;
    },
    commit() {
      Updates.process();
    },
    dispose() {
      root.removeChild(app);
    },
  };
}
