import './hydrate.ts';

type Hydrate = (
  Component: new () => HTMLElement,
  props: Record<string, unknown>,
  slots: Record<string, string>,
  context: { client: string },
) => Promise<void>;

/**
 * Hydration is the element upgrade: loading the component module defines the custom element, and
 * the element adopts the shadow root the server sent. `client:only` has no server markup, so the
 * element is created here.
 */
export default (island: HTMLElement): Hydrate =>
  async (Component, props, slots) => {
    const rendered = Array.from(island.children).find((c) => c instanceof Component);
    if (rendered) return;

    const host = new Component() as HTMLElement & Record<string, unknown>;
    for (const k in props) {
      if (k in host) host[k] = props[k];
      else host.setAttribute(k, String(props[k]));
    }
    for (const name in slots) {
      if (name === 'default') host.insertAdjacentHTML('beforeend', slots[name]!);
      else {
        const wrapper = Object.assign(document.createElement('div'), { innerHTML: slots[name]! });
        wrapper.slot = name;
        wrapper.style.display = 'contents';
        host.append(wrapper);
      }
    }
    island.replaceChildren(host);
  };
