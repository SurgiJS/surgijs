import { flushSync, mount, unmount } from 'svelte';
import App from './App.svelte';

export default function create(root) {
  const app = mount(App, { target: root });
  return {
    init: (data) => app.init(data),
    label: (i, value) => app.label(i, value),
    labels: (values) => app.labels(values),
    toggle: (i) => app.toggle(i),
    toggleAll: () => app.toggleAll(),
    commit: () => flushSync(),
    dispose: () => unmount(app),
  };
}
