import { createApp, nextTick } from 'vue';
import App from './App.vue';

export default function create(root) {
  const app = createApp(App);
  const vm = app.mount(root);
  return {
    init: (data) => vm.init(data),
    label: (i, value) => vm.label(i, value),
    labels: (values) => vm.labels(values),
    toggle: (i) => vm.toggle(i),
    toggleAll: () => vm.toggleAll(),
    commit: () => nextTick(),
    dispose: () => app.unmount(),
  };
}
