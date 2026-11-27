import { parseSync, type Node, type Program } from 'oxc-parser';

export type { Node } from 'oxc-parser';

export type NodeOf<T extends Node['type']> = Extract<Node, { type: T }>;

/** Function declarations, expressions and arrows. `Function` nodes carry a union `type`, so they need this form. */
export type FunctionNode = Extract<
  Node,
  { type: 'FunctionDeclaration' | 'FunctionExpression' | 'TSDeclareFunction' | 'TSEmptyBodyFunctionExpression' | 'ArrowFunctionExpression' }
>;

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';

/**
 * Direct child nodes in source order. A shorthand property's `key` is a separate object
 * with the same span as its `value`; only the value is returned so each identifier is seen once.
 */
export function children(node: Node): Node[] {
  const out: Node[] = [];
  const record = node as unknown as Record<string, unknown>;
  const skipKey = node.type === 'Property' && node.shorthand;
  for (const key of Object.keys(record)) {
    if (skipKey && key === 'key') continue;
    const v = record[key];
    if (Array.isArray(v)) {
      for (const x of v) if (isNode(x)) out.push(x);
    } else if (isNode(v)) out.push(v);
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.start < out[i - 1]!.start) return out.sort((a, b) => a.start - b.start);
  }
  return out;
}

export function forEachChild(node: Node, fn: (child: Node) => void): void {
  for (const c of children(node)) fn(c);
}

/** Parses JSX/TSX (or plain JSX for `.js`/`.jsx`). Syntax errors are ignored: the AST is kept as far as the parser got. */
export function parse(filename: string, code: string): Program {
  const lang = /\.[mc]?jsx?$/.test(filename) ? 'jsx' : 'tsx';
  const { program } = parseSync(filename, code, { lang, sourceType: 'module', preserveParens: true });
  return program;
}
