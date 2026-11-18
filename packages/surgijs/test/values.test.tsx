import { describe, expect, it } from 'vitest';
import { createMemo, createRoot, flush, useState, type ReactiveProps } from 'surgijs';

describe('getter reads', () => {
  it('reads signals and memos as values inside JSX', () => {
    const [count, setCount] = useState(1);
    const double = createMemo(() => count() * 2);
    const el = createRoot(() => (<p>{count} x 2 = {double}</p>) as HTMLElement);
    expect(el.textContent).toBe('1 x 2 = 2');
    setCount(3);
    flush();
    expect(el.textContent).toBe('3 x 2 = 6');
  });

  it('reads destructured props and props members', () => {
    const Title = (props: ReactiveProps<{ text?: string; level?: number }>) => {
      const { text } = props;
      return <h1 class={`h${props.level() ?? 1}`}>{text ?? 'untitled'}</h1>;
    };
    const [text, setText] = useState<string | undefined>(undefined);
    const el = createRoot(() => (<Title text={text()} level={2} />) as HTMLElement);
    expect(el.outerHTML).toBe('<h1 class="h2">untitled</h1>');
    setText('Hello');
    flush();
    expect(el.textContent).toBe('Hello');
  });

  it('reads getters in template literals and object shorthands', () => {
    const [name, setName] = useState('Ann');
    const greet = () => `Hi ${name}`;
    const pack = () => ({ name });
    expect(greet()).toBe('Hi Ann');
    setName('Bob');
    expect(pack()).toEqual({ name: 'Bob' });
  });

  it('keeps xlink:href with a getter named href', () => {
    const [href, setHref] = useState('#a');
    const el = createRoot(() => (<svg><use xlink:href={href} /></svg>) as SVGElement);
    const use = el.firstChild as Element;
    expect(use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#a');
    setHref('#b');
    flush();
    expect(use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#b');
  });
});
