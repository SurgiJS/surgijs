import type { Expression, JSXAttribute, JSXAttributeItem, JSXChild, JSXElement, JSXFragment } from 'oxc-parser';
import { forEachChild, parse, type FunctionNode, type Node, type NodeOf } from './ast.ts';
import { encodeMap, lineCol, lineStarts } from './map.ts';
import { toOriginal, unwrapGetterReads } from './values.ts';

export { unwrapGetterReads, GETTER_FNS, toOriginal, type Insert, type UnwrapResult } from './values.ts';

export interface CompileOptions {
  filename?: string;
  /** Runtime module the output imports from. `@surgijs/core` by default; SSR uses `<moduleName>/server`. */
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

type Jsx = JSXElement | JSXFragment;

/** A piece of server output: static HTML, or a code expression. */
type SsrPart = string | { code: string };

const isJsx = (n: Node): n is Jsx => n.type === 'JSXElement' || n.type === 'JSXFragment';

const isComponentName = (name: string): boolean => /^[A-Z]/.test(name) || name.includes('.') || name === 'this';

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

const strip = (e: Expression): Expression => {
  while (e.type === 'ParenthesizedExpression') e = e.expression;
  return e;
};

/** Expressions that change meaning without parentheses inside an argument list or an arrow body. */
const needsParens = (x: Expression): boolean => x.type === 'ObjectExpression' || x.type === 'SequenceExpression';

const isFn = (e: Expression): e is FunctionNode => {
  const x = strip(e);
  return x.type === 'ArrowFunctionExpression' || x.type === 'FunctionExpression';
};

/** Zero-parameter arrow with an expression body: `() => c()`. */
function getterBody(e: Expression): Expression | null {
  const x = strip(e);
  if (x.type === 'ArrowFunctionExpression' && x.params.length === 0 && x.body.type !== 'BlockStatement') return x.body as Expression;
  return null;
}

type Literal = { v: string | number | boolean | null | undefined };

function literal(e: Expression): Literal | null {
  const x = strip(e);
  if (x.type === 'TemplateLiteral') return x.expressions.length === 0 ? { v: x.quasis[0]!.value.cooked ?? '' } : null;
  if (x.type === 'Literal') {
    const v = x.value;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) return { v };
    return null;
  }
  if (x.type === 'UnaryExpression' && x.operator === '-' && x.argument.type === 'Literal' && typeof x.argument.value === 'number')
    return { v: -x.argument.value };
  if (x.type === 'Identifier' && x.name === 'undefined') return { v: undefined };
  return null;
}

const litCode = (l: Literal): string => (l.v === undefined ? 'undefined' : JSON.stringify(l.v));

const propName = (key: Node): string | null => {
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return null;
};

/** Contains a call evaluated together with the expression (nested functions and JSX excluded). */
function isDynamic(e: Node): boolean {
  let found = false;
  const walk = (n: Node): void => {
    if (found || isJsx(n) || isFunctionNode(n)) return;
    if (n.type === 'CallExpression' || n.type === 'TaggedTemplateExpression') {
      found = true;
      return;
    }
    forEachChild(n, walk);
  };
  walk(e);
  return found;
}

const isFunctionNode = (n: Node): boolean =>
  n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' ||
  n.type === 'TSDeclareFunction' || n.type === 'TSEmptyBodyFunctionExpression';

function hasCall(e: Node): boolean {
  let found = false;
  const walk = (n: Node): void => {
    if (found) return;
    if (n.type === 'CallExpression' || n.type === 'TaggedTemplateExpression') found = true;
    else forEachChild(n, walk);
  };
  walk(e);
  return found;
}

/** Every call runs on every evaluation, so the first run sees all dependencies. */
function isStable(e: Node): boolean {
  let ok = true;
  const walk = (n: Node): void => {
    if (!ok) return;
    if (n.type === 'ConditionalExpression') {
      walk(n.test);
      if (hasCall(n.consequent) || hasCall(n.alternate)) ok = false;
      return;
    }
    if (n.type === 'LogicalExpression') {
      walk(n.left);
      if (hasCall(n.right)) ok = false;
      return;
    }
    if (n.type === 'ChainExpression') {
      if (hasCall(n)) ok = false;
      return;
    }
    if (isFunctionNode(n) || isJsx(n)) {
      if (hasCall(n)) ok = false;
      return;
    }
    forEachChild(n, walk);
  };
  walk(e);
  return ok;
}

/** `name()` with an identifier callee and no arguments. */
function directRead(e: Expression): string | null {
  const x = strip(e);
  if (x.type === 'CallExpression' && !x.arguments.length && x.callee.type === 'Identifier' && !x.optional) return x.callee.name;
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
  node?: JSXElement;
  expr?: Expression | Jsx;
}

interface Setter {
  helper?: string;
  direct: (node: string, value: string) => string;
  hoist?: string;
}

const attrName = (a: JSXAttribute): { ns: string; local: string } =>
  a.name.type === 'JSXNamespacedName' ? { ns: a.name.namespace.name, local: a.name.name.name } : { ns: '', local: a.name.name };

class Compiler {
  readonly helpers = new Map<string, string>();
  readonly templates: string[] = [];
  readonly templateIds = new Map<string, string>();
  readonly hoisted = new Map<string, string>();
  readonly hoistedLines: string[] = [];
  readonly events = new Set<string>();
  uid = 0;

  readonly src: string;
  readonly ssr: boolean;
  readonly textual: ReadonlySet<string>;

  constructor(src: string, ssr: boolean, textual: ReadonlySet<string>) {
    this.src = src;
    this.ssr = ssr;
    this.textual = textual;
  }

  h(name: string): string {
    let alias = this.helpers.get(name);
    if (!alias) this.helpers.set(name, (alias = `_$${name}`));
    return alias;
  }

  text(n: Node): string {
    return this.src.slice(n.start, n.end);
  }

  /** Raw content of a JSX string attribute, entities decoded. */
  attrString(init: Node): string {
    return decodeEntities(this.src.slice(init.start + 1, init.end - 1));
  }

  /** `rewrite(x)` for an expression placed in an argument list, an assignment or an arrow body. */
  expr(x: Expression): string {
    const code = this.rewrite(x);
    return needsParens(x) ? `(${code})` : code;
  }

  /** Source text of `node` with nested JSX compiled. */
  rewrite(node: Node): string {
    if (isJsx(node)) return this.jsx(node);
    let out = '';
    let pos = node.start;
    const walk = (n: Node): void => {
      if (isJsx(n)) {
        out += this.src.slice(pos, n.start) + this.jsx(n);
        pos = n.end;
        return;
      }
      forEachChild(n, walk);
    };
    forEachChild(node, walk);
    return out + this.src.slice(pos, node.end);
  }

  jsx(node: Jsx): string {
    if (node.type === 'JSXFragment') return this.fragment(node.children);
    const name = this.tagName(node);
    if (isComponentName(name)) return this.component(node, name);
    return this.ssr ? this.ssrElement(node) : this.element(node);
  }

  tagName(node: JSXElement): string {
    return this.text(node.openingElement.name);
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

  isTextual(e: Expression): boolean {
    const x = strip(e);
    if (x.type === 'TemplateLiteral') return true;
    if (x.type === 'Literal') return typeof x.value === 'string' || typeof x.value === 'number';
    if (x.type === 'UnaryExpression') return x.operator === '-' || x.operator === '+';
    if (x.type === 'BinaryExpression') {
      const op = x.operator;
      return (
        op === '-' || op === '*' || op === '/' || op === '%' || op === '**' ||
        (op === '+' && (this.isTextual(x.left) || this.isTextual(x.right)))
      );
    }
    if (x.type === 'ConditionalExpression') return this.isTextual(x.consequent) && this.isTextual(x.alternate);
    if (x.type === 'MemberExpression' && !('computed' in x && x.computed) && x.property.type === 'Identifier') return x.property.name === 'length';
    if (x.type === 'CallExpression') {
      const c = x.callee;
      if (c.type === 'Identifier') return (!x.arguments.length && this.textual.has(c.name)) || c.name === 'String' || c.name === 'Number';
      if (c.type === 'MemberExpression' && !('computed' in c && c.computed) && c.property.type === 'Identifier') return TEXT_METHODS.has(c.property.name);
    }
    return false;
  }

  /** Reader for `bind`: a direct getter, a hoisted module-level function, or a closure. */
  reader(e: Expression): { read: string; args: string[] } {
    const direct = directRead(e);
    if (direct) return { read: direct, args: [] };
    const x = strip(e);
    const start = x.start;
    const params = new Map<string, string>();
    const edits: [number, number, string][] = [];
    let ok = true;
    const walk = (n: Node, p: Node | undefined): void => {
      if (!ok) return;
      if (n.type === 'Identifier') {
        if (p?.type === 'MemberExpression' && p.property === n && !('computed' in p && p.computed)) return;
        if (p?.type === 'CallExpression' && p.callee === n && !p.arguments.length) {
          let name = params.get(n.name);
          if (!name) params.set(n.name, (name = `p${params.size}`));
          edits.push([n.start - start, n.end - start, name]);
          return;
        }
        ok = false;
        return;
      }
      if (n.type === 'ThisExpression' || isFunctionNode(n) || isJsx(n) || n.type === 'NewExpression' || n.type === 'ObjectExpression') {
        ok = false;
        return;
      }
      forEachChild(n, (c) => walk(c, n));
    };
    walk(x, undefined);
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
  watch(node: string, e: Expression, s: Setter): string {
    const x = getterBody(e) ?? strip(e);
    if (!isDynamic(x)) return `${s.direct(node, this.expr(x))};`;
    if (isStable(x)) {
      const { read, args } = this.reader(x);
      return `${this.h('bind')}(${node}, ${read}, ${this.setterFn(s)}${args.map((a) => ', ' + a).join('')});`;
    }
    return `${this.h('effect')}(() => ${s.direct(node, this.expr(x))});`;
  }

  children(list: readonly JSXChild[]): Item[] {
    const items: Item[] = [];
    const pushText = (t: string): void => {
      const last = items[items.length - 1];
      if (last && last.k === 'text') last.text += t;
      else items.push({ k: 'text', text: t });
    };
    for (const c of list) {
      if (c.type === 'JSXText') {
        const t = cleanText(this.text(c));
        if (t) pushText(decodeEntities(t));
      } else if (c.type === 'JSXExpressionContainer') {
        if (c.expression.type === 'JSXEmptyExpression') continue;
        const lit = literal(c.expression);
        if (lit && (typeof lit.v === 'string' || typeof lit.v === 'number')) pushText(String(lit.v));
        else if (lit && (lit.v == null || typeof lit.v === 'boolean')) continue;
        else items.push({ k: 'dyn', expr: c.expression });
      } else if (c.type === 'JSXElement' && !this.isComponentTag(c)) items.push({ k: 'el', node: c });
      else items.push({ k: 'dyn', expr: c as Jsx });
    }
    return items;
  }

  isComponentTag(n: JSXElement): boolean {
    return isComponentName(this.tagName(n));
  }

  /** Value passed to `insert`: compiled JSX, a function for reactive expressions, or the value. */
  childValue(e: Expression | Jsx): string {
    if (isJsx(e)) return this.jsx(e);
    const x = strip(e);
    if (isJsx(x)) return this.jsx(x);
    if (isFn(x)) return this.rewrite(x);
    if (!isDynamic(x)) return this.expr(x);
    return directRead(x) ?? `() => ${this.expr(x)}`;
  }

  // ---------------------------------------------------------------- DOM elements

  element(node: JSXElement): string {
    const root: NodeRef = { parent: null, index: 0, children: [], needed: true, name: '' };
    const ops: (() => string)[] = [];
    let flags = 0;
    const rootTag = this.tagName(node);
    if (SVG.has(rootTag)) flags |= 2;

    const need = (r: NodeRef): (() => string) => {
      r.needed = true;
      return () => r.name;
    };

    const build = (n: JSXElement, ref: NodeRef): string => {
      const tag = this.tagName(n);
      const custom = tag.includes('-');
      if (custom) flags |= 1;
      const el = need.bind(null, ref);
      let html = `<${tag}`;
      for (const a of n.openingElement.attributes) html += this.attribute(a, tag, custom, el, ops);
      html += '>';
      if (VOID.has(tag)) return html;
      const items = this.children(n.children);
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
          if (only && !isJsx(e) && isDynamic(strip(e as Expression)) && this.isTextual(e as Expression)) {
            html += ' ';
            const t = need(child());
            ops.push(() => this.watch(t(), e as Expression, { helper: this.h('setText'), direct: (nn, v) => `${this.h('setText')}(${nn}, ${v})` }));
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

  attribute(a: JSXAttributeItem, tag: string, custom: boolean, el: () => () => string, ops: (() => string)[]): string {
    if (a.type === 'JSXSpreadAttribute') {
      const node = el();
      ops.push(() => `${this.h('spread')}(${node()}, ${this.rewrite(a.argument)});`);
      return '';
    }
    const { ns, local } = attrName(a);
    const name = ns ? `${ns}:${local}` : local;
    const init = a.value;
    let expr: Expression | null = null;
    let lit: Literal | null = null;
    if (!init) lit = { v: true };
    else if (init.type === 'Literal') lit = { v: this.attrString(init) };
    else if (init.type === 'JSXExpressionContainer') {
      if (init.expression.type === 'JSXEmptyExpression') return '';
      expr = init.expression;
      lit = literal(expr);
    } else expr = init;

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

  styleAttr(expr: Expression | null, lit: Literal | null, op: (fn: (node: string) => string) => string): string {
    if (lit) return typeof lit.v === 'string' && lit.v ? ` style="${escAttr(lit.v)}"` : '';
    const x = strip(expr!);
    if (x.type === 'ObjectExpression') {
      let css = '';
      const dyn: [string, Expression][] = [];
      let simple = true;
      for (const p of x.properties) {
        if (p.type !== 'Property' || p.kind !== 'init' || p.method || p.shorthand || p.computed) {
          simple = false;
          break;
        }
        const name = propName(p.key);
        if (name === null) {
          simple = false;
          break;
        }
        const key = kebab(name);
        const v = literal(p.value);
        if (v) {
          if (v.v != null && v.v !== false) css += `${key}: ${v.v}; `;
        } else dyn.push([key, p.value]);
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
    if (this.ssr) {
      return items.map((it) => {
        if (it.k === 'text') return `${this.h('element')}([${JSON.stringify(escText(it.text!))}])`;
        if (it.k === 'el') return this.jsx(it.node!);
        const e = it.expr!;
        if (isJsx(e)) return this.jsx(e);
        const x = strip(e);
        if (isFn(x)) return this.expr(x);
        return `${this.h('text')}(${this.expr(x)})`;
      });
    }
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

  component(node: JSXElement, tag: string): string {
    const short = tag.split('.').pop()!;
    const provider = short === 'Provider';
    const builtin = BUILTIN.has(tag) || provider;
    const flow = FLOW.has(tag);
    const props: string[] = [];
    const thunk = (e: Expression): string => (isFn(e) ? this.rewrite(e) : `() => ${this.rewrite(e)}`);
    const keyOf = (k: string): string => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

    for (const a of node.openingElement.attributes) {
      if (a.type === 'JSXSpreadAttribute') {
        props.push(`...${this.rewrite(a.argument)}`);
        continue;
      }
      const { ns, local } = attrName(a);
      const name = ns ? `${ns}:${local}` : local;
      const init = a.value;
      let value: string;
      let expr: Expression | null = null;
      if (!init) value = 'true';
      else if (init.type === 'Literal') value = JSON.stringify(this.attrString(init));
      else if (init.type === 'JSXExpressionContainer') {
        if (init.expression.type === 'JSXEmptyExpression') continue;
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

    const items = this.children(node.children);
    if (items.length) {
      const only = items.length === 1 ? items[0]! : null;
      const fnChild = only && only.k === 'dyn' && !isJsx(only.expr!) && isFn(only.expr as Expression);
      const values = this.componentChildren(items);
      const value = values.length === 1 ? values[0]! : `[${values.join(', ')}]`;
      if (fnChild && (builtin || tag === 'For')) props.push(`children: ${value}`);
      else if (builtin && (flow || provider)) props.push(`children: () => ${value}`);
      else if (builtin) props.push(`children: ${value}`);
      else props.push(`children: () => ${value}`);
    }
    if (this.ssr) return `${this.h('component')}(${BUILTIN.has(tag) ? this.h(tag) : tag}, { ${props.join(', ')} })`;
    return `${this.h('createComponent')}(${tag}, { ${props.join(', ')} })`;
  }

  fragment(children: readonly JSXChild[]): string {
    const items = this.children(children);
    if (this.ssr) return this.ssrNode(this.ssrItems(items));
    const values = items.map((it) => {
      if (it.k === 'text') return JSON.stringify(it.text);
      if (it.k === 'el') return this.jsx(it.node!);
      return this.childValue(it.expr!);
    });
    if (values.length === 1) return values[0]!;
    return `[${values.join(', ')}]`;
  }

  // ---------------------------------------------------------------- SSR

  /**
   * `element([...])`: a string part is HTML already, a `{ code }` part evaluates to an attribute
   * string, a text hole (`text(value)`), a nested component thunk or a child element.
   */
  ssrNode(parts: SsrPart[]): string {
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
    return `${this.h('element')}([${out.join(', ')}])`;
  }

  ssrItems(items: Item[]): SsrPart[] {
    const parts: SsrPart[] = [];
    const only = items.length === 1;
    items.forEach((it, i) => {
      if (it.k === 'text') {
        parts.push(escText(it.text!));
        return;
      }
      if (it.k === 'el') {
        parts.push(...this.ssrParts(it.node!));
        return;
      }
      const e = it.expr!;
      if (isJsx(e)) parts.push({ code: this.jsx(e) });
      else {
        const x = getterBody(e as Expression) ?? strip(e as Expression);
        const code = `${this.h('text')}(${this.expr(x)})`;
        parts.push({ code: only && isDynamic(x) && this.isTextual(x) ? `(${code} || " ")` : code });
      }
      if (i < items.length - 1) parts.push('<!---->');
    });
    return parts;
  }

  ssrElement(node: JSXElement): string {
    return this.ssrNode(this.ssrParts(node));
  }

  ssrParts(node: JSXElement): SsrPart[] {
    const opening = node.openingElement;
    const tag = this.tagName(node);
    const custom = tag.includes('-');
    const parts: SsrPart[] = [`<${tag}`];
    for (const a of opening.attributes) {
      if (a.type === 'JSXSpreadAttribute') continue;
      const { ns, local } = attrName(a);
      if (ns === 'on' || ns === 'prop' || local === 'ref' || /^on[A-Z]/.test(local)) continue;
      let name = ns && ns !== 'attr' ? `${ns}:${local}` : local;
      if (name === 'className') name = 'class';
      if (name === 'htmlFor' && !custom) name = 'for';
      if (name === 'innerHTML' || name === 'textContent' || name === 'innerText') continue;
      const init = a.value;
      let expr: Expression | null = null;
      let lit: Literal | null = null;
      if (!init) lit = { v: true };
      else if (init.type === 'Literal') lit = { v: this.attrString(init) };
      else if (init.type === 'JSXExpressionContainer') {
        if (init.expression.type === 'JSXEmptyExpression') continue;
        expr = init.expression;
        lit = literal(expr);
      } else continue;
      if (name === 'style' && expr && strip(expr).type === 'ObjectExpression') {
        let css = '';
        for (const p of (strip(expr) as Extract<Expression, { type: 'ObjectExpression' }>).properties) {
          if (p.type !== 'Property' || p.computed) continue;
          const pn = propName(p.key);
          if (pn === null) continue;
          const v = literal(p.value);
          if (v && v.v != null && v.v !== false) css += `${kebab(pn)}: ${v.v}; `;
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
      parts.push(...this.ssrItems(this.children(node.children)));
      parts.push(`</${tag}>`);
    }
    return parts;
  }
}

/**
 * Compiles JSX in `code` into hoisted templates and direct DOM writes (or, with
 * `generate: 'ssr'`, into string concatenation). Code without JSX returns unchanged.
 */
export function compile(code: string, options: CompileOptions = {}): CompileResult {
  if (!/<[A-Za-z>]/.test(code)) return { code, changed: false };
  const filename = options.filename ?? 'input.tsx';
  const ssr = options.generate === 'ssr';
  const moduleName = options.moduleName ?? '@surgijs/core';
  const unwrapped = unwrapGetterReads(code, filename);
  const src = unwrapped.code;
  const program = parse(filename, src);
  const c = new Compiler(src, ssr, unwrapped.textual);

  interface Chunk {
    text: string;
    /** Offset in `src` the chunk starts from; generated chunks map every line to it. */
    at: number;
    copy: boolean;
  }
  const chunks: Chunk[] = [];
  let pos = 0;
  const find = (n: Node): void => {
    if (isJsx(n)) {
      chunks.push({ text: src.slice(pos, n.start), at: pos, copy: true });
      chunks.push({ text: c.jsx(n), at: n.start, copy: false });
      pos = n.end;
      return;
    }
    forEachChild(n, find);
  };
  find(program);
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
