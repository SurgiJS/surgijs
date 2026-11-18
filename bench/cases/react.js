import { createElement as h, memo, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

const Row = memo(({ row }) =>
  h('div', { className: row.on ? 'row on' : 'row' }, h('span', { className: 'id' }, row.id), h('span', { className: 'label' }, row.label)),
);

export default function create(root) {
  let set;
  let items = [];
  const App = () => {
    const [list, setList] = useState(items);
    set = setList;
    return list.map((row) => h(Row, { key: row.id, row }));
  };
  const app = createRoot(root);
  flushSync(() => app.render(h(App)));
  const update = (next) => {
    items = next;
    flushSync(() => set(next));
  };
  const patch = (i, change) => {
    const next = items.slice();
    next[i] = { ...next[i], ...change };
    update(next);
  };
  return {
    init: (data) => update(data.map((d) => ({ ...d, on: false }))),
    label: (i, label) => patch(i, { label }),
    labels: (values) => update(items.map((r, i) => ({ ...r, label: values[i] }))),
    toggle: (i) => patch(i, { on: !items[i].on }),
    toggleAll: () => update(items.map((r) => ({ ...r, on: !r.on }))),
    commit() {},
    dispose: () => app.unmount(),
  };
}
