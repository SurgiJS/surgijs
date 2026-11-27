import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defineComponent, flush, onCleanup, useEffect, useRef, useState, type FormHost, type ReactiveProps } from '@surgijs/core';
import { MyCounter } from '../../../apps/playground/src/counter.tsx';

interface FakeInternals {
  value: unknown;
  flags?: ValidityStateFlags;
  message?: string;
  setFormValue(v: unknown): void;
  setValidity(flags?: ValidityStateFlags, message?: string): void;
}

beforeAll(() => {
  const proto = HTMLElement.prototype as unknown as { attachInternals?: () => FakeInternals };
  if (!proto.attachInternals)
    proto.attachInternals = function () {
      return {
        value: null,
        setFormValue(v) {
          this.value = v;
        },
        setValidity(flags, message) {
          this.flags = flags;
          this.message = message;
        },
      };
    };
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('defineComponent', () => {
  it('renders into an open shadow root and updates in place', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const el = document.createElement('my-counter');
    el.setAttribute('step', '2');
    document.body.appendChild(el);
    const root = el.shadowRoot!;
    expect(root.innerHTML).toBe('<div class="card"><h3>Counter</h3><p>Value: 0</p><button>Add</button></div>');
    const card = root.firstChild;
    const button = root.querySelector('button')!;
    button.click();
    flush();
    expect(root.querySelector('p')!.textContent).toBe('Value: 2');
    expect(root.firstChild).toBe(card);
    el.setAttribute('title', 'Clicks');
    flush();
    expect(root.querySelector('h3')!.textContent).toBe('Clicks');
    expect(log).toHaveBeenCalledWith('Title updated: undefined');
    expect(log).toHaveBeenCalledWith('Title updated: Clicks');
    log.mockRestore();
  });

  it('observes kebab-case attributes and returns the defined class', () => {
    expect(MyCounter.observedAttributes).toEqual(['step', 'title']);
    const Again = defineComponent('my-counter', () => null);
    expect(Again).toBe(customElements.get('my-counter'));
    const Wide = defineComponent<{ maxItems?: number }>('x-wide', () => null, { maxItems: Number });
    expect(Wide.observedAttributes).toEqual(['max-items']);
  });

  it('coerces attributes by schema', () => {
    interface P {
      flag?: boolean;
      count?: number;
      data?: { a: number };
      list?: number[];
    }
    let seen: ReactiveProps<P> | undefined;
    defineComponent<P>(
      'x-coerce',
      (props) => {
        seen = props;
        return null;
      },
      { flag: Boolean, count: Number, data: Object, list: Array },
    );
    const el = document.createElement('x-coerce');
    el.setAttribute('flag', '');
    el.setAttribute('count', '42');
    el.setAttribute('data', '{"a":1}');
    el.setAttribute('list', '[1,2]');
    document.body.appendChild(el);
    expect(seen!.flag()).toBe(true);
    expect(seen!.count()).toBe(42);
    expect(seen!.data()).toEqual({ a: 1 });
    expect(seen!.list()).toEqual([1, 2]);
    el.setAttribute('flag', 'false');
    el.setAttribute('data', '{oops');
    expect(seen!.flag()).toBe(false);
    expect(seen!.data()).toBeUndefined();
    el.removeAttribute('flag');
    expect(seen!.flag()).toBe(false);
  });

  it('reflects primitive properties to attributes', () => {
    const el = document.createElement('my-counter') as HTMLElement & { step?: number };
    document.body.appendChild(el);
    el.step = 5;
    expect(el.getAttribute('step')).toBe('5');
    expect(el.step).toBe(5);
    el.step = undefined;
    expect(el.hasAttribute('step')).toBe(false);
  });

  it('keeps properties assigned before upgrade', () => {
    const el = document.createElement('x-late') as HTMLElement & { label?: string };
    el.label = 'early';
    document.body.appendChild(el);
    defineComponent<{ label?: string }>('x-late', (props) => <span>{props.label}</span>, { label: String });
    expect(el.shadowRoot!.innerHTML).toBe('<span>early</span>');
    expect(el.getAttribute('label')).toBe('early');
  });

  it('renders light DOM and passes existing children', () => {
    defineComponent('x-light', (props: ReactiveProps<{}>) => <section>{props.children}</section>, {}, { shadow: false });
    const el = document.createElement('x-light');
    el.innerHTML = '<b>kept</b>';
    document.body.appendChild(el);
    expect(el.shadowRoot).toBeNull();
    expect(el.innerHTML).toBe('<section><b>kept</b></section>');
  });

  it('disposes after disconnect and renders again on reconnect', async () => {
    const log: string[] = [];
    defineComponent('x-life', () => {
      const [n] = useState(1);
      log.push('render');
      onCleanup(() => log.push('dispose'));
      return <i>{n}</i>;
    });
    const el = document.createElement('x-life');
    document.body.appendChild(el);
    el.remove();
    await Promise.resolve();
    expect(el.shadowRoot!.childNodes.length).toBe(0);
    document.body.appendChild(el);
    expect(el.shadowRoot!.innerHTML).toBe('<i>1</i>');
    expect(log).toEqual(['render', 'dispose', 'render']);
  });

  it('keeps state and skips re-rendering when moved', async () => {
    let renders = 0;
    defineComponent('x-move', () => {
      renders++;
      const [n, setN] = useState(0);
      return <button onClick={() => setN((v) => v + 1)}>{n}</button>;
    });
    const a = document.createElement('x-move');
    const b = document.createElement('x-move');
    document.body.append(a, b);
    (a.shadowRoot!.querySelector('button') as HTMLButtonElement).click();
    flush();
    document.body.appendChild(a);
    await Promise.resolve();
    expect(a.shadowRoot!.textContent).toBe('1');
    expect(renders).toBe(2);
  });

  it('handles clicks inside a closed shadow root exactly once', () => {
    let clicks = 0;
    let button: HTMLButtonElement | null = null;
    defineComponent(
      'x-closed',
      () => (
        <button ref={(b: HTMLButtonElement) => (button = b)} onClick={() => clicks++}>
          x
        </button>
      ),
      {},
      { shadow: { mode: 'closed' } },
    );
    const el = document.createElement('x-closed');
    document.body.appendChild(el);
    expect(el.shadowRoot).toBeNull();
    button!.click();
    expect(clicks).toBe(1);
  });

  it('associates with forms', () => {
    let host!: FormHost;
    defineComponent<{ value?: string }>(
      'x-field',
      (props, h) => {
        host = h as FormHost;
        return <input value={props.value() ?? ''} disabled={host.formDisabled()} />;
      },
      { value: String },
      { form: true },
    );
    const el = document.createElement('x-field') as FormHost & { value?: string };
    el.setAttribute('value', 'a');
    document.body.appendChild(el);
    const internals = (el as unknown as { __i: FakeInternals }).__i;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.value).toBe('a');
    el.value = 'b';
    expect(internals.value).toBe('b');
    el.setFormValidity({ valueMissing: true }, 'Required');
    expect(internals.flags).toEqual({ valueMissing: true });
    expect(internals.message).toBe('Required');
    (el as unknown as { formDisabledCallback(d: boolean): void }).formDisabledCallback(true);
    flush();
    expect(input.disabled).toBe(true);
    expect(host.formDisabled()).toBe(true);
    (el as unknown as { formResetCallback(): void }).formResetCallback();
    flush();
    expect(el.value).toBe('a');
    expect(internals.value).toBe('a');
    expect(input.value).toBe('a');
  });

  it('runs effects after the shadow root holds the nodes', () => {
    let inRoot = false;
    defineComponent('x-effect', (_props, host) => {
      const ref = useRef<HTMLParagraphElement>();
      useEffect(() => {
        inRoot = ref.current?.parentNode === host.shadowRoot;
      });
      return <p ref={ref}>hi</p>;
    });
    document.body.appendChild(document.createElement('x-effect'));
    expect(inRoot).toBe(true);
  });
});

describe('styles option', () => {
  const View = () => <b>x</b>;
  const css = 'b > i { color: red }';

  it('shares one adopted sheet between instances', () => {
    defineComponent('sty-shared', View, {}, { styles: css });
    document.body.innerHTML = '<sty-shared></sty-shared><sty-shared></sty-shared>';
    flush();
    const [a, b] = Array.from(document.querySelectorAll('sty-shared')).map((e) => e.shadowRoot!);
    expect(a!.adoptedStyleSheets).toHaveLength(1);
    expect(a!.adoptedStyleSheets[0]).toBe(b!.adoptedStyleSheets[0]);
    expect(a!.querySelector('style')).toBeNull();
  });

  it('drops the server style and keeps the adopted sheet on reconnect', () => {
    defineComponent('sty-server', View, {}, { styles: css });
    const el = document.createElement('sty-server');
    el.attachShadow({ mode: 'open' }).innerHTML = `<style data-s>${css}</style><b>x</b>`;
    document.body.append(el);
    flush();
    const root = el.shadowRoot!;
    expect(root.querySelector('style')).toBeNull();
    expect(root.adoptedStyleSheets).toHaveLength(1);
    el.remove();
    document.body.append(el);
    flush();
    expect(root.adoptedStyleSheets).toHaveLength(1);
  });

  it('keeps @import CSS in a style element that survives re-renders', () => {
    const [show, setShow] = useState(true);
    const imp = '@import url("/t.css");';
    defineComponent('sty-import', () => (() => (show() ? 'a' : null)) as never, {}, { styles: imp });
    document.body.innerHTML = '<sty-import></sty-import>';
    flush();
    const root = document.querySelector('sty-import')!.shadowRoot!;
    expect(root.adoptedStyleSheets).toHaveLength(0);
    expect(root.querySelector('style')!.textContent).toBe(imp);
    setShow(false);
    flush();
    expect(root.querySelector('style')!.textContent).toBe(imp);
    setShow(true);
    flush();
    expect(root.textContent).toContain('a');
  });

  it('falls back to a style element without constructable stylesheets', () => {
    vi.stubGlobal('CSSStyleSheet', class {});
    try {
      defineComponent('sty-fallback', View, {}, { styles: css });
    } finally {
      vi.unstubAllGlobals();
    }
    document.body.innerHTML = '<sty-fallback></sty-fallback>';
    flush();
    expect(document.querySelector('sty-fallback')!.shadowRoot!.querySelector('style')!.textContent).toBe(css);
  });
});
