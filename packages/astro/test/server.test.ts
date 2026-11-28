import { describe, expect, it } from 'vitest';
import renderer from '../src/server.ts';
import { Card, Late, Light } from './fixtures/components.tsx';

const render = (Component: unknown, props = {}, slots = {}) => renderer.renderToStaticMarkup(Component, props, slots);

describe('renderer check', () => {
  it('claims components made by defineComponent', () => {
    expect(renderer.check(Card)).toBe(true);
    expect(renderer.check(Light)).toBe(true);
  });

  it('leaves everything else to other renderers', () => {
    expect(renderer.check(class {})).toBe(false);
    expect(renderer.check(() => null)).toBe(false);
    expect(renderer.check('my-tag')).toBe(false);
    expect(renderer.check(null)).toBe(false);
    expect(renderer.check({ $surgi: { tag: 'x-a', render() {} } })).toBe(false);
  });
});

describe('renderToStaticMarkup', () => {
  it('renders the host with a declarative shadow root, styles and delegated focus', async () => {
    const { html } = await render(Card, { title: 'Hi <b>', step: 2 });
    expect(html).toBe(
      '<x-card title="Hi &lt;b&gt;" step="2"><template shadowrootmode="open" shadowrootdelegatesfocus>' +
        '<style data-s>section { color: red }</style><section><h3>Hi &lt;b&gt;</h3><p><i>2</i><b>undefined</b><u></u></p><slot></slot></section></template></x-card>',
    );
  });

  it('reads literal attribute values the way the element does', async () => {
    const { html } = await render(Card, { step: '5', open: '', items: '["a","b"]', title: 'T' });
    expect(html).toContain('<x-card step="5" open items="[&quot;a&quot;,&quot;b&quot;]" title="T">');
    expect(html).toContain('<p><i>5</i><b>true</b><u>a,b</u></p>');
    expect((await render(Card, { open: 'false' })).html).toContain('<b>false</b>');
    expect((await render(Card, { items: 'not json' })).html).toContain('<u></u>');
  });

  it('serializes objects as JSON attributes and drops functions and undefined', async () => {
    const { html } = await render(Card, { items: ['a'], onClick: () => {}, title: undefined, 'data-id': 'x' });
    expect(html).toContain('<x-card items="[&quot;a&quot;]" data-id="x">');
  });

  it('projects slots as light DOM children', async () => {
    const { html } = await render(Card, {}, { default: '<em>text</em>', icon: '<i>*</i>' });
    expect(html).toContain(
      '</template><astro-slot><em>text</em></astro-slot><div slot="icon" style="display:contents"><astro-slot name="icon"><i>*</i></astro-slot></div></x-card>',
    );
  });

  it('waits for async components', async () => {
    expect((await render(Late)).html).toBe('<x-late><template shadowrootmode="open"><b>late</b></template></x-late>');
  });

  it('leaves a light DOM component to the client', async () => {
    expect((await render(Light, { title: 'x' }, { default: 'child' })).html).toBe('<x-light title="x"></x-light>');
  });
});
