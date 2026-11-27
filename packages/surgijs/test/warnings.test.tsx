import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bind, createEffect, createMemo, createRoot, createSignal, defineComponent, flush, For, untrack } from '@surgijs/core';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const messages = (): string[] => warn.mock.calls.map((c: unknown[]) => String(c[0]));

describe('dev warnings', () => {
  describe('redefined tag', () => {
    it('warns when another definition owns the tag and keeps it', () => {
      class Foreign extends HTMLElement {}
      customElements.define('warn-foreign', Foreign);
      const cls = defineComponent('warn-foreign', () => <i />);
      expect(cls).toBe(Foreign);
      expect(messages()).toHaveLength(1);
      expect(messages()[0]).toContain('<warn-foreign> is already defined by another copy');
    });

    it('stays quiet for a hot update of its own definition', () => {
      defineComponent('warn-own', () => <i>1</i>);
      defineComponent('warn-own', () => <i>2</i>);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('signal written while computing', () => {
    it('warns once per signal for a write inside createMemo', () => {
      createRoot(() => {
        const [, setN] = createSignal(0);
        const m = createMemo(() => {
          setN(2);
          return 1;
        });
        m();
        setN(5);
        createMemo(() => setN(7))();
      });
      expect(messages()).toHaveLength(1);
      expect(messages()[0]).toContain('written inside createMemo or a binding');
    });

    it('warns for a write inside a binding read', () => {
      createRoot(() => {
        const [n, setN] = createSignal(0);
        bind(
          {},
          () => (setN(1), n()),
          () => {},
        );
      });
      expect(messages()).toHaveLength(1);
    });

    it('allows writes in effects, handlers, untrack and components made inside a memo', () => {
      createRoot(() => {
        const [n, setN] = createSignal(0);
        createEffect(() => setN(n() > 0 ? 2 : 0));
        createMemo(() => untrack(() => setN(3)))();
        createMemo(() => createRoot(() => setN(4)))();
        setN(1);
        flush();
      });
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('For without by', () => {
    const run = (each: unknown[], by?: (item: any) => unknown): void => {
      createRoot(() => {
        For({ each, by, children: () => document.createElement('i') });
      });
    };

    it('warns about object items', () => {
      run([{ id: 1 }]);
      expect(messages()).toHaveLength(1);
      expect(messages()[0]).toContain('<For> keys rows by object identity');
    });

    it('warns once per For', () => {
      createRoot(() => {
        const [items, setItems] = createSignal<object[]>([{ id: 1 }]);
        For({ each: items, children: () => document.createElement('i') });
        setItems([{ id: 2 }]);
        flush();
      });
      expect(messages()).toHaveLength(1);
    });

    it('stays quiet with by, with primitive items and with no items', () => {
      run([{ id: 1 }], (item) => item.id);
      run([{ id: 1 }], (item) => item);
      run(['a', 'b']);
      run([1, 2]);
      run([]);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('prop read in the component body', () => {
    const mount = (tag: string, body: (props: { name: () => string | undefined }) => void): HTMLElement => {
      defineComponent<{ name: string }>(
        tag,
        (props) => {
          body(props);
          return <b>{props.name()}</b>;
        },
        { name: String },
      );
      const el = document.createElement(tag) as HTMLElement & { name: string };
      el.name = 'Ann';
      document.body.append(el);
      return el;
    };

    it('warns once for a read that never updates', () => {
      mount('warn-body', (props) => {
        props.name();
        props.name();
      });
      expect(messages()).toHaveLength(1);
      expect(messages()[0]).toContain('Prop "name" of <warn-body> was read in the component body');
    });

    it('stays quiet inside effects, memos and untrack', () => {
      const el = mount('warn-ok', (props) => {
        createEffect(() => props.name());
        createMemo(() => props.name())();
        untrack(() => props.name());
      });
      flush();
      expect(el.shadowRoot!.textContent).toBe('Ann');
      expect(warn).not.toHaveBeenCalled();
    });

    it('stays quiet when read after the render', () => {
      let read: (() => unknown) | undefined;
      mount('warn-later', (props) => {
        read = props.name;
      });
      read!();
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not treat a throwing body as still rendering', () => {
      defineComponent<{ name: string }>(
        'warn-throws',
        () => {
          throw new Error('boom');
        },
        { name: String },
      );
      const el = document.createElement('warn-throws') as HTMLElement & { name: string };
      expect(() => document.body.append(el)).toThrow();
      el.name;
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('effect loop', () => {
    it('warns once when an effect keeps rescheduling itself', () => {
      const [n, setN] = createSignal(0);
      createRoot(() => createEffect(() => setN(n() + 1)));
      flush();
      setN(10);
      expect(() => flush()).toThrow('Infinite update loop');
      expect(messages()).toHaveLength(1);
      expect(messages()[0]).toContain('An effect ran 100 times in one update');
    });

    it('stays quiet for a computation that settles', () => {
      const [n, setN] = createSignal(0);
      createRoot(() => createEffect(() => n() < 50 && setN(n() + 1)));
      flush();
      setN(10);
      flush();
      expect(n()).toBe(50);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('prints nothing when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    class Foreign extends HTMLElement {}
    customElements.define('warn-prod', Foreign);
    defineComponent('warn-prod', () => <i />);
    createRoot(() => {
      const [, setN] = createSignal(0);
      createMemo(() => setN(1))();
      For({ each: [{}], children: () => document.createElement('i') });
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
