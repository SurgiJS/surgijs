import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defineComponent, flush, Show, useState, type ReactiveProps } from '@surgijs/core';
import { installDevtools, uninstallDevtools } from '@surgijs/core/devtools';

interface Fiber {
  type: unknown;
  tag: number;
  child: Fiber | null;
  sibling: Fiber | null;
  memoizedProps: Record<string, unknown> | null;
  memoizedState: { memoizedState: unknown; next: Fiber['memoizedState'] } | null;
  _debugHookTypes: string[] | null;
  stateNode: unknown;
}

interface Renderer {
  findFiberByHostInstance(node: Node): Fiber | null;
}

const commits: Fiber[] = [];
const unmounts: Fiber[] = [];
let renderer: Renderer;

function walk(fiber: Fiber | null, out: string[] = []): string[] {
  while (fiber) {
    if (typeof fiber.type === 'string') out.push(fiber.type);
    else if (typeof fiber.type === 'function') out.push(fiber.type.name || 'anonymous');
    walk(fiber.child, out);
    fiber = fiber.sibling;
  }
  return out;
}

function find(fiber: Fiber | null, name: string): Fiber | null {
  while (fiber) {
    if (typeof fiber.type === 'function' && fiber.type.name === name) return fiber;
    const nested = find(fiber.child, name);
    if (nested) return nested;
    fiber = fiber.sibling;
  }
  return null;
}

function Child() {
  const [n, setN] = useState(1);
  return <em onClick={() => setN(n() + 1)}>{n()}</em>;
}

function Box(props: ReactiveProps<{ open?: boolean }>) {
  return (
    <div>
      <Show when={props.open()} fallback={<span>closed</span>}>
        <Child />
      </Show>
    </div>
  );
}

defineComponent<{ open?: boolean }>('x-dev-box', Box, { open: Boolean });

beforeAll(() => {
  (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject(next: Renderer) {
      renderer = next;
      return 1;
    },
    onCommitFiberRoot(_id: number, root: { current: Fiber }) {
      commits.push(root.current);
    },
    onCommitFiberUnmount(_id: number, fiber: Fiber) {
      unmounts.push(fiber);
    },
  };
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
  it('shows the component tree, props, hooks, and the element under the cursor', async () => {
    const el = document.createElement('x-dev-box');
    el.setAttribute('open', '');
    document.body.appendChild(el);
    const root = commits.at(-1)!;
    expect(walk(root)).toEqual(expect.arrayContaining(['x-dev-box', 'Box', 'Show', 'Child']));
    expect(find(root, 'Box')!.memoizedProps).toMatchObject({ open: true });
    expect(find(root, 'Child')!._debugHookTypes).toEqual(['useState']);
    expect(find(root, 'Child')!.memoizedState!.memoizedState).toBe(1);

    const em = el.shadowRoot!.querySelector('em')!;
    expect(renderer.findFiberByHostInstance(em)?.type).toBe(Child);
    em.click();
    flush();
    expect(find(commits.at(-1)!, 'Child')!.memoizedState!.memoizedState).toBe(2);
    expect(el.shadowRoot!.querySelector('em')!.textContent).toBe('2');

    el.removeAttribute('open');
    flush();
    expect(walk(commits.at(-1)!)).not.toContain('Child');
    expect(el.shadowRoot!.querySelector('span')!.textContent).toBe('closed');

    el.remove();
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(unmounts.some((fiber) => fiber.type === Child || fiber.type === Box)).toBe(true);
  });
});
