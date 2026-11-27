import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { createStore, remote } from '@surgijs/store';
import { fromStatus, fromStore } from '@surgijs/store/angular';

function context() {
  const injector = Injector.create({ providers: [] });
  return { injector, run: <T>(fn: () => T) => runInInjectionContext(injector, fn) };
}

describe('angular adapter', () => {
  it('updates the signal and ends the subscription with the injection context', () => {
    const store = createStore({ count: 1, noise: 0 });
    const { injector, run } = context();
    const count = run(() => fromStore(store, (s) => s.count));
    expect(count()).toBe(1);

    store.set('count', 2);
    expect(count()).toBe(2);

    injector.destroy();
    store.set('count', 3);
    expect(count()).toBe(2);
  });

  it('returns a read-only signal', () => {
    const store = createStore({ count: 1 });
    const { run } = context();
    const count = run(() => fromStore(store, (s) => s.count));
    expect('set' in count).toBe(false);
  });

  it('keeps the previous value for deep-equal results', () => {
    const store = createStore({ user: { name: 'ada' } as { name: string } });
    const { run } = context();
    const user = run(() => fromStore(store, (s) => s.user));
    const first = user();
    store.set('user', { name: 'ada' });
    expect(user()).toBe(first);
  });

  it('accepts an explicit DestroyRef outside an injection context', () => {
    const store = createStore({ count: 1 });
    const callbacks: Array<() => void> = [];
    const destroyRef = {
      onDestroy: (fn: () => void) => {
        callbacks.push(fn);
      },
    } as unknown as DestroyRef;
    const count = fromStore(store, (s) => s.count, { destroyRef });
    store.set('count', 2);
    expect(count()).toBe(2);
    callbacks.forEach((fn) => fn());
    store.set('count', 3);
    expect(count()).toBe(2);
  });

  it('throws without an injection context and does not subscribe', () => {
    const store = createStore({ count: 1 });
    const subscribe = vi.spyOn(store, 'subscribe');
    expect(() => fromStore(store, (s) => s.count)).toThrow();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('exposes remote status as a signal and releases the remote on destroy', async () => {
    const store = createStore({
      list: remote({ deps: () => '/x', fetch: async () => [1, 2], retry: false }),
    });
    const { injector, run } = context();
    const status = run(() => fromStatus(store, 'list'));
    expect(status().status).toBe('pending');

    await vi.waitFor(() => expect(status().status).toBe('success'));
    expect(status().data).toEqual([1, 2]);
    expect(store.status('list').isActive).toBe(true);

    injector.destroy();
    expect(store.status('list').isActive).toBe(false);
  });

  it('does not keep the subscription when the injection context is already destroyed', () => {
    const store = createStore({ list: remote({ deps: () => '/x', fetch: async () => [1], retry: false }) });
    const { injector, run } = context();
    injector.destroy();
    expect(() => run(() => fromStatus(store, 'list'))).toThrow();
    expect(store.status('list').isActive).toBe(false);
  });
});
