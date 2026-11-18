import { render } from 'inferno';
import { createElement as h } from 'inferno-create-element';

const Row = ({ row }) =>
  h('div', { className: row.on ? 'row on' : 'row' }, h('span', { className: 'id' }, row.id), h('span', { className: 'label' }, row.label));
Row.defaultHooks = { onComponentShouldUpdate: (prev, next) => prev.row !== next.row };

const App = ({ items }) => h('div', null, items.map((row) => h(Row, { key: row.id, row })));

export default function create(root) {
  let items = [];
  const paint = () => render(h(App, { items }), root);
  const update = (i, patch) => {
    items[i] = { ...items[i], ...patch };
  };
  return {
    init(data) {
      items = data.map((d) => ({ ...d, on: false }));
      paint();
    },
    label(i, label) {
      items = items.slice();
      update(i, { label });
      paint();
    },
    labels(values) {
      items = items.map((r, i) => ({ ...r, label: values[i] }));
      paint();
    },
    toggle(i) {
      items = items.slice();
      update(i, { on: !items[i].on });
      paint();
    },
    toggleAll() {
      items = items.map((r) => ({ ...r, on: !r.on }));
      paint();
    },
    commit() {},
    dispose() {
      render(null, root);
    },
  };
}
