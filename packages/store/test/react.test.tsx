/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { createStore, remote } from '@surgijs/store';
import { StoreProvider, useStore } from '@surgijs/store/react';

function mount(ui: ReactNode) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(ui);
  });
  return {
    el,
    unmount: () => {
      act(() => root.unmount());
      el.remove();
    },
  };
}

describe('useStore snapshot', () => {
  it('does not abort remotes on unrelated parent re-renders', async () => {
    let loads = 0;
    const store = createStore({
      noise: 0,
      users: remote({
        deps: () => '/users',
        fetch: async () => {
          loads++;
          await new Promise((r) => setTimeout(r, 30));
          return loads;
        },
        retry: false,
        staleTime: Infinity,
        gcTime: 0,
      }),
    });

    function Child() {
      const { users } = useStore(store);
      return createElement('span', { 'data-users': String(users) });
    }

    function Parent() {
      const [n, setN] = useState(0);
      return createElement(
        'div',
        null,
        createElement('button', { onClick: () => setN((x) => x + 1) }, String(n)),
        createElement(Child),
      );
    }

    const { el, unmount } = mount(
      createElement(StoreProvider, { store: store as never }, createElement(Parent)),
    );
    await vi.waitFor(() => expect(el.querySelector('[data-users]')?.getAttribute('data-users')).toBe('1'));
    expect(loads).toBe(1);

    await act(async () => {
      el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(loads).toBe(1);
    expect(el.querySelector('[data-users]')?.getAttribute('data-users')).toBe('1');
    unmount();
  });
});
