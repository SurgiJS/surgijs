// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createStore, syncLocation } from '@surgijs/store';

describe('syncLocation', () => {
  it('binds path and query both ways', () => {
    history.replaceState(null, '', '/list?page=1');
    const store = createStore({ path: '/', query: {} as Record<string, string> });
    const stop = syncLocation(store, { path: 'path', query: 'query' });
    expect(store.get()).toEqual({ path: '/list', query: { page: '1' } });

    store.set('query', { page: '2' });
    expect(location.pathname + location.search).toBe('/list?page=2');

    history.pushState(null, '', '/other?x=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(store.get()).toEqual({ path: '/other', query: { x: '1' } });

    stop();
    store.set('path', '/ignored');
    expect(location.pathname).toBe('/other');
  });
});
