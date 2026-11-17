import { For, createRoot, createSignal, flush, insert, type Setter } from 'surgijs';

interface Data {
  id: number;
  label: string;
}

interface Handle {
  setLabel: Setter<string>;
  setOn: Setter<boolean>;
}

export default function create(root: HTMLElement) {
  const [items, setItems] = createSignal<Data[]>([]);
  const handles: Handle[] = [];
  const Row = (d: Data) => {
    const [label, setLabel] = createSignal<string>(d.label);
    const [on, setOn] = createSignal(false);
    handles[d.id - 1] = { setLabel, setOn };
    return (
      <div class={on() ? 'row on' : 'row'}>
        <span class="id">{d.id}</span>
        <span class="label">{label}</span>
      </div>
    );
  };
  const dispose = createRoot((d) => {
    insert(root, <For each={items()}>{Row}</For>);
    return d;
  });
  return {
    init(data: Data[]) {
      setItems(data);
    },
    label(i: number, value: string) {
      handles[i]!.setLabel(value);
    },
    labels(values: string[]) {
      for (let i = 0; i < handles.length; i++) handles[i]!.setLabel(values[i]!);
    },
    toggle(i: number) {
      handles[i]!.setOn((v) => !v);
    },
    toggleAll() {
      for (const h of handles) h.setOn((v) => !v);
    },
    commit: flush,
    dispose,
  };
}
