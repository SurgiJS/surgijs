import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createComponent, defineComponent, flush, For, Show, useMemo, useState, type ReactiveProps } from '@surgijs/core';
import { installDevtools, uninstallDevtools } from '@surgijs/core/devtools';

interface Fiber {
  type: unknown;
  tag: number;
  child: Fiber | null;
  sibling: Fiber | null;
  alternate: Fiber | null;
  memoizedProps: Record<string, unknown> | null;
  memoizedState: Record<string, unknown> | null;
  stateNode: unknown;
}

interface Renderer {
  reconcilerVersion: string;
  findFiberByHostInstance(node: Node): Fiber | null;
}

const hook = vi.hoisted(() => {
  const state = {
    commits: [] as { current: Fiber }[],
    renderer: null as Renderer | null,
    inject: (next: Renderer) => {
      state.renderer = next;
      return 1;
    },
  };
  (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject: (next: Renderer) => state.inject(next),
    onCommitFiberRoot(_id: number, root: { current: Fiber }) {
      state.commits.push({ current: root.current });
    },
  };
  return state;
});

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const last = () => hook.commits.at(-1)!.current;
const nameOf = (f: Fiber) => (typeof f.type === 'function' ? f.type.name : String(f.type));

function walk(fiber: Fiber | null, out: string[] = []): string[] {
  for (; fiber; fiber = fiber.sibling) {
    if (fiber.type) out.push(nameOf(fiber));
    walk(fiber.child, out);
  }
  return out;
}

function find(fiber: Fiber | null, name: string): Fiber | null {
  for (; fiber; fiber = fiber.sibling) {
    if (typeof fiber.type === 'function' && fiber.type.name === name) return fiber;
    const nested = find(fiber.child, name);
    if (nested) return nested;
  }
  return null;
}

let saves = 0;

function Row(props: ReactiveProps<{ label: string }>) {
  return <li>{props.label()}</li>;
}

function Child(_props: ReactiveProps<{ onSave: () => void }>) {
  const [n, setN] = useState(1);
  const twice = useMemo(() => n() * 2);
  return <em onClick={() => setN(n() + 1)}>{twice()}</em>;
}

function Plain(props: { onSave: () => number }) {
  props.onSave();
  return <b />;
}

function Box(props: ReactiveProps<{ open?: boolean; items?: string[] }>) {
  return (
    <div>
      <Show when={props.open()} fallback={<span>closed</span>}>
        <Child onSave={() => saves++} />
      </Show>
      {createComponent(Plain, { onSave: () => saves++ })}
      <ul>
        <For each={props.items() ?? []}>{(item) => <Row label={item} />}</For>
      </ul>
    </div>
  );
}

defineComponent<{ open?: boolean; items?: string[] }>('x-dev-box', Box, { open: Boolean, items: Array });

beforeAll(() => {
  expect(hook.renderer).toBeNull();
  installDevtools();
});

afterEach(() => {
  document.body.replaceChildren();
});

afterAll(() => {
  uninstallDevtools();
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
});

describe('react devtools', () => {
  it('registers as a React 19 renderer only when installDevtools runs', () => {
    expect(hook.renderer?.reconcilerVersion).toBe('19.0.0');
  });

  it('shows components, props, hook state, and DOM nodes', async () => {
    const el = document.createElement('x-dev-box');
    el.setAttribute('open', '');
    el.setAttribute('items', '["a","b"]');
    document.body.appendChild(el);
    await tick();

    const root = last();
    expect(walk(root)).toEqual(['x-dev-box', 'Box', 'div', 'Show', 'Child', 'em', 'Plain', 'b', 'For', 'Row', 'li', 'Row', 'li']);
    expect(find(root, 'Box')!.memoizedProps).toEqual({ open: true, items: ['a', 'b'] });
    expect(find(root, 'Child')!.memoizedState).toEqual({ useState: 1, useMemo: 2 });
    expect(find(root, 'Row')!.memoizedProps).toEqual({ label: 'a' });

    const em = el.shadowRoot!.querySelector('em')!;
    const emFiber = find(root, 'Child')!.child!;
    expect(emFiber.stateNode).toBe(em);
    expect(hook.renderer!.findFiberByHostInstance(em)?.type).toBe(Box);
  });

  it('commits a fresh tree on update and keeps the previous one intact', async () => {
    const el = document.createElement('x-dev-box');
    el.setAttribute('open', '');
    document.body.appendChild(el);
    await tick();
    const before = last();
    const childBefore = find(before, 'Child')!;

    el.shadowRoot!.querySelector('em')!.click();
    flush();
    await tick();
    const after = last();
    expect(after).not.toBe(before);
    expect(after.alternate).toBe(before);
    expect(find(after, 'Child')!.memoizedState).toEqual({ useState: 2, useMemo: 4 });
    expect(find(after, 'Child')!.alternate).toBe(childBefore);
    expect(childBefore.memoizedState).toEqual({ useState: 1, useMemo: 2 });
    expect(el.shadowRoot!.querySelector('em')!.textContent).toBe('4');
  });

  it('follows Show branches and For rows', async () => {
    const el = document.createElement('x-dev-box');
    el.setAttribute('open', '');
    el.setAttribute('items', '["a"]');
    document.body.appendChild(el);
    await tick();

    el.setAttribute('items', '["a","b","c"]');
    flush();
    await tick();
    expect(walk(last()).filter((n) => n === 'Row')).toHaveLength(3);

    el.removeAttribute('open');
    flush();
    await tick();
    expect(walk(last())).toEqual(['x-dev-box', 'Box', 'div', 'Show', 'span', 'Plain', 'b', 'For', 'Row', 'li', 'Row', 'li', 'Row', 'li']);

    el.setAttribute('open', '');
    flush();
    await tick();
    expect(walk(last())).toContain('Child');
    expect(walk(last())).not.toContain('span');

    el.setAttribute('items', '["c"]');
    flush();
    await tick();
    expect(find(last(), 'Row')!.memoizedProps).toEqual({ label: 'c' });
    expect(walk(last()).filter((n) => n === 'Row')).toHaveLength(1);
  });

  it('keeps callback props as functions after the component calls them', async () => {
    const before = saves;
    const el = document.createElement('x-dev-box');
    el.setAttribute('open', '');
    document.body.appendChild(el);
    await tick();
    expect(typeof find(last(), 'Child')!.memoizedProps!.onSave).toBe('function');
    expect(saves).toBe(before + 1);
    expect(typeof find(last(), 'Plain')!.memoizedProps!.onSave).toBe('function');
  });

  it('empties the root when the element is removed', async () => {
    const el = document.createElement('x-dev-box');
    document.body.appendChild(el);
    await tick();
    el.remove();
    await tick();
    expect(last().child).toBeNull();
  });

  it('re-renders a redefined component and empties the root when it is removed', async () => {
    defineComponent('x-dev-hot', () => <p>one</p>);
    const el = document.createElement('x-dev-hot');
    document.body.appendChild(el);
    await tick();
    defineComponent('x-dev-hot', () => <p>two</p>);
    expect(el.shadowRoot!.innerHTML).toBe('<p>two</p>');
    await tick();
    el.remove();
    await tick();
    expect(last().child).toBeNull();
  });
});
