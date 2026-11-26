import ts from 'typescript';
import { encodeMap, lineCol, lineStarts } from './map.ts';
import { toOriginal, unwrapGetterReads } from './values.ts';

export { unwrapGetterReads, GETTER_FNS, toOriginal, type Insert, type UnwrapResult } from './values.ts';

export interface CompileOptions {
  filename?: string;
  /** Runtime module the output imports from. `surgijs` by default; SSR uses `<moduleName>/server`. */
  moduleName?: string;
  generate?: 'dom' | 'ssr';
  /** Emit a source map (default `true`). */
  sourceMap?: boolean;
}

export interface CompileResult {
  code: string;
  changed: boolean;
  map?: string;
}

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment;

const isJsx = (n: ts.Node): n is Jsx => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n);

const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

const DELEGATED = new Set(
  'click dblclick contextmenu input beforeinput keydown keyup focusin focusout pointerdown pointerup pointermove pointerover pointerout mousedown mouseup mousemove mouseover mouseout touchstart touchend touchmove'.split(
    ' ',
  ),
);

const PROPS = new Set(
  'value checked selected muted indeterminate defaultValue defaultChecked innerHTML textContent innerText srcObject currentTime volume playbackRate'.split(
    ' ',
  ),
);
/** Properties whose static value lives in the template as an attribute. */
const PROPS_AS_ATTR = new Set(['value', 'checked', 'selected', 'muted']);

const SVG = new Set(
  'animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient marker mask metadata mpath path pattern polygon polyline radialGradient rect set stop switch symbol text textPath tspan use view'.split(
    ' ',
  ),
);

const FLOW = new Set(['Show', 'Switch', 'Match', 'ErrorBoundary']);
const FLOW_WHEN = new Set(['Show', 'Match']);
const BUILTIN = new Set(['For', 'Show', 'Switch', 'Match', 'ErrorBoundary', 'Portal']);

const TEXT_METHODS = new Set(['toString', 'toFixed', 'toPrecision', 'toLocaleString', 'toUpperCase', 'toLowerCase', 'trim', 'padStart', 'padEnd', 'join', 'repeat']);

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', times: '×', divide: '÷', laquo: '«', raquo: '»', middot: '·', bull: '•', larr: '←',
  rarr: '→', uarr: '↑', darr: '↓', harr: '↔', euro: '€', pound: '£', yen: '¥', cent: '¢', deg: '°', plusmn: '±',
  sect: '§', para: '¶', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hearts: '♥', check: '✓', ensp: '\u2002',
  emsp: '\u2003', thinsp: '\u2009', zwj: '\u200d', zwnj: '\u200c',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/** JSX text whitespace rules shared by Babel and React. */
function cleanText(value: string): string {
  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i]!)) lastNonEmpty = i;
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.replace(/\t/g, ' ');
    if (i !== 0) line = line.replace(/^[ ]+/, '');
    if (i !== lines.length - 1) line = line.replace(/[ ]+$/, '');
    if (line) {
      if (i !== lastNonEmpty) line += ' ';
      out += line;
    }
  }
  return out;
}

const escText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const kebab = (s: string): string => (s.startsWith('--') ? s : s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()));

const strip = (e: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  return e;
};

/** Expressions that change meaning without parentheses inside an argument list or an arrow body. */
const needsParens = (x: ts.Expression): boolean =>
  ts.isObjectLiteralExpression(x) || (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.CommaToken);

const isFn = (e: ts.Expression): e is ts.ArrowFunction | ts.FunctionExpression => {
  const x = strip(e);
  return ts.isArrowFunction(x) || ts.isFunctionExpression(x);
};

/** Zero-parameter arrow with an expression body: `() => c()`. */
function getterBody(e: ts.Expression): ts.Expression | null {
  const x = strip(e);
  if (ts.isArrowFunction(x) && x.parameters.length === 0 && !ts.isBlock(x.body)) return x.body;
  return null;
}

type Literal = { v: string | number | boolean | null | undefined };

function literal(e: ts.Expression): Literal | null {
  const x = strip(e);
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return { v: x.text };
  if (ts.isNumericLiteral(x)) return { v: Number(x.text) };
  if (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(x.operand))
    return { v: -Number(x.operand.text) };
  if (x.kind === ts.SyntaxKind.TrueKeyword) return { v: true };
  if (x.kind === ts.SyntaxKind.FalseKeyword) return { v: false };
  if (x.kind === ts.SyntaxKind.NullKeyword) return { v: null };
  if (ts.isIdentifier(x) && x.text === 'undefined') return { v: undefined };
  return null;
}

const litCode = (l: Literal): string => (l.v === undefined ? 'undefined' : JSON.stringify(l.v));

/** Contains a call evaluated together with the expression (nested functions and JSX excluded). */
function isDynamic(e: ts.Node): boolean {
  let found = false;
  const walk = (n: ts.Node): void => {
    if (found || isJsx(n) || ts.isFunctionLike(n)) return;
    if (ts.isCallExpression(n) || ts.isTaggedTemplateExpression(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(e);
  return found;
}

function hasCall(e: ts.Node): boolean {
  let found = false;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n) || ts.isTaggedTemplateExpression(n)) found = true;
    else ts.forEachChild(n, walk);
  };
  walk(e);
  return found;
}

/** Every call runs on every evaluation, so the first run sees all dependencies. */
function isStable(e: ts.Node): boolean {
  let ok = true;
  const walk = (n: ts.Node): void => {
    if (!ok) return;
    if (ts.isConditionalExpression(n)) {
      walk(n.condition);
      if (hasCall(n.whenTrue) || hasCall(n.whenFalse)) ok = false;
      return;
    }
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        walk(n.left);
        if (hasCall(n.right)) ok = false;
        return;
      }
    }
    if (ts.isOptionalChain(n)) {
      if (hasCall(n)) ok = false;
      return;
    }
    if (ts.isFunctionLike(n) || isJsx(n)) {
      if (hasCall(n)) ok = false;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(e);
  return ok;
}

/** `name()` with an identifier callee and no arguments. */
function directRead(e: ts.Expression): string | null {
  const x = strip(e);
  if (ts.isCallExpression(x) && !x.arguments.length && ts.isIdentifier(x.expression) && !x.questionDotToken) return x.expression.text;
  return null;
}

interface NodeRef {
  parent: NodeRef | null;
  index: number;
  children: NodeRef[];
  needed: boolean;
  name: string;
}

interface Item {
  k: 'text' | 'el' | 'dyn';
  text?: string;
  node?: ts.JsxElement | ts.JsxSelfClosingElement;
  expr?: ts.Expression | Jsx;
}

interface Setter {
  helper?: string;
  direct: (node: string, value: string) => string;
  hoist?: string;
}

class Compiler {
  readonly helpers = new Map<string, string>();
  readonly templates: string[] = [];
  readonly templateIds = new Map<string, string>();
  readonly hoisted = new Map<string, string>();
  readonly hoistedLines: string[] = [];
  readonly events = new Set<string>();
  uid = 0;

  readonly sf: ts.SourceFile;
  readonly src: string;
  readonly ssr: boolean;
  readonly textual: ReadonlySet<string>;

  constructor(sf: ts.SourceFile, src: string, ssr: boolean, textual: ReadonlySet<string>) {
    this.sf = sf;
    this.src = src;
    this.ssr = ssr;
    this.textual = textual;
  }

  h(name: string): string {
    let alias = this.helpers.get(name);
    if (!alias) this.helpers.set(name, (alias = `_$${name}`));
    return alias;
  }

  text(n: ts.Node): string {
    return this.src.slice(n.getStart(this.sf), n.end);
  }

  /** `rewrite(x)` for an expression placed in an argument list, an assignment or an arrow body. */
  expr(x: ts.Expression): string {
    const code = this.rewrite(x);
    return needsParens(x) ? `(${code})` : code;
  }

  /** Source text of `node` with nested JSX compiled. */
  rewrite(node: ts.Node): string {
    if (isJsx(node)) return this.jsx(node);
    const start = node.getStart(this.sf);
    let out = '';
    let pos = start;
    const walk = (n: ts.Node): void => {
      if (isJsx(n)) {
        out += this.src.slice(pos, n.getStart(this.sf)) + this.jsx(n);
        pos = n.end;
        return;
      }
      ts.forEachChild(n, walk);
    };
    ts.forEachChild(node, walk);
    return out + this.src.slice(pos, node.end);
  }

  jsx(node: Jsx): string {
    if (ts.isJsxFragment(node)) return this.fragment(node.children);
    const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
    const name = tag.getText(this.sf);
    if (/^[A-Z]/.test(name) || name.includes('.') || tag.kind === ts.SyntaxKind.ThisKeyword) return this.component(node, name);
    return this.ssr ? this.ssrElement(node) : this.element(node);
  }

  hoist(prefix: string, body: string): string {
    let name = this.hoisted.get(body);
    if (!name) {
      name = `${prefix}${++this.uid}`;
      this.hoisted.set(body, name);
      this.hoistedLines.push(`const ${name} = ${body};`);
    }
    return name;
  }

  isTextual(e: ts.Expression): boolean {
    const x = strip(e);
    if (ts.isStringLiteral(x) || ts.isNumericLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isTemplateExpression(x)) return true;
    if (ts.isPrefixUnaryExpression(x)) return x.operator === ts.SyntaxKind.MinusToken || x.operator === ts.SyntaxKind.PlusToken;
    if (ts.isBinaryExpression(x)) {
      const op = x.operatorToken.kind;
      if (op === ts.SyntaxKind.PlusToken) return this.isTextual(x.left) || this.isTextual(x.right);
      return (
        op === ts.SyntaxKind.MinusToken || op === ts.SyntaxKind.AsteriskToken || op === ts.SyntaxKind.SlashToken ||
        op === ts.SyntaxKind.PercentToken || op === ts.SyntaxKind.AsteriskAsteriskToken
      );
    }
    if (ts.isConditionalExpression(x)) return this.isTextual(x.whenTrue) && this.isTextual(x.whenFalse);
    if (ts.isPropertyAccessExpression(x)) return x.name.text === 'length';
    if (ts.isCallExpression(x)) {
      const c = x.expression;
      if (ts.isIdentifier(c)) return (!x.arguments.length && this.textual.has(c.text)) || c.text === 'String' || c.text === 'Number';
      if (ts.isPropertyAccessExpression(c)) return TEXT_METHODS.has(c.name.text);
    }
    return false;
  }

  /** Reader for `bind`: a direct getter, a hoisted module-level function, or a closure. */
  reader(e: ts.Expression): { read: string; args: string[] } {
    const direct = directRead(e);
    if (direct) return { read: direct, args: [] };
    const x = strip(e);
    const start = x.getStart(this.sf);
    const params = new Map<string, string>();
    const edits: [number, number, string][] = [];
    let ok = true;
    const walk = (n: ts.Node): void => {
      if (!ok) return;
      if (ts.isIdentifier(n)) {
        const p = n.parent;
        if (ts.isPropertyAccessExpression(p) && p.name === n) return;
        if (ts.isCallExpression(p) && p.expression === n && !p.arguments.length) {
          let name = params.get(n.text);
          if (!name) params.set(n.text, (name = `p${params.size}`));
          edits.push([n.getStart(this.sf) - start, n.end - start, name]);
          return;
        }
        ok = false;
        return;
      }
      if (n.kind === ts.SyntaxKind.ThisKeyword || ts.isFunctionLike(n) || isJsx(n) || ts.isNewExpression(n) || ts.isObjectLiteralExpression(n)) {
        ok = false;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(x);
    if (!ok || params.size !== 1) return { read: `() => ${this.expr(x)}`, args: [] };
    let body = this.text(x);
    for (let i = edits.length - 1; i >= 0; i--) {
      const [s, end, name] = edits[i]!;
      body = body.slice(0, s) + name + body.slice(end);
    }
    const read = this.hoist('_b$', `(${[...params.values()].join(', ')}) => ${needsParens(x) ? `(${body})` : body}`);
    return { read, args: [...params.keys()] };
  }

  setterFn(s: Setter): string {
    if (s.helper) return s.helper;
    return this.hoist('_s$', `(n, v) => { ${s.direct('n', 'v')}; }`);
  }

  /** One DOM write per change: direct call, `bind` for stable reads, `effect` otherwise. */
  watch(node: string, e: ts.Expression, s: Setter): string {
    const x = getterBody(e) ?? strip(e);
    if (!isDynamic(x)) return `${s.direct(node, this.expr(x))};`;
    if (isStable(x)) {
      const { read, args } = this.reader(x);
      return `${this.h('bind')}(${node}, ${read}, ${this.setterFn(s)}${args.map((a) => ', ' + a).join('')});`;
    }
    return `${this.h('effect')}(() => ${s.direct(node, this.expr(x))});`;
  }

  children(list: readonly ts.JsxChild[]): Item[] {
    const items: Item[] = [];
    const pushText = (t: string): void => {
      const last = items[items.length - 1];
      if (last && last.k === 'text') last.text += t;
      else items.push({ k: 'text', text: t });
    };
    for (const c of list) {
      if (ts.isJsxText(c)) {
        const t = cleanText(c.text);
        if (t) pushText(decodeEntities(t));
      } else if (ts.isJsxExpression(c)) {
        if (!c.expression) continue;
        const lit = literal(c.expression);
        if (lit && (typeof lit.v === 'string' || typeof lit.v === 'number')) pushText(String(lit.v));
        else if (lit && (lit.v == null || typeof lit.v === 'boolean')) continue;
        else items.push({ k: 'dyn', expr: c.expression });
      } else if ((ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) && !this.isComponentTag(c)) items.push({ k: 'el', node: c });
      else items.push({ k: 'dyn', expr: c as Jsx });
    }
    return items;
  }

  isComponentTag(n: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
    const tag = ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName;
    const name = tag.getText(this.sf);
    return /^[A-Z]/.test(name) || name.includes('.') || tag.kind === ts.SyntaxKind.ThisKeyword;
  }

  /** Value passed to `insert`: compiled JSX, a function for reactive expressions, or the value. */
  childValue(e: ts.Expression | Jsx): string {
    if (isJsx(e)) return this.jsx(e);
    const x = strip(e);
    if (isJsx(x)) return this.jsx(x);
    if (isFn(x)) return this.rewrite(x);
    if (!isDynamic(x)) return this.expr(x);
    return directRead(x) ?? `() => ${this.expr(x)}`;
  }

  // ---------------------------------------------------------------- DOM elements

  element(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
    const root: NodeRef = { parent: null, index: 0, children: [], needed: true, name: '' };
    const ops: (() => string)[] = [];
    let flags = 0;
    const tagOf = (n: ts.JsxElement | ts.JsxSelfClosingElement) => (ts.isJsxElement(n) ? n.openingElement : n).tagName.getText(this.sf);
    const rootTag = tagOf(node);
    if (SVG.has(rootTag)) flags |= 2;

    const need = (r: NodeRef): (() => string) => {
      r.needed = true;
      return () => r.name;
    };

    const build = (n: ts.JsxElement | ts.JsxSelfClosingElement, ref: NodeRef): string => {
      const tag = tagOf(n);
      const custom = tag.includes('-');
      if (custom) flags |= 1;
      const el = need.bind(null, ref);
      let html = `<${tag}`;
      const attrs = (ts.isJsxElement(n) ? n.openingElement : n).attributes.properties;
      for (const a of attrs) html += this.attribute(a, tag, custom, el, ops);
      html += '>';
      if (VOID.has(tag)) return html;
      const items = ts.isJsxElement(n) ? this.children(n.children) : [];
      let index = 0;
      const child = (): NodeRef => {
        const r: NodeRef = { parent: ref, index: index++, children: [], needed: false, name: '' };
        ref.children.push(r);
        return r;
      };
      items.forEach((it, i) => {
        if (it.k === 'text') {
          html += escText(it.text!);
          child();
        } else if (it.k === 'el') html += build(it.node!, child());
        else {
          const e = it.expr!;
          const only = items.length === 1;
          const last = i === items.length - 1;
          const parent = el();
          if (only && !isJsx(e) && isDynamic(strip(e as ts.Expression)) && this.isTextual(e as ts.Expression)) {
            html += ' ';
            const t = need(child());
            ops.push(() => this.watch(t(), e as ts.Expression, { helper: this.h('setText'), direct: (nn, v) => `${this.h('setText')}(${nn}, ${v})` }));
          } else if (only) ops.push(() => `${this.h('insert')}(${parent()}, ${this.childValue(e)});`);
          else if (last) ops.push(() => `${this.h('insert')}(${parent()}, ${this.childValue(e)}, null);`);
          else {
            html += '<!---->';
            const m = need(child());
            ops.push(() => `${this.h('insert')}(${parent()}, ${this.childValue(e)}, ${m()});`);
          }
        }
      });
      return html + `</${tag}>`;
    };

    const html = build(node, root);
    const key = `${flags}:${html}`;
    let tmpl = this.templateIds.get(key);
    if (!tmpl) {
      tmpl = `_tmpl$${++this.uid}`;
      this.templateIds.set(key, tmpl);
      this.templates.push(`const ${tmpl} = /*#__PURE__*/ ${this.h('template')}(${JSON.stringify(html)}${flags ? `, ${flags}` : ''});`);
    }
    const call = `${tmpl}()`;
    if (!ops.length) return call;

    const decls: string[] = [];
    root.name = `_el$${++this.uid}`;
    decls.push(`${root.name} = ${call}`);
    const wanted = (r: NodeRef): boolean => r.needed || r.children.some(wanted);
    const resolve = (r: NodeRef): void => {
      let prev: NodeRef | null = null;
      for (const c of r.children) {
        if (!wanted(c)) continue;
        c.name = `_el$${++this.uid}`;
        let path = prev ? prev.name : `${r.name}.firstChild`;
        for (let i = prev ? prev.index : 0; i < c.index; i++) path += '.nextSibling';
        decls.push(`${c.name} = ${path}`);
        prev = c;
        resolve(c);
      }
    };
    resolve(root);
    const body = ops.map((op) => op()).join(' ');
    return `(() => { const ${decls.join(', ')}; ${body} return ${root.name}; })()`;
  }

  attribute(a: ts.JsxAttributeLike, tag: string, custom: boolean, el: () => () => string, ops: (() => string)[]): string {
    if (ts.isJsxSpreadAttribute(a)) {
      const node = el();
      ops.push(() => `${this.h('spread')}(${node()}, ${this.rewrite(a.expression)});`);
      return '';
    }
    const ns = ts.isJsxNamespacedName(a.name) ? a.name.namespace.text : '';
    const local = ts.isJsxNamespacedName(a.name) ? a.name.name.text : a.name.text;
    const name = ns ? `${ns}:${local}` : local;
    const init = a.initializer;
    let expr: ts.Expression | null = null;
    let lit: Literal | null = null;
    if (!init) lit = { v: true };
    else if (ts.isStringLiteral(init)) lit = { v: decodeEntities(init.text) };
    else if (ts.isJsxExpression(init)) {
      if (!init.expression) return '';
      expr = init.expression;
      lit = literal(expr);
    } else expr = init as unknown as ts.Expression;

    const staticAttr = (attrName: string): string => {
      const v = lit!.v;
      if (v == null || v === false) return '';
      if (v === true) return ` ${attrName}`;
      return ` ${attrName}="${escAttr(String(v))}"`;
    };
    const op = (fn: (node: string) => string): string => {
      const node = el();
      ops.push(() => fn(node()));
      return '';
    };
    const watchAttr = (s: Setter): string => op((n) => this.watch(n, expr!, s));
    const attrSetter = (attrName: string): Setter => ({
      direct: (n, v) => `${this.h('attr')}(${n}, ${JSON.stringify(attrName)}, ${v})`,
    });
    const propSetter = (prop: string): Setter => ({
      direct: (n, v) => `${n}.${prop} = ${v}`,
    });

    if (ns === 'on') return op((n) => `${n}.addEventListener(${JSON.stringify(local)}, ${this.rewrite(expr!)});`);
    if (ns === 'attr') return lit ? staticAttr(local) : watchAttr(attrSetter(local));
    if (ns === 'prop') return lit ? op((n) => `${n}.${local} = ${litCode(lit!)};`) : op((n) => this.watch(n, expr!, propSetter(local)));
    if (ns) {
      if (lit) return staticAttr(name);
      return watchAttr({ direct: (n, v) => `${this.h('attrNS')}(${n}, ${JSON.stringify(name)}, ${v})` });
    }
    if (name === 'ref') {
      if (!expr) return '';
      return op((n) => (isFn(expr!) ? `(${this.rewrite(expr!)})(${n});` : `${this.h('use')}(${this.rewrite(expr!)}, ${n});`));
    }
    if (/^on[A-Z]/.test(name)) {
      if (!expr) return '';
      const event = name.slice(2).toLowerCase();
      if (DELEGATED.has(event)) {
        this.events.add(event);
        return op((n) => `${n}.$$${event} = ${this.rewrite(expr!)};`);
      }
      return op((n) => `${n}.addEventListener(${JSON.stringify(event)}, ${this.rewrite(expr!)});`);
    }
    if (name === 'class' || name === 'className') {
      if (lit) return staticAttr('class');
      return watchAttr({ helper: this.h('className'), direct: (n, v) => `${this.h('className')}(${n}, ${v})` });
    }
    if (name === 'style') return this.styleAttr(expr, lit, op);
    if (name === 'htmlFor') {
      if (custom) return lit ? op((n) => `${n}.htmlFor = ${litCode(lit!)};`) : op((n) => this.watch(n, expr!, propSetter('htmlFor')));
      return lit ? staticAttr('for') : watchAttr(attrSetter('for'));
    }
    if (PROPS.has(name) && !custom) {
      if (lit && PROPS_AS_ATTR.has(name)) return staticAttr(name);
      if (lit) return op((n) => `${n}.${name} = ${litCode(lit!)};`);
      return op((n) => this.watch(n, expr!, propSetter(name)));
    }
    if (custom && !name.includes('-')) {
      if (lit && (typeof lit.v === 'string' || lit.v === true)) return staticAttr(name);
      if (lit && (lit.v === false || lit.v == null)) return '';
      if (lit) return op((n) => `${n}.${name} = ${litCode(lit!)};`);
      return op((n) => this.watch(n, expr!, propSetter(name)));
    }
    if (lit) return staticAttr(name);
    return watchAttr(attrSetter(name));
  }

  styleAttr(expr: ts.Expression | null, lit: Literal | null, op: (fn: (node: string) => string) => string): string {
    if (lit) return typeof lit.v === 'string' && lit.v ? ` style="${escAttr(lit.v)}"` : '';
    const x = strip(expr!);
    if (ts.isObjectLiteralExpression(x)) {
      let css = '';
      const dyn: [string, ts.Expression][] = [];
      let simple = true;
      for (const p of x.properties) {
        if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
          simple = false;
          break;
        }
        const key = kebab(p.name.text);
        const v = literal(p.initializer);
        if (v) {
          if (v.v != null && v.v !== false) css += `${key}: ${v.v}; `;
        } else dyn.push([key, p.initializer]);
      }
      if (simple) {
        for (const [key, value] of dyn)
          op((n) => this.watch(n, value, { direct: (nn, v) => `${nn}.style.setProperty(${JSON.stringify(key)}, ${v})` }));
        css = css.trim();
        return css ? ` style="${escAttr(css)}"` : '';
      }
    }
    return op((n) => this.watch(n, expr!, { helper: this.h('style'), direct: (nn, v) => `${this.h('style')}(${nn}, ${v})` }));
  }

  // ---------------------------------------------------------------- components

  componentChildren(items: Item[]): string[] {
    return items.map((it) => {
      if (it.k === 'text') return JSON.stringify(it.text);
      if (it.k === 'el') return this.jsx(it.node!);
      const e = it.expr!;
      if (isJsx(e)) return this.jsx(e);
      const x = strip(e);
      if (isFn(x) || !isDynamic(x) || items.length === 1) return this.expr(x);
      return directRead(x) ?? `() => ${this.expr(x)}`;
    });
  }

  component(node: ts.JsxElement | ts.JsxSelfClosingElement, tag: string): string {
    if (this.ssr) return '""';
    const short = tag.split('.').pop()!;
    const provider = short === 'Provider';
    const builtin = BUILTIN.has(tag) || provider;
    const flow = FLOW.has(tag);
    const props: string[] = [];
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const thunk = (e: ts.Expression): string => (isFn(e) ? this.rewrite(e) : `() => ${this.rewrite(e)}`);
    const keyOf = (k: string): string => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

    for (const a of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(a)) {
        props.push(`...${this.rewrite(a.expression)}`);
        continue;
      }
      const name = ts.isJsxNamespacedName(a.name) ? `${a.name.namespace.text}:${a.name.name.text}` : a.name.text;
      const init = a.initializer;
      let value: string;
      let expr: ts.Expression | null = null;
      if (!init) value = 'true';
      else if (ts.isStringLiteral(init)) value = JSON.stringify(decodeEntities(init.text));
      else if (ts.isJsxExpression(init)) {
        if (!init.expression) continue;
        expr = init.expression;
        value = this.rewrite(expr);
      } else value = this.rewrite(init);
      const key = keyOf(name);
      if (!builtin) {
        props.push(`${key}: () => ${expr && isJsx(strip(expr)) ? value : expr ? `(${value})` : value}`);
        continue;
      }
      if (expr && (name === 'children' || name === 'fallback') && (flow || (provider && name === 'children'))) props.push(`${key}: ${thunk(expr)}`);
      else if (expr && name === 'when' && FLOW_WHEN.has(tag) && isDynamic(strip(expr))) props.push(`${key}: () => ${value}`);
      else if (expr && name === 'each' && tag === 'For' && isDynamic(strip(expr))) props.push(`${key}: () => ${value}`);
      else if (expr && name === 'mount' && tag === 'Portal' && isDynamic(strip(expr))) props.push(`${key}: () => ${value}`);
      else if (provider && name === 'value') props.push(`${key}: () => ${expr ? `(${value})` : value}`);
      else props.push(`${key}: ${value}`);
    }

    if (ts.isJsxElement(node)) {
      const items = this.children(node.children);
      if (items.length) {
        const only = items.length === 1 ? items[0]! : null;
        const fnChild = only && only.k === 'dyn' && !isJsx(only.expr!) && isFn(only.expr as ts.Expression);
        const values = this.componentChildren(items);
        const value = values.length === 1 ? values[0]! : `[${values.join(', ')}]`;
        if (fnChild && (builtin || tag === 'For')) props.push(`children: ${value}`);
        else if (builtin && (flow || provider)) props.push(`children: () => ${value}`);
        else if (builtin) props.push(`children: ${value}`);
        else props.push(`children: () => ${value}`);
      }
    }
    return `${this.h('createComponent')}(${tag}, { ${props.join(', ')} })`;
  }

  fragment(children: readonly ts.JsxChild[]): string {
    const items = this.children(children);
    if (this.ssr) return this.ssrConcat(this.ssrItems(items));
    const values = items.map((it) => {
      if (it.k === 'text') return JSON.stringify(it.text);
      if (it.k === 'el') return this.jsx(it.node!);
      return this.childValue(it.expr!);
    });
    if (values.length === 1) return values[0]!;
    return `[${values.join(', ')}]`;
  }

  // ---------------------------------------------------------------- SSR

  ssrConcat(parts: (string | { code: string })[]): string {
    const out: string[] = [];
    let buf = '';
    for (const p of parts) {
      if (typeof p === 'string') buf += p;
      else {
        if (buf) out.push(JSON.stringify(buf));
        buf = '';
        out.push(p.code);
      }
    }
    if (buf || !out.length) out.push(JSON.stringify(buf));
    return out.length === 1 ? out[0]! : `(${out.join(' + ')})`;
  }

  hasJsx(e: ts.Node): boolean {
    let found = false;
    const walk = (n: ts.Node): void => {
      if (found) return;
      if (isJsx(n)) found = true;
      else ts.forEachChild(n, walk);
    };
    walk(e);
    return found;
  }

  ssrItems(items: Item[]): (string | { code: string })[] {
    const parts: (string | { code: string })[] = [];
    items.forEach((it, i) => {
      if (it.k === 'text') parts.push(escText(it.text!));
      else if (it.k === 'el') parts.push(...this.ssrParts(it.node!));
      else {
        const only = items.length === 1;
        const last = i === items.length - 1;
        const e = it.expr!;
        const hole = isJsx(e) || this.hasJsx(e) || isFn(e as ts.Expression);
        if (!only && !last) parts.push('<!---->');
        else if (!hole) {
          const x = getterBody(e as ts.Expression) ?? strip(e as ts.Expression);
          const code = `${this.h('escape')}(${this.expr(x)})`;
          parts.push({ code: only && isDynamic(x) && this.isTextual(x) ? `(${code} || " ")` : code });
        }
      }
    });
    return parts;
  }

  ssrElement(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
    return this.ssrConcat(this.ssrParts(node));
  }

  ssrParts(node: ts.JsxElement | ts.JsxSelfClosingElement): (string | { code: string })[] {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tag = opening.tagName.getText(this.sf);
    const custom = tag.includes('-');
    const parts: (string | { code: string })[] = [`<${tag}`];
    for (const a of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(a)) continue;
      const ns = ts.isJsxNamespacedName(a.name) ? a.name.namespace.text : '';
      const local = ts.isJsxNamespacedName(a.name) ? a.name.name.text : a.name.text;
      if (ns === 'on' || ns === 'prop' || local === 'ref' || /^on[A-Z]/.test(local)) continue;
      let name = ns && ns !== 'attr' ? `${ns}:${local}` : local;
      if (name === 'className') name = 'class';
      if (name === 'htmlFor' && !custom) name = 'for';
      if (name === 'innerHTML' || name === 'textContent' || name === 'innerText') continue;
      const init = a.initializer;
      let expr: ts.Expression | null = null;
      let lit: Literal | null = null;
      if (!init) lit = { v: true };
      else if (ts.isStringLiteral(init)) lit = { v: decodeEntities(init.text) };
      else if (ts.isJsxExpression(init)) {
        if (!init.expression) continue;
        expr = init.expression;
        lit = literal(expr);
      } else continue;
      if (name === 'style' && expr && ts.isObjectLiteralExpression(strip(expr))) {
        let css = '';
        for (const p of (strip(expr) as ts.ObjectLiteralExpression).properties) {
          if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) continue;
          const v = literal(p.initializer);
          if (v && v.v != null && v.v !== false) css += `${kebab(p.name.text)}: ${v.v}; `;
        }
        css = css.trim();
        if (css) parts.push(` style="${escAttr(css)}"`);
        continue;
      }
      if (lit) {
        const v = lit.v;
        if (v == null || v === false) continue;
        parts.push(v === true ? ` ${name}` : ` ${name}="${escAttr(String(v))}"`);
        continue;
      }
      const x = getterBody(expr!) ?? strip(expr!);
      parts.push({ code: `${this.h('attrPart')}(${JSON.stringify(name)}, ${this.expr(x)})` });
    }
    parts.push('>');
    if (!VOID.has(tag)) {
      if (ts.isJsxElement(node)) parts.push(...this.ssrItems(this.children(node.children)));
      parts.push(`</${tag}>`);
    }
    return parts;
  }
}

const KIND = (filename: string): ts.ScriptKind => (/\.[mc]?jsx?$/.test(filename) ? ts.ScriptKind.JSX : ts.ScriptKind.TSX);

/**
 * Compiles JSX in `code` into hoisted templates and direct DOM writes (or, with
 * `generate: 'ssr'`, into string concatenation). Code without JSX returns unchanged.
 */
export function compile(code: string, options: CompileOptions = {}): CompileResult {
  if (!/<[A-Za-z>]/.test(code)) return { code, changed: false };
  const filename = options.filename ?? 'input.tsx';
  const ssr = options.generate === 'ssr';
  const moduleName = options.moduleName ?? 'surgijs';
  const unwrapped = unwrapGetterReads(code, filename);
  const src = unwrapped.code;
  const sf = ts.createSourceFile(filename, src, ts.ScriptTarget.Latest, true, KIND(filename));
  const c = new Compiler(sf, src, ssr, unwrapped.textual);

  interface Chunk {
    text: string;
    /** Offset in `src` the chunk starts from; generated chunks map every line to it. */
    at: number;
    copy: boolean;
  }
  const chunks: Chunk[] = [];
  let pos = 0;
  const find = (n: ts.Node): void => {
    if (isJsx(n)) {
      const start = n.getStart(sf);
      chunks.push({ text: src.slice(pos, start), at: pos, copy: true });
      chunks.push({ text: c.jsx(n), at: start, copy: false });
      pos = n.end;
      return;
    }
    ts.forEachChild(n, find);
  };
  find(sf);
  if (!chunks.length && !unwrapped.inserts.length) return { code, changed: false };
  chunks.push({ text: src.slice(pos), at: pos, copy: true });

  if (c.events.size) c.h('delegate');
  const head: string[] = [];
  if (c.helpers.size) {
    const names = [...c.helpers].map(([name, alias]) => `${name} as ${alias}`).join(', ');
    head.push(`import { ${names} } from ${JSON.stringify(ssr ? `${moduleName}/server` : moduleName)};`);
  }
  head.push(...c.templates, ...c.hoistedLines);
  const prefix = head.length ? head.join('\n') + '\n' : '';
  const body = chunks.map((ch) => ch.text).join('');
  const suffix = c.events.size ? `\n_$delegate(${JSON.stringify([...c.events])});\n` : '';
  const out = prefix + body + suffix;

  const result: CompileResult = { code: out, changed: true };
  if (options.sourceMap === false) return result;

  const origStarts = lineStarts(code);
  const lines: ([number, number] | null)[] = [];
  const prefixLines = prefix.split('\n').length - 1;
  for (let i = 0; i < prefixLines; i++) lines.push(null);
  let atLineStart = true;
  for (const ch of chunks) {
    for (let i = 0; i <= ch.text.length; i++) {
      if (atLineStart && i < ch.text.length) {
        const srcPos = ch.copy ? ch.at + i : ch.at;
        lines.push(lineCol(origStarts, toOriginal(srcPos, unwrapped.inserts)));
        atLineStart = false;
      }
      if (i < ch.text.length && ch.text.charCodeAt(i) === 10) atLineStart = true;
    }
  }
  result.map = encodeMap(filename, code, lines);
  return result;
}
