import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.ts';

const dom = (code: string): string => compile(code, { filename: 'test.tsx' }).code;
const ssr = (code: string): string => compile(code, { filename: 'test.tsx', generate: 'ssr' }).code;

describe('compile', () => {
  it('returns files without JSX unchanged', () => {
    const code = 'const a = 1 < 2;\nexport default a;\n';
    expect(compile(code)).toEqual({ code, changed: false, warnings: [] });
  });

  it('hoists a static template', () => {
    const out = dom('const el = <div class="a"><span>hi</span></div>;');
    expect(out).toContain('const _tmpl$1 = /*#__PURE__*/ _$template("<div class=\\"a\\"><span>hi</span></div>");');
    expect(out).toContain('const el = _tmpl$1();');
    expect(out).toContain('import { template as _$template } from "@surgijs/core/internal";');
  });

  it('honours moduleName', () => {
    expect(compile('const el = <div />;', { moduleName: 'my-runtime' }).code).toContain('from "my-runtime/internal"');
    expect(compile('const el = <div />;', { moduleName: 'my-runtime', generate: 'ssr' }).code).toContain('from "my-runtime/server"');
  });

  it('turns React-style deps arrays into tracked thunks', () => {
    const out = dom(`
      const C = (props: ReactiveProps<{ step: number }>) => {
        const { step } = props;
        const [count] = useState(0);
        const label = 'x';
        useEffect(() => console.log(count), [count, step, label]);
        useEffect(() => console.log('mounted'), []);
        const double = useMemo(() => count * 2, [count]);
        useEffect(() => {}, () => [count]);
        other(() => {}, [count]);
        return <p>{double}</p>;
      };
    `);
    expect(out).toContain('useEffect(() => console.log(count()), () => [count(), step(), label]);');
    expect(out).toContain("useEffect(() => console.log('mounted'), () => []);");
    expect(out).toContain('useMemo(() => count() * 2, () => [count()]);');
    expect(out).toContain('useEffect(() => {}, () => [count()]);');
    expect(out).toContain('other(() => {}, [count()]);');
  });

  it('resolves every path before the first mutation', () => {
    const out = dom(`
      const [count] = useState(0);
      const title = () => 'x';
      const el = <div class="card"><h3>{title() ?? 'Counter'}</h3><p>Value: {count}</p><button onClick={() => 1}>Add</button></div>;
    `);
    expect(out).toContain(
      'const _el$2 = _tmpl$1(), _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling, _el$5 = _el$4.nextSibling;',
    );
    expect(out).toContain("_$insert(_el$3, () => title() ?? 'Counter');");
    expect(out).toContain('_$insert(_el$4, count, null);');
    expect(out).toContain('_el$5.$$click = () => 1;');
    expect(out).toContain('_$delegate(["click"]);');
  });

  it('binds a single textual read to a placeholder text node', () => {
    const out = dom('const [label] = useState(""); const el = <span>{label}</span>;');
    expect(out).toContain('_$template("<span> </span>")');
    expect(out).toContain('_el$3 = _el$2.firstChild; _$bind(_el$3, label, _$setText);');
  });

  it('keeps parentheses around comma expressions and object literals', () => {
    const syntaxErrors = (code: string) =>
      parseSync('out.tsx', code, { lang: 'tsx' }).errors.length;
    const cases = [
      'const el = <span>{(log(), n())}</span>;',
      'const el = <p>a{(log(), n())}b</p>;',
      'const el = <p title={(log(), n())} />;',
      'const el = <input value={(log(), n())} />;',
      'const el = <i style={{ color: (log(), n()) }} />;',
      'const el = <p>{({ v: n() })}</p>;',
      'const el = <Comp>a{(log(), n())}</Comp>;',
    ];
    for (const code of cases) {
      const out = dom(code);
      expect(syntaxErrors(out), out).toBe(0);
      expect(out).not.toMatch(/=> log\(\), n\(\)|=> \{ v: n\(\) \}/);
    }
    expect(dom('const el = <span>{(log(), n())}</span>;')).toContain('_$insert(_el$2, () => (log(), n()));');
    expect(ssr('const el = <p title={(log(), n())}>{(log(), n())}</p>;')).toContain('_$text((log(), n()))');
  });

  it('inserts a marker for middle children', () => {
    const out = dom('const el = <p>a{x()}b</p>;');
    expect(out).toContain('_$template("<p>a<!---->b</p>")');
    expect(out).toContain('_el$3 = _el$2.firstChild.nextSibling; _$insert(_el$2, x, _el$3);');
  });

  it('unwraps getter arrows into bind', () => {
    const out = dom('const el = <div class={() => c()} />;');
    expect(out).toContain('_$bind(_el$2, c, _$className);');
  });

  it('uses effect for branching reads', () => {
    expect(dom('const el = <div class={cond() ? a() : b()} />;')).toContain(
      '_$effect(() => _$className(_el$2, cond() ? a() : b()));',
    );
    expect(dom('const el = <div title={a() && b()} />;')).toContain('_$effect(() => _$attr(_el$2, "title", a() && b()));');
    expect(dom('const el = <div title={o?.f()} />;')).toContain('_$effect(');
  });

  it('hoists single-getter readers and deduplicates them', () => {
    const out = dom('const x = <div class={a() ? "on" : ""} title={a() ? "on" : ""} />; const y = <i class={a() + a()} />;');
    expect(out).toContain('const _b$3 = (p0) => p0() ? "on" : "";');
    expect(out).toContain('_$bind(_el$2, _b$3, _$className, a);');
    expect(out).toContain('_$bind(_el$2, _b$3, _s$4, a);');
    expect(out.match(/=> p0\(\) \? "on"/g)).toHaveLength(1);
    expect(out).toContain('(p0) => p0() + p0()');
  });

  it('keeps closures for readers of several getters', () => {
    expect(dom('const el = <div title={a() + b()} />;')).toContain('_$bind(_el$2, () => a() + b(), _s$3);');
  });

  it('keeps closures for reads that touch locals', () => {
    expect(dom('const el = <div title={a() + local} />;')).toContain('_$bind(_el$2, () => a() + local, _s$3);');
  });

  it('writes htmlFor as for, and as a property on custom elements', () => {
    expect(dom('const el = <label htmlFor="x" />;')).toContain('"<label for=\\"x\\"></label>"');
    expect(dom('const el = <label htmlFor={id()} />;')).toContain('_$attr(n, "for", v)');
    expect(dom('const el = <my-label htmlFor={id()} />;')).toContain('n.htmlFor = v');
  });

  it('emits fragments as their own parts, so a Switch can read its cases through them', () => {
    expect(ssr('const el = <><b>x</b></>;')).toContain('_$fragment(');
    expect(ssr('const el = <div><b>x</b></div>;')).not.toContain('_$fragment(');
  });

  it('keeps style and script text raw, guarding only the closing tag', () => {
    expect(ssr('const el = <style>a &gt; b &amp; c</style>;')).toContain('"<style>a > b & c</style>"');
    expect(ssr('const el = <style>{css}</style>;')).toContain('_$escapeRaw([css], "style")');
    expect(ssr('const el = <p>{css}</p>;')).toContain('_$text(css)');
    expect(dom('const el = <style>a &gt; b &amp; c</style>;')).toContain('<style>a > b & c</style>');
    expect(ssr('const el = <style>a &lt;/style&gt; b</style>;')).toContain('"<style>a <\\\\/style> b</style>"');
  });

  it('escapes dynamic raw text as a whole', () => {
    const out = ssr('const el = <style>&lt;{tail}</style>;');
    expect(out).toContain('_$escapeRaw(["<", tail], "style")');
    expect(out).not.toContain('<!---->');
  });

  it('treats SVG style and script as ordinary text', () => {
    expect(ssr('const el = <svg><style>{css}</style></svg>;')).toContain('_$text(css)');
    expect(ssr('const el = <svg><style>a &amp; b</style></svg>;')).toContain('<style>a &amp; b</style>');
    expect(dom('const el = <svg><style>a &amp; b</style></svg>;')).toContain('<style>a &amp; b</style>');
    expect(ssr('const el = <svg><foreignObject><style>a &amp; b</style></foreignObject></svg>;')).toContain('<style>a & b</style>');
  });

  it('keeps xlink, xml and xmlns prefixes', () => {
    const out = dom('const el = <svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a" xml:lang="en" /></svg>;');
    expect(out).toContain('xmlns:xlink=\\"http://www.w3.org/1999/xlink\\"');
    expect(out).toContain('<use xlink:href=\\"#a\\" xml:lang=\\"en\\"></use>');
    expect(dom('const el = <use xlink:href={href()} />;')).toContain('_$attrNS(n, "xlink:href", v)');
  });

  it('marks SVG children and custom elements with template flags', () => {
    expect(dom('const el = <path d="M0" />;')).toContain('_$template("<path d=\\"M0\\"></path>", 2)');
    expect(dom('const el = <div><my-el /></div>;')).toContain('_$template("<div><my-el></my-el></div>", 1)');
  });

  it('supports attr:, prop: and on: directives', () => {
    expect(dom('const el = <input attr:value="a" />;')).toContain('<input value=\\"a\\">');
    expect(dom('const el = <div attr:data-x={v()} />;')).toContain('_$attr(n, "data-x", v)');
    expect(dom('const el = <div prop:foo={v()} />;')).toContain('n.foo = v');
    expect(dom('const el = <div on:MyEvent={h} />;')).toContain('_el$2.addEventListener("MyEvent", h);');
  });

  it('writes properties and attributes', () => {
    expect(dom('const el = <input value={v()} />;')).toContain('n.value = v');
    expect(dom('const el = <input checked />;')).toContain('"<input checked>"');
    expect(dom('const el = <input checked={false} />;')).toContain('"<input>"');
    expect(dom('const el = <div hidden={false} tabIndex={1} />;')).toContain('"<div tabIndex=\\"1\\"></div>"');
    expect(dom('const el = <div innerHTML="<b>x</b>" />;')).toContain('_el$2.innerHTML = "<b>x</b>";');
    expect(dom('const el = <my-el step={2} label="a" />;')).toContain('_el$2.step = 2;');
    expect(dom('const el = <my-el step={2} label="a" />;')).toContain('<my-el label=\\"a\\">');
    expect(dom('const el = <my-el data={d()} />;')).toContain('n.data = v');
    expect(dom('const el = <div onScroll={h} />;')).toContain('_el$2.addEventListener("scroll", h);');
  });

  it('compiles style objects', () => {
    expect(dom('const el = <div style={{ color: "red", marginTop: 4 }} />;')).toContain(
      '"<div style=\\"color: red; margin-top: 4;\\"></div>"',
    );
    const partial = dom('const el = <div style={{ color: "red", width: w() }} />;');
    expect(partial).toContain('"<div style=\\"color: red;\\"></div>"');
    expect(partial).toContain('n.style.setProperty("width", v)');
    expect(dom('const el = <div style={s()} />;')).toContain('_$bind(_el$2, s, _$style);');
  });

  it('handles refs and spreads', () => {
    expect(dom('const el = <div ref={(e) => (x = e)} />;')).toContain('((e) => (x = e))(_el$2);');
    expect(dom('const el = <div ref={r} />;')).toContain('_$use(r, _el$2);');
    expect(dom('const el = <div {...p} />;')).toContain('_$spread(_el$2, p);');
  });

  it('escapes text and attributes and decodes entities', () => {
    const out = dom('const el = <p title="a &amp; &quot;b&quot;">x &lt; y &amp; z{"<"}</p>;');
    expect(out).toContain('title=\\"a &amp; &quot;b&quot;\\"');
    expect(out).toContain('x &lt; y &amp; z&lt;');
    expect(dom('const el = <C label="a &amp; b" />;')).toContain('label: () => "a & b"');
  });

  it('cleans JSX whitespace like Babel', () => {
    const out = dom(`const el = (
      <p>
        Hello
        world   <b>!</b>
      </p>
    );`);
    expect(out).toContain('"<p>Hello world   <b>!</b></p>"');
  });

  it('passes getters to components', () => {
    const out = dom('const el = <Card title={t()} count={2}><b>x</b></Card>;');
    expect(out).toContain('_$createComponent(Card, { title: () => (t()), count: () => (2), children: () => _tmpl$1() })');
  });

  it('passes For.by as is and wraps a reactive each', () => {
    const out = dom('const el = <For each={rows()} by={(row) => row.id}>{(row) => <li>{row.label}</li>}</For>;');
    expect(out).toContain('_$createComponent(For, { each: () => rows(), by: (row) => row.id, children: (row) => ');
  });

  it('wraps flow children and fallback in thunks', () => {
    const out = dom('const el = <ErrorBoundary fallback={(err, reset) => <p>{String(err)}</p>}><Child /></ErrorBoundary>;');
    expect(out).toContain('fallback: (err, reset) => ');
    expect(out).toContain('children: () => _$createComponent(Child, {  })');
    const show = dom('const el = <Show when={ok()} fallback={<i />}><b /></Show>;');
    expect(show).toContain('when: () => ok(), fallback: () => _tmpl$');
    expect(show).toContain('children: () => _tmpl$');
    expect(dom('const el = <Show when={user}>{(u) => <b>{u.name}</b>}</Show>;')).toContain('when: user, children: (u) =>');
  });

  it('compiles fragments into arrays', () => {
    expect(dom('const el = <>a{x()}<b /></>;')).toMatch(/\["a", x, _tmpl\$\d+\(\)\]/);
  });

  it('generates SSR strings', () => {
    const out = ssr(`
      const [count] = useState(0);
      const el = <div class={cls()} onClick={h}><p>Value: {count}</p><Show when={count() > 1}><b /></Show>{a()}<span /></div>;
    `);
    expect(out).toContain('import { attrPart as _$attrPart, text as _$text, element as _$element, component as _$component, Show as _$Show } from "@surgijs/core/server";');
    expect(out).toContain('const el = _$element(["<div", _$attrPart("class", cls()), "><p>Value: ", _$text(count()), "</p>", _$component(_$Show, { when: () => count() > 1, children: () => _$element(["<b></b>"]) }), "<!---->", _$text(a()), "<!----><span></span></div>"]);');
    expect(out).not.toContain('_$template');
    expect(out).not.toContain('onClick');
  });
});

describe('shorthand warnings', () => {
  const warn = (code: string) => compile(code).warnings;

  it('warns where a signal is frozen by a shorthand property', () => {
    const [w] = warn('const [label] = useState("");\nconst row = { id: 1, label };\nconst el = <i />;');
    expect(w).toMatchObject({ line: 2, column: 21 });
    expect(w?.message).toContain('label: () => label()');
  });

  it('stays quiet for explicit forms and files without JSX', () => {
    expect(warn('const [label] = useState("");\nconst a = { label: label() }, b = { label: () => label() }; <i />;')).toEqual([]);
    expect(warn('const [label] = useState(""); const row = { label };')).toEqual([]);
  });
});
