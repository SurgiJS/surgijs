import { For, batch, createRoot, createSignal } from 'solid-js';
import { insert } from 'solid-js/web';

export default function create(root) {
  const [items, setItems] = createSignal([]);
  const handles = [];
  const Row = (d) => {
    const [label, setLabel] = createSignal(d.label);
    const [on, setOn] = createSignal(false);
    handles[d.id - 1] = { setLabel, setOn };
    return (
      <div class={on() ? 'row on' : 'row'}>
        <span class="id">{d.id}</span>
        <span class="label">{label()}</span>
      </div>
    );
  };
  const dispose = createRoot((d) => {
    insert(root, () => <For each={items()}>{Row}</For>);
    return d;
  });
  return {
    init(data) {
      setItems(data);
    },
    label(i, value) {
      handles[i].setLabel(value);
    },
    labels(values) {
      batch(() => {
        for (let i = 0; i < handles.length; i++) handles[i].setLabel(values[i]);
      });
    },
    toggle(i) {
      handles[i].setOn((v) => !v);
    },
    toggleAll() {
      batch(() => {
        for (const h of handles) h.setOn((v) => !v);
      });
    },
    commit() {},
    dispose,
  };
}
