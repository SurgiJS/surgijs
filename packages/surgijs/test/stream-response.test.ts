// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStream } from '@surgijs/core/server';
import * as app from './fixtures/ssr-app.tsx?ssr';

const tree = app as unknown as Record<string, unknown>;

describe('renderToStream with the native Fetch Response', () => {
  it('rejects string chunks, which Response bodies do not accept', async () => {
    const response = new Response(renderToStream('x-deferred', tree.Deferred as never));
    await expect(response.text()).rejects.toThrow();
  });

  it('serves the stream once it is encoded as bytes', async () => {
    const stream = renderToStream('x-deferred', tree.Deferred as never).pipeThrough(new TextEncoderStream());
    const response = new Response(stream, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    expect(await response.text()).toBe('<x-deferred><template shadowrootmode="open"><section><q>soon</q></section></template></x-deferred>');
  });
});
