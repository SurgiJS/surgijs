import { describe, expect, it } from 'vitest';
import { toOriginal, unwrapGetterReads } from '../src/values.ts';

const unwrap = (code: string): string => unwrapGetterReads(code).code;

describe('unwrapGetterReads', () => {
  it('reads signal and memo getters as values', () => {
    expect(unwrap('const [count, setCount] = useState(0); const d = createMemo(() => count * 2); f(count, d);')).toBe(
      'const [count, setCount] = useState(0); const d = createMemo(() => count() * 2); f(count(), d());',
    );
  });

  it('keeps explicit calls and declarations', () => {
    expect(unwrap('const [a] = createSignal(1); a(); const o = { a: 1 }; o.a;')).toBe(
      'const [a] = createSignal(1); a(); const o = { a: 1 }; o.a;',
    );
  });

  it('expands shorthand properties', () => {
    expect(unwrap('const [a] = useState(1); const o = { a };')).toBe('const [a] = useState(1); const o = { a: a() };');
  });

  it('reads props destructured from ReactiveProps', () => {
    const code = `const C = (props: ReactiveProps<P>) => { const { title, step } = props; return title ?? props.label + step(); };`;
    expect(unwrap(code)).toBe(
      `const C = (props: ReactiveProps<P>) => { const { title, step } = props; return title() ?? props.label() + step(); };`,
    );
    expect(unwrap('const C = ({ title }: ReactiveProps<P>) => `${title}`;')).toBe('const C = ({ title }: ReactiveProps<P>) => `${title()}`;');
  });

  it('treats the render function of defineComponent as a props bag', () => {
    expect(unwrap("defineComponent('x-a', (props) => props.a);")).toBe("defineComponent('x-a', (props) => props.a());");
  });

  it('calls getters that receive arguments', () => {
    expect(unwrap('const C = (props: ReactiveProps<P>) => { const { onPick } = props; onPick(1); props.render(2); };')).toBe(
      'const C = (props: ReactiveProps<P>) => { const { onPick } = props; onPick()(1); props.render()(2); };',
    );
  });

  it('respects shadowing', () => {
    expect(unwrap('const [a] = useState(1); function f(a) { return a; } const g = () => { const a = 2; return a; }; a;')).toBe(
      'const [a] = useState(1); function f(a) { return a; } const g = () => { const a = 2; return a; }; a();',
    );
  });

  it('leaves JSX names and namespaced attributes alone', () => {
    expect(unwrap('const href = createMemo(() => "#a"); const el = <use xlink:href={href} href={href} />;')).toBe(
      'const href = createMemo(() => "#a"); const el = <use xlink:href={href()} href={href()} />;',
    );
  });

  it('records textual signals', () => {
    const r = unwrapGetterReads('const [a] = useState(0); const [b] = useState<string>(x); const [c] = useState(obj);');
    expect([...r.textual]).toEqual(['a', 'b']);
  });

  it('maps positions back through inserts', () => {
    const r = unwrapGetterReads('const [a] = useState(0);\nf(a, a);');
    expect(r.code).toBe('const [a] = useState(0);\nf(a(), a());');
    const second = r.code.lastIndexOf('a()');
    expect(toOriginal(second, r.inserts)).toBe('const [a] = useState(0);\nf(a, '.length);
    expect(toOriginal(r.code.length, r.inserts)).toBe('const [a] = useState(0);\nf(a, a);'.length);
  });
});
