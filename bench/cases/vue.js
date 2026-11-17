import { createApp, defineComponent, h, nextTick, reactive, shallowRef } from 'vue';

const Row = defineComponent({
  props: { row: { type: Object, required: true } },
  setup(props) {
    return () => {
      const r = props.row;
      return h('div', { class: r.on ? 'row on' : 'row' }, [h('span', { class: 'id' }, r.id), h('span', { class: 'label' }, r.label)]);
    };
  },
});

export default function create(root) {
  const items = shallowRef([]);
  const app = createApp({ render: () => items.value.map((row) => h(Row, { key: row.id, row })) });
  app.mount(root);
  return {
    init(data) {
      items.value = data.map((d) => reactive({ ...d, on: false }));
    },
    label(i, value) {
      items.value[i].label = value;
    },
    labels(values) {
      const list = items.value;
      for (let i = 0; i < list.length; i++) list[i].label = values[i];
    },
    toggle(i) {
      items.value[i].on = !items.value[i].on;
    },
    toggleAll() {
      for (const r of items.value) r.on = !r.on;
    },
    commit: () => nextTick(),
    dispose() {
      app.unmount();
    },
  };
}
