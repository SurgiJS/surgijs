import { forEachChild, parse, type FunctionNode, type Node, type NodeOf } from './ast.ts';
import type { CallExpression, Expression, ObjectPattern, ParamPattern, Statement, VariableDeclarator } from 'oxc-parser';

type Identifier = NodeOf<'Identifier'>;
type Fn = FunctionNode;

/** Calls whose result (or first tuple element) is a getter read as a value. */
export const GETTER_FNS: ReadonlySet<string> = new Set(['useState', 'useReducer', 'createSignal', 'createMemo', 'useMemo', 'useContext']);
const TUPLE_FNS = new Set(['useState', 'useReducer', 'createSignal']);
const PROPS_TYPE = /(^|\.)ReactiveProps$/;

export interface Insert {
  /** Offset in the original text. */
  pos: number;
  text: string;
}

export interface UnwrapResult {
  code: string;
  /** Insertions in ascending order of `pos`. */
  inserts: Insert[];
  /** Getter names whose signal starts from a string or number. */
  textual: Set<string>;
  /** Shorthand properties `{ name }` that the rewrite turned into `name: name()`. */
  shorthand: ShorthandRead[];
}

export interface ShorthandRead {
  name: string;
  /** Offset of the property in the original text. */
  pos: number;
}

const Kind = { Plain: 0, Getter: 1, Bag: 2 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

class Scope {
  readonly vars = new Map<string, Kind>();
  readonly parent: Scope | null;
  constructor(parent: Scope | null) {
    this.parent = parent;
  }
  lookup(name: string): Kind {
    for (let s: Scope | null = this; s; s = s.parent) {
      const k = s.vars.get(name);
      if (k !== undefined) return k;
    }
    return Kind.Plain;
  }
}

const isFunctionLike = (n: Node): n is Fn =>
  n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' ||
  n.type === 'TSDeclareFunction' || n.type === 'TSEmptyBodyFunctionExpression';

const unwrap = (e: Expression): Expression => {
  while (
    e.type === 'ParenthesizedExpression' || e.type === 'TSAsExpression' ||
    e.type === 'TSSatisfiesExpression' || e.type === 'TSNonNullExpression'
  )
    e = e.expression;
  return e;
};

function isTextualInit(call: CallExpression): boolean {
  const t = call.typeArguments?.params[0];
  if (t) {
    const kinds = t.type === 'TSUnionType' ? t.types : [t];
    return kinds.every(
      (k) =>
        k.type === 'TSStringKeyword' ||
        k.type === 'TSNumberKeyword' ||
        (k.type === 'TSLiteralType' &&
          k.literal.type === 'Literal' &&
          (typeof k.literal.value === 'string' || typeof k.literal.value === 'number')),
    );
  }
  const a = call.arguments[0];
  if (!a || a.type === 'SpreadElement') return false;
  const e = unwrap(a);
  if (e.type === 'TemplateLiteral') return true;
  if (e.type === 'Literal') return typeof e.value === 'string' || typeof e.value === 'number';
  if (e.type === 'UnaryExpression') return e.argument.type === 'Literal' && typeof e.argument.value === 'number';
  return e.type === 'CallExpression' && e.callee.type === 'Identifier' && (e.callee.name === 'String' || e.callee.name === 'Number');
}

const ASSIGNMENT_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&&=', '||=', '??=']);

function isWriteTarget(node: Node, p: Node | undefined): boolean {
  if (!p) return false;
  if (p.type === 'AssignmentExpression' && p.left === node && ASSIGNMENT_OPS.has(p.operator)) return true;
  return p.type === 'UpdateExpression';
}

/** Whether `id` is a value read (declarations, property names and JSX names are not). */
function isRead(id: Identifier, p: Node | undefined): boolean {
  if (!p) return true;
  switch (p.type) {
    case 'MemberExpression':
      if (!('computed' in p && p.computed)) return p.object === id;
      break;
    case 'Property':
      if (p.value === id || (!p.computed && p.key === id)) return false;
      break;
    case 'AssignmentPattern':
      return p.right === id;
    case 'VariableDeclarator':
      return p.init === id;
    case 'PropertyDefinition':
      if (p.key === id) return false;
      return p.value === id;
    case 'TSEnumMember':
      return p.initializer === id;
    case 'ArrowFunctionExpression':
      return !p.params.includes(id as ParamPattern);
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression':
    case 'MethodDefinition':
    case 'CatchClause':
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'ExportSpecifier':
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'MetaProperty':
      return false;
    default:
      break;
  }
  return !isWriteTarget(id, p);
}

function bindingNames(name: Node, out: Identifier[] = []): Identifier[] {
  switch (name.type) {
    case 'Identifier':
      out.push(name);
      break;
    case 'ObjectPattern':
      for (const p of name.properties) bindingNames(p.type === 'Property' ? p.value : p.argument, out);
      break;
    case 'ArrayPattern':
      for (const el of name.elements) if (el) bindingNames(el, out);
      break;
    case 'AssignmentPattern':
      bindingNames(name.left, out);
      break;
    case 'RestElement':
      bindingNames(name.argument, out);
      break;
    default:
      break;
  }
  return out;
}

/** Type nodes are skipped by the walk. Expressions and declarations that live under the `TS` prefix are not. */
const TS_NOT_TYPE = new Set([
  'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion', 'TSInstantiationExpression',
  'TSEnumDeclaration', 'TSEnumBody', 'TSEnumMember', 'TSModuleDeclaration', 'TSModuleBlock', 'TSParameterProperty',
  'TSImportEqualsDeclaration', 'TSExportAssignment', 'TSNamespaceExportDeclaration', 'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression',
]);

const isTypeNode = (n: Node): boolean => n.type.startsWith('TS') && !TS_NOT_TYPE.has(n.type);

/**
 * Appends `()` to reads of getters: names from `useState`/`createSignal` tuples,
 * `createMemo`/`useMemo`/`useContext`, and props destructured from a `ReactiveProps`
 * bag. `props.title` becomes `props.title()`.
 */
export function unwrapGetterReads(code: string, filename = 'input.tsx'): UnwrapResult {
  const program = parse(filename, code);
  const plainJs = /\.[mc]?jsx?$/.test(filename);
  const inserts: Insert[] = [];
  const textual = new Set<string>();
  const shorthand: ShorthandRead[] = [];

  const declareBinding = (scope: Scope, decl: VariableDeclarator): void => {
    const init = decl.init && unwrap(decl.init);
    for (const n of bindingNames(decl.id)) scope.vars.set(n.name, Kind.Plain);
    if (!init) return;
    if (init.type === 'CallExpression' && init.callee.type === 'Identifier' && GETTER_FNS.has(init.callee.name)) {
      const fn = init.callee.name;
      if (TUPLE_FNS.has(fn)) {
        if (decl.id.type === 'ArrayPattern') {
          const first = decl.id.elements[0];
          const target = first?.type === 'AssignmentPattern' ? first.left : first;
          if (target?.type === 'Identifier') {
            scope.vars.set(target.name, Kind.Getter);
            if (isTextualInit(init)) textual.add(target.name);
          }
        }
      } else if (decl.id.type === 'Identifier') scope.vars.set(decl.id.name, Kind.Getter);
      return;
    }
    if (init.type === 'Identifier' && scope.lookup(init.name) === Kind.Bag) {
      if (decl.id.type === 'Identifier') scope.vars.set(decl.id.name, Kind.Bag);
      else if (decl.id.type === 'ObjectPattern') declareBag(scope, decl.id);
    }
  };

  const declareBag = (scope: Scope, pattern: ObjectPattern): void => {
    for (const p of pattern.properties) {
      if (p.type === 'RestElement') {
        if (p.argument.type === 'Identifier') scope.vars.set(p.argument.name, Kind.Bag);
        continue;
      }
      const target = p.value.type === 'AssignmentPattern' ? p.value.left : p.value;
      if (target.type === 'Identifier') scope.vars.set(target.name, Kind.Getter);
    }
  };

  const declareStatements = (scope: Scope, statements: readonly Statement[]): void => {
    for (const st of statements) {
      const decl = st.type === 'ExportNamedDeclaration' || st.type === 'ExportDefaultDeclaration' ? st.declaration : st;
      if (!decl) continue;
      if (decl.type === 'VariableDeclaration') for (const d of decl.declarations) declareBinding(scope, d);
      else if (
        (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration' || decl.type === 'TSEnumDeclaration') &&
        decl.id
      )
        scope.vars.set(decl.id.name, Kind.Plain);
      else if (decl.type === 'ImportDeclaration') {
        for (const s of decl.specifiers ?? []) scope.vars.set(s.local.name, Kind.Plain);
      }
    }
  };

  const typeAnnotationOf = (id: Node): Node | null => {
    const ann = (id as { typeAnnotation?: { typeAnnotation?: Node } | null }).typeAnnotation;
    return ann?.typeAnnotation ?? null;
  };

  const isPropsParam = (fn: Fn, fnParent: Node | undefined, p: ParamPattern): boolean => {
    if (fn.params[0] !== p) return false;
    const id: Node = p.type === 'AssignmentPattern' ? p.left : p;
    const t = typeAnnotationOf(id);
    if (t && t.type === 'TSTypeReference') return PROPS_TYPE.test(code.slice(t.typeName.start, t.typeName.end));
    if (t) return false;
    const call = fnParent;
    if (call?.type === 'CallExpression' && call.callee.type === 'Identifier' && call.callee.name === 'defineComponent' && call.arguments[1] === fn)
      return true;
    return plainJs && id.type === 'Identifier' && id.name === 'props';
  };

  const declareParams = (scope: Scope, fn: Fn, fnParent: Node | undefined): void => {
    for (const p of fn.params) {
      for (const n of bindingNames(p)) scope.vars.set(n.name, Kind.Plain);
      if (!isPropsParam(fn, fnParent, p)) continue;
      const id = p.type === 'AssignmentPattern' ? p.left : p;
      if (id.type === 'Identifier') scope.vars.set(id.name, Kind.Bag);
      else if (id.type === 'ObjectPattern') declareBag(scope, id);
    }
  };

  /** `parent` is the node's parent in the AST; the walk passes it down because the AST has no parent links. */
  const visit = (node: Node, parent: Node | undefined, scope: Scope): void => {
    if (isTypeNode(node) || node.type === 'TSInterfaceDeclaration' || node.type === 'TSTypeAliasDeclaration') return;
    if (node.type === 'ImportDeclaration') return;

    if (node.type === 'Property' && parent?.type === 'ObjectExpression') {
      if (node.computed) visit(node.key, node, scope);
      const v = node.value;
      if (v.type === 'Identifier') {
        if (scope.lookup(v.name) === Kind.Getter) {
          inserts.push({ pos: v.end, text: node.shorthand ? `: ${v.name}()` : '()' });
          if (node.shorthand) shorthand.push({ name: v.name, pos: v.start });
        }
      } else visit(v, node, scope);
      return;
    }

    if (node.type === 'Identifier') {
      if (scope.lookup(node.name) !== Kind.Getter) return;
      if (!isRead(node, parent)) return;
      const call = parent?.type === 'CallExpression' && parent.callee === node ? parent : null;
      if (call && call.arguments.length === 0) return;
      inserts.push({ pos: node.end, text: '()' });
      return;
    }

    if (node.type === 'MemberExpression' && !('computed' in node && node.computed) && node.object.type === 'Identifier' && scope.lookup(node.object.name) === Kind.Bag) {
      const call = parent?.type === 'CallExpression' && parent.callee === node ? parent : null;
      if (!(call && call.arguments.length === 0) && !isWriteTarget(node, parent)) inserts.push({ pos: node.end, text: '()' });
      return;
    }

    if (isFunctionLike(node)) {
      const inner = new Scope(scope);
      if (node.type === 'FunctionExpression' && node.id) inner.vars.set(node.id.name, Kind.Plain);
      declareParams(inner, node, parent);
      for (const p of node.params) visitPattern(p, node, inner);
      const body = (node as { body?: Node | null }).body;
      if (!body) return;
      if (body.type === 'BlockStatement') {
        declareStatements(inner, body.body);
        for (const st of body.body) visit(st, body, inner);
      } else visit(body, node, inner);
      return;
    }

    if (node.type === 'BlockStatement') {
      const inner = new Scope(scope);
      declareStatements(inner, node.body);
      for (const st of node.body) visit(st, node, inner);
      return;
    }

    if (node.type === 'SwitchStatement') {
      visit(node.discriminant, node, scope);
      const inner = new Scope(scope);
      for (const c of node.cases) declareStatements(inner, c.consequent);
      for (const c of node.cases) {
        if (c.test) visit(c.test, c, inner);
        for (const st of c.consequent) visit(st, c, inner);
      }
      return;
    }

    if (node.type === 'ForStatement' || node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
      const inner = new Scope(scope);
      const init = node.type === 'ForStatement' ? node.init : node.left;
      if (init?.type === 'VariableDeclaration')
        for (const d of init.declarations) for (const n of bindingNames(d.id)) inner.vars.set(n.name, Kind.Plain);
      forEachChild(node, (c) => visit(c, node, inner));
      return;
    }

    if (node.type === 'CatchClause') {
      const inner = new Scope(scope);
      if (node.param) for (const n of bindingNames(node.param)) inner.vars.set(n.name, Kind.Plain);
      visit(node.body, node, inner);
      return;
    }

    if (node.type === 'VariableDeclarator') {
      visitPattern(node.id, node, scope);
      if (node.init) visit(node.init, node, scope);
      return;
    }

    forEachChild(node, (c) => visit(c, node, scope));
  };

  const visitPattern = (name: Node, parent: Node, scope: Scope): void => {
    switch (name.type) {
      case 'Identifier':
        return;
      case 'ObjectPattern':
        for (const p of name.properties) {
          if (p.type === 'RestElement') visitPattern(p.argument, p, scope);
          else {
            if (p.computed) visit(p.key, p, scope);
            visitPattern(p.value, p, scope);
          }
        }
        return;
      case 'ArrayPattern':
        for (const el of name.elements) if (el) visitPattern(el, name, scope);
        return;
      case 'AssignmentPattern':
        visit(name.right, name, scope);
        visitPattern(name.left, name, scope);
        return;
      case 'RestElement':
        visitPattern(name.argument, name, scope);
        return;
      default:
        visit(name, parent, scope);
    }
  };

  const top = new Scope(null);
  declareStatements(top, program.body);
  for (const st of program.body) visit(st, undefined, top);

  if (!inserts.length) return { code, inserts, textual, shorthand };
  inserts.sort((a, b) => a.pos - b.pos);
  let out = '';
  let last = 0;
  for (const ins of inserts) {
    out += code.slice(last, ins.pos) + ins.text;
    last = ins.pos;
  }
  out += code.slice(last);
  return { code: out, inserts, textual, shorthand };
}

/** Maps an offset in unwrapped code back to the original text. */
export function toOriginal(pos: number, inserts: readonly Insert[]): number {
  let shift = 0;
  for (const ins of inserts) {
    const at = ins.pos + shift;
    if (at >= pos) break;
    if (pos < at + ins.text.length) return ins.pos;
    shift += ins.text.length;
  }
  return pos - shift;
}
