import { afterEach, describe, expect, it } from 'vitest';
import {
  createContext,
  createRenderEffect,
  createResource,
  createRoot,
  createSignal,
  ErrorBoundary,
  flush,
  For,
  Match,
  onCleanup,
  Portal,
  Show,
  Switch,
  useContext,
  useRef,
  useState,
  type JSX,
  type ReactiveProps,
} from '@surgijs/core';

const tick = () => new Promise((r) => setTimeout(r));

let disposers: (() => void)[] = [];

function mount(view: () => JSX.Element): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  createRoot((dispose) => {
    disposers.push(() => {
      dispose();
      host.parentNode?.removeChild(host);
    });
    const v = view();
    if (typeof v === 'function') {
      const out = v();
      if (out instanceof Node) host.appendChild(out);
    } else if (v instanceof Node) host.appendChild(v);
  });
  return host;
}

afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
});

describe('templates', () => {
  it('clones static markup', () => {
    const make = () => (<div class="a"><span>hi</span></div>) as HTMLElement;
    const a = make();
    const b = make();
    expect(a.outerHTML).toBe('<div class="a"><span>hi</span></div>');
    expect(a).not.toBe(b);
  });

  it('updates text without recreating nodes', () => {
    const [count, setCount] = useState(0);
    const host = mount(() => (
      <p>
        Value: {count} <b>{count}</b>
      </p>
    ));
    const p = host.firstChild as HTMLElement;
    const b = p.querySelector('b')!;
    const text = b.firstChild;
    expect(p.textContent).toBe('Value: 0 0');
    setCount(5);
    flush();
    expect(p.textContent).toBe('Value: 5 5');
    expect(b.firstChild).toBe(text);
    expect(host.firstChild).toBe(p);
  });

  it('binds attributes, classes, styles and properties', () => {
    const [on, setOn] = useState(false);
    const [w, setW] = useState(10);
    const host = mount(() => (
      <input class={on() ? 'on' : 'off'} title={`w${w()}`} style={{ color: 'red', width: `${w()}px` }} value={String(w())} disabled={on()} />
    ));
    const input = host.firstChild as HTMLInputElement;
    expect(input.className).toBe('off');
    expect(input.title).toBe('w10');
    expect(input.style.color).toBe('red');
    expect(input.style.width).toBe('10px');
    expect(input.value).toBe('10');
    expect(input.hasAttribute('disabled')).toBe(false);
    setOn(true);
    setW(20);
    flush();
    expect(input.className).toBe('on');
    expect(input.title).toBe('w20');
    expect(input.style.width).toBe('20px');
    expect(input.value).toBe('20');
    expect(input.getAttribute('disabled')).toBe('');
  });

  it('updates attributes read through helpers and props with conditional reads', () => {
    const [cond, setCond] = useState(true);
    const [a] = useState('a');
    const [b, setB] = useState('b1');
    const cls = () => (cond() ? a() : b());
    const Child = (props: ReactiveProps<{ label: string }>) => <i title={props.label} />;
    const host = mount(() => (
      <p class={cls()}>
        <Child label={cond() ? a() : b()} />
      </p>
    ));
    const p = host.firstChild as HTMLElement;
    setCond(false);
    flush();
    setB('b2');
    flush();
    expect(p.className).toBe('b2');
    expect(p.querySelector('i')!.title).toBe('b2');
  });

  it('clears style keys that the next style object leaves out', () => {
    const [s, setS] = useState<Record<string, string>>({ color: 'red', fontWeight: 'bold', '--gap': '2px' });
    const host = mount(() => <div style={s()} />);
    const div = host.firstChild as HTMLElement;
    setS({ color: 'blue' });
    flush();
    expect(div.style.color).toBe('blue');
    expect(div.style.fontWeight).toBe('');
    expect(div.style.getPropertyValue('--gap')).toBe('');
  });

  it('sets namespaced SVG attributes', () => {
    const [href, setHref] = useState('#a');
    const host = mount(() => (
      <svg>
        <use xlink:href={href} />
      </svg>
    ));
    const use = host.querySelector('use')!;
    expect(use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#a');
    setHref('#b');
    flush();
    expect(use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#b');
  });

  it('writes label for', () => {
    const host = mount(() => <label htmlFor="name">Name</label>);
    expect((host.firstChild as HTMLLabelElement).getAttribute('for')).toBe('name');
  });
});

describe('events and refs', () => {
  it('delegates clicks with currentTarget', () => {
    const seen: EventTarget[] = [];
    const host = mount(() => (
      <button onClick={(e: Event) => seen.push(e.currentTarget!)}>
        <span>go</span>
      </button>
    ));
    const button = host.firstChild as HTMLButtonElement;
    (button.firstChild as HTMLElement).click();
    expect(seen).toEqual([button]);
  });

  it('stops at cancelBubble', () => {
    const log: string[] = [];
    const host = mount(() => (
      <div onClick={() => log.push('outer')}>
        <button onClick={(e: Event) => (log.push('inner'), e.stopPropagation())}>x</button>
      </div>
    ));
    host.querySelector('button')!.click();
    expect(log).toEqual(['inner']);
  });

  it('attaches non-delegated and on: listeners', () => {
    const log: string[] = [];
    const host = mount(() => <div onScroll={() => log.push('scroll')} on:Custom={() => log.push('custom')} />);
    const div = host.firstChild!;
    div.dispatchEvent(new Event('scroll'));
    div.dispatchEvent(new Event('Custom'));
    expect(log).toEqual(['scroll', 'custom']);
  });

  it('fills refs', () => {
    const ref = useRef<HTMLDivElement>();
    let fn: HTMLElement | null = null;
    mount(() => (
      <div ref={ref}>
        <span ref={(el: HTMLElement) => (fn = el)} />
      </div>
    ));
    expect(ref.current?.tagName).toBe('DIV');
    expect(fn!.tagName).toBe('SPAN');
  });
});

describe('Show / Switch', () => {
  it('mounts one branch and disposes the other', () => {
    const [ok, setOk] = useState<number | null>(null);
    const log: string[] = [];
    const Yes = () => {
      onCleanup(() => log.push('yes gone'));
      return <b>yes</b>;
    };
    const host = mount(() => (
      <div>
        <Show when={ok()} fallback={<i>no</i>}>
          <Yes />
        </Show>
      </div>
    ));
    const div = host.firstChild as HTMLElement;
    expect(div.innerHTML).toBe('<i>no</i>');
    setOk(0);
    flush();
    expect(div.innerHTML).toBe('<b>yes</b>');
    setOk(1);
    flush();
    expect(log).toEqual([]);
    setOk(null);
    flush();
    expect(div.innerHTML).toBe('<i>no</i>');
    expect(log).toEqual(['yes gone']);
  });

  it('passes the value to function children', () => {
    const [user, setUser] = useState<{ name: string } | null>({ name: 'Ann' });
    const host = mount(() => <div><Show when={user()}>{(u: { name: string }) => <b>{u.name}</b>}</Show></div>);
    expect(host.textContent).toBe('Ann');
    setUser(null);
    flush();
    expect(host.textContent).toBe('');
  });

  it('renders function children again when the truthy value changes', () => {
    const [user, setUser] = useState<{ name: string } | null>({ name: 'Ann' });
    const [page, setPage] = useState<{ title: string } | null>({ title: 'Home' });
    const host = mount(() => (
      <div>
        <Show when={user()}>{(u: { name: string }) => <b>{u.name}</b>}</Show>
        <Switch>
          <Match when={page()}>{(p: { title: string }) => <i>{p.title}</i>}</Match>
        </Switch>
      </div>
    ));
    expect(host.textContent).toBe('AnnHome');
    setUser({ name: 'Bob' });
    setPage({ title: 'About' });
    flush();
    expect(host.textContent).toBe('BobAbout');
  });

  it('keeps static children mounted while the value stays truthy', () => {
    const [n, setN] = useState(1);
    let renders = 0;
    const Child = () => (renders++, <b>child</b>);
    mount(() => (
      <div>
        <Show when={n()}>
          <Child />
        </Show>
      </div>
    ));
    setN(2);
    flush();
    expect(renders).toBe(1);
  });

  it('switches between matches', () => {
    const [n, setN] = useState(1);
    const host = mount(() => (
      <div>
        <Switch fallback={<i>none</i>}>
          <Match when={n() === 1}>
            <b>one</b>
          </Match>
          <Match when={n() === 2}>
            <b>two</b>
          </Match>
        </Switch>
      </div>
    ));
    expect(host.textContent).toBe('one');
    setN(2);
    flush();
    expect(host.textContent).toBe('two');
    setN(3);
    flush();
    expect(host.textContent).toBe('none');
  });
});

describe('For', () => {
  it('reuses rows across reorders and disposes removed rows', () => {
    const a = { id: 1, label: 'a' };
    const b = { id: 2, label: 'b' };
    const c = { id: 3, label: 'c' };
    const [list, setList] = useState([a, b, c]);
    const disposed: string[] = [];
    const host = mount(() => (
      <ul>
        <For each={list()}>
          {(item: typeof a, index: () => number) => {
            onCleanup(() => disposed.push(item.label));
            return (
              <li>
                {item.label}
                {index}
              </li>
            );
          }}
        </For>
      </ul>
    ));
    const ul = host.firstChild as HTMLElement;
    const [la, lb, lc] = Array.from(ul.children);
    expect(ul.textContent).toBe('a0b1c2');
    setList([c, a, b]);
    flush();
    expect(Array.from(ul.children)).toEqual([lc, la, lb]);
    expect(ul.textContent).toBe('c0a1b2');
    setList([b]);
    flush();
    expect(Array.from(ul.children)).toEqual([lb]);
    expect(disposed.sort()).toEqual(['a', 'c']);
  });

  it('disposes every row after a row render throws', async () => {
    const [items, setItems] = createSignal([1, 2, 3]);
    const [n, setN] = createSignal(0);
    let runs = 0;
    const host = mount(() => (
      <div>
        <ErrorBoundary fallback={<b>err</b>}>
          <For each={items()}>
            {(i: number) => {
              if (i === 99) throw new Error('bad row');
              createRenderEffect(() => (n(), runs++));
              return <span>{i}</span>;
            }}
          </For>
        </ErrorBoundary>
      </div>
    ));
    setItems([1, 2, 3, 99]);
    flush();
    await tick();
    expect(host.textContent).toBe('err');
    const before = runs;
    setN(1);
    flush();
    expect(runs).toBe(before);
  });

  it('keys rows with by', () => {
    interface Row {
      id: number;
      label: string;
    }
    const [list, setList] = useState<Row[]>([{ id: 1, label: 'a' }]);
    const host = mount(() => <ul><For each={list()} by={(row) => row.id}>{(row) => <li>{row.label}</li>}</For></ul>);
    const li = host.querySelector('li');
    setList([{ id: 1, label: 'changed' }]);
    flush();
    expect(host.querySelector('li')).toBe(li);
  });

  it('renders static siblings around a list', () => {
    const [list, setList] = useState(['x']);
    const host = mount(() => (
      <ul>
        <li>first</li>
        <For each={list()}>{(s: string) => <li>{s}</li>}</For>
        <li>last</li>
      </ul>
    ));
    setList(['x', 'y']);
    flush();
    expect(host.textContent).toBe('firstxylast');
    setList([]);
    flush();
    expect(host.textContent).toBe('firstlast');
  });
});

describe('Portal', () => {
  it('moves children to document.body and removes them on dispose', () => {
    const dispose = createRoot((d) => {
      const host = document.createElement('div');
      host.appendChild(
        (
          <div>
            <Portal>
              <p id="portal-child">hi</p>
            </Portal>
          </div>
        ) as Node,
      );
      return d;
    });
    expect(document.getElementById('portal-child')?.parentNode).toBe(document.body);
    dispose();
    expect(document.getElementById('portal-child')).toBeNull();
  });
});

describe('ErrorBoundary', () => {
  it('renders fallback and resets', async () => {
    const [boom, setBoom] = useState(false);
    let reset!: () => void;
    const Bomb = () => (
      <Show when={boom()} fallback={<i>fine</i>}>
        {() => {
          throw new Error('kaboom');
        }}
      </Show>
    );
    const host = mount(() => (
      <div>
        <ErrorBoundary
          fallback={(err: unknown, r: () => void) => {
            reset = r;
            return <b>{(err as Error).message}</b>;
          }}
        >
          <Bomb />
        </ErrorBoundary>
      </div>
    ));
    expect(host.textContent).toBe('fine');
    setBoom(true);
    await tick();
    await tick();
    expect(host.textContent).toBe('kaboom');
    setBoom(false);
    reset();
    await tick();
    expect(host.textContent).toBe('fine');
  });

  it('catches errors thrown by attribute and text bindings on update', async () => {
    const [user, setUser] = createSignal<{ name: string } | null>({ name: 'ann' });
    const host = mount(() => (
      <div>
        <ErrorBoundary fallback={<b>caught</b>}>
          <p title={user()!.name}>{`${user()!.name}`}</p>
        </ErrorBoundary>
      </div>
    ));
    expect(host.textContent).toBe('ann');
    setUser(null);
    expect(() => flush()).not.toThrow();
    await tick();
    expect(host.textContent).toBe('caught');
  });

  it('catches errors thrown while mounting children', async () => {
    const Bad = (): JSX.Element => {
      throw new Error('mount');
    };
    const host = mount(() => (
      <div>
        <ErrorBoundary fallback={<b>caught</b>}>
          <Bad />
        </ErrorBoundary>
      </div>
    ));
    await tick();
    expect(host.textContent).toBe('caught');
  });
});

describe('createResource', () => {
  it('goes through loading, value and error', async () => {
    const [id, setId] = createSignal(1);
    let fail = false;
    const user = createRoot(() =>
      createResource(() => {
        const n = id();
        return new Promise<string>((resolve, reject) => setTimeout(() => (fail ? reject(new Error('nope')) : resolve(`user ${n}`))));
      }),
    );
    expect(user.loading()).toBe(true);
    expect(user()).toBeUndefined();
    await tick();
    flush();
    expect(user.loading()).toBe(false);
    expect(user()).toBe('user 1');
    fail = true;
    setId(2);
    flush();
    expect(user.loading()).toBe(true);
    await tick();
    flush();
    expect(user.loading()).toBe(false);
    expect((user.error() as Error).message).toBe('nope');
  });

  it('ignores stale promises', async () => {
    const [id, setId] = createSignal(1);
    const resolvers: ((v: string) => void)[] = [];
    const r = createRoot(() => createResource(() => (id(), new Promise<string>((res) => resolvers.push(res)))));
    setId(2);
    flush();
    resolvers[1]!('second');
    resolvers[0]!('first');
    await tick();
    expect(r()).toBe('second');
  });

  it('reports synchronous throws', () => {
    const r = createRoot(() =>
      createResource((): string => {
        throw new Error('sync');
      }),
    );
    expect(r.loading()).toBe(false);
    expect((r.error() as Error).message).toBe('sync');
  });
});

describe('context', () => {
  it('provides values down the owner chain', () => {
    const Theme = createContext('light');
    const [mode, setMode] = useState('dark');
    const Label = () => {
      const theme = useContext(Theme);
      return <span>{theme}</span>;
    };
    const host = mount(() => (
      <div>
        <Label />
        <Theme.Provider value={mode}>{() => <Label />}</Theme.Provider>
      </div>
    ));
    expect(host.textContent).toBe('lightdark');
    setMode('dim');
    flush();
    expect(host.textContent).toBe('lightdim');
  });
});

describe('fragments and components', () => {
  it('renders fragments and component children', () => {
    const [n, setN] = useState(1);
    const Box = (props: ReactiveProps<{ children?: JSX.Element }>) => <section>{props.children}</section>;
    const host = mount(() => (
      <div>
        <>
          a{n}
          <b />
        </>
        <Box>
          <i>{n}</i>
        </Box>
      </div>
    ));
    expect(host.firstElementChild!.innerHTML).toBe('a1<b></b><!----><section><i>1</i></section>');
    setN(2);
    flush();
    expect(host.firstElementChild!.innerHTML).toBe('a2<b></b><!----><section><i>2</i></section>');
  });
});
