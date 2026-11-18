import ts from 'typescript';

/** Calls whose result (or first tuple element) is a getter read as a value. */
export const GETTER_FNS: ReadonlySet<string> = new Set(['useState', 'createSignal', 'createMemo', 'useMemo', 'useContext']);
const TUPLE_FNS = new Set(['useState', 'createSignal']);
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

const unwrap = (e: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e))
    e = e.expression;
  return e;
};

function isTextualInit(call: ts.CallExpression): boolean {
  const t = call.typeArguments?.[0];
  if (t) {
    const kinds = ts.isUnionTypeNode(t) ? t.types : [t];
    return kinds.every(
      (k) =>
        k.kind === ts.SyntaxKind.StringKeyword ||
        k.kind === ts.SyntaxKind.NumberKeyword ||
        (ts.isLiteralTypeNode(k) && (ts.isStringLiteral(k.literal) || ts.isNumericLiteral(k.literal))),
    );
  }
  const a = call.arguments[0];
  if (!a) return false;
  const e = unwrap(a);
  if (ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) return true;
  if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) return true;
  return ts.isCallExpression(e) && ts.isIdentifier(e.expression) && (e.expression.text === 'String' || e.expression.text === 'Number');
}

const ASSIGNMENT_OPS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

function isWriteTarget(node: ts.Node): boolean {
  const p = node.parent;
  if (ts.isBinaryExpression(p) && p.left === node && ASSIGNMENT_OPS.has(p.operatorToken.kind)) return true;
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) &&
    (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  return false;
}

/** Whether `id` is a value read (declarations, property names and JSX names are not). */
function isRead(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p)) return p.expression === id;
  if (ts.isQualifiedName(p) || ts.isJsxNamespacedName(p) || ts.isJsxAttribute(p)) return false;
  if (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) return false;
  if (ts.isPropertyAssignment(p)) return p.initializer === id;
  if (ts.isBindingElement(p)) return p.initializer === id;
  if (ts.isVariableDeclaration(p) || ts.isParameter(p)) return p.initializer === id;
  if (ts.isPropertyDeclaration(p) || ts.isEnumMember(p)) return p.initializer === id;
  if (
    ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p) ||
    ts.isMethodDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) || ts.isPropertySignature(p) ||
    ts.isMethodSignature(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isEnumDeclaration(p) ||
    ts.isModuleDeclaration(p) || ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) ||
    ts.isImportEqualsDeclaration(p) || ts.isExportSpecifier(p) || ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) ||
    ts.isTypeParameterDeclaration(p) || ts.isMetaProperty(p)
  )
    return false;
  if (ts.isShorthandPropertyAssignment(p)) return false;
  return !isWriteTarget(id);
}

function bindingNames(name: ts.BindingName, out: ts.Identifier[] = []): ts.Identifier[] {
  if (ts.isIdentifier(name)) out.push(name);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
  return out;
}

/**
 * Appends `()` to reads of getters: names from `useState`/`createSignal` tuples,
 * `createMemo`/`useMemo`/`useContext`, and props destructured from a `ReactiveProps`
 * bag. `props.title` becomes `props.title()`.
 */
export function unwrapGetterReads(code: string, filename = 'input.tsx'): UnwrapResult {
  const kind = /\.[mc]?jsx?$/.test(filename) ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, kind);
  const plainJs = kind === ts.ScriptKind.JSX;
  const inserts: Insert[] = [];
  const textual = new Set<string>();

  const declareBinding = (scope: Scope, decl: ts.VariableDeclaration): void => {
    const init = decl.initializer && unwrap(decl.initializer);
    const names = bindingNames(decl.name);
    for (const n of names) scope.vars.set(n.text, Kind.Plain);
    if (!init) return;
    if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && GETTER_FNS.has(init.expression.text)) {
      const fn = init.expression.text;
      if (TUPLE_FNS.has(fn)) {
        if (ts.isArrayBindingPattern(decl.name)) {
          const first = decl.name.elements[0];
          if (first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) {
            scope.vars.set(first.name.text, Kind.Getter);
            if (isTextualInit(init)) textual.add(first.name.text);
          }
        }
      } else if (ts.isIdentifier(decl.name)) scope.vars.set(decl.name.text, Kind.Getter);
      return;
    }
    if (ts.isIdentifier(init) && scope.lookup(init.text) === Kind.Bag) {
      if (ts.isIdentifier(decl.name)) scope.vars.set(decl.name.text, Kind.Bag);
      else if (ts.isObjectBindingPattern(decl.name)) declareBag(scope, decl.name);
    }
  };

  const declareBag = (scope: Scope, pattern: ts.ObjectBindingPattern): void => {
    for (const el of pattern.elements) {
      if (!ts.isIdentifier(el.name)) continue;
      scope.vars.set(el.name.text, el.dotDotDotToken ? Kind.Bag : Kind.Getter);
    }
  };

  const declareStatements = (scope: Scope, statements: readonly ts.Statement[]): void => {
    for (const st of statements) {
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) declareBinding(scope, d);
      else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name)
        scope.vars.set(st.name.text, Kind.Plain);
      else if (ts.isImportDeclaration(st) && st.importClause) {
        const c = st.importClause;
        if (c.name) scope.vars.set(c.name.text, Kind.Plain);
        const b = c.namedBindings;
        if (b && ts.isNamespaceImport(b)) scope.vars.set(b.name.text, Kind.Plain);
        else if (b) for (const s of b.elements) scope.vars.set(s.name.text, Kind.Plain);
      }
    }
  };

  const isPropsParam = (fn: ts.SignatureDeclaration, p: ts.ParameterDeclaration): boolean => {
    if (fn.parameters[0] !== p) return false;
    const t = p.type;
    if (t && ts.isTypeReferenceNode(t)) return PROPS_TYPE.test(t.typeName.getText(sf));
    if (t) return false;
    const call = fn.parent;
    if (ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === 'defineComponent' && call.arguments[1] === fn)
      return true;
    return plainJs && ts.isIdentifier(p.name) && p.name.text === 'props';
  };

  const declareParams = (scope: Scope, fn: ts.SignatureDeclaration): void => {
    for (const p of fn.parameters) {
      for (const n of bindingNames(p.name)) scope.vars.set(n.text, Kind.Plain);
      if (!isPropsParam(fn, p)) continue;
      if (ts.isIdentifier(p.name)) scope.vars.set(p.name.text, Kind.Bag);
      else if (ts.isObjectBindingPattern(p.name)) declareBag(scope, p.name);
    }
  };

  const callee = (node: ts.Node): ts.CallExpression | null => {
    const p = node.parent;
    return ts.isCallExpression(p) && p.expression === node ? p : null;
  };

  const visit = (node: ts.Node, scope: Scope): void => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;

    if (ts.isIdentifier(node)) {
      if (scope.lookup(node.text) !== Kind.Getter) return;
      const p = node.parent;
      if (ts.isShorthandPropertyAssignment(p) && p.name === node) {
        inserts.push({ pos: node.end, text: `: ${node.text}()` });
        return;
      }
      if (!isRead(node)) return;
      const call = callee(node);
      if (call && call.arguments.length === 0) return;
      inserts.push({ pos: node.end, text: '()' });
      return;
    }

    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && scope.lookup(node.expression.text) === Kind.Bag) {
      const call = callee(node);
      if (!(call && call.arguments.length === 0) && !isWriteTarget(node)) inserts.push({ pos: node.end, text: '()' });
      return;
    }

    if (ts.isFunctionLike(node)) {
      const fn = node as ts.SignatureDeclaration & { body?: ts.Node };
      const inner = new Scope(scope);
      if (ts.isFunctionExpression(node) && node.name) inner.vars.set(node.name.text, Kind.Plain);
      declareParams(inner, fn);
      for (const p of fn.parameters) {
        if (p.initializer) visit(p.initializer, inner);
        visitPattern(p.name, inner);
      }
      const body = fn.body;
      if (!body) return;
      if (ts.isBlock(body)) {
        declareStatements(inner, body.statements);
        for (const st of body.statements) visit(st, inner);
      } else visit(body, inner);
      return;
    }

    if (ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseBlock(node)) {
      const inner = new Scope(scope);
      if (ts.isCaseBlock(node)) for (const c of node.clauses) declareStatements(inner, c.statements);
      else declareStatements(inner, node.statements);
      ts.forEachChild(node, (c) => visit(c, inner));
      return;
    }

    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const inner = new Scope(scope);
      const init = node.initializer;
      if (init && ts.isVariableDeclarationList(init)) for (const d of init.declarations) for (const n of bindingNames(d.name)) inner.vars.set(n.text, Kind.Plain);
      ts.forEachChild(node, (c) => visit(c, inner));
      return;
    }

    if (ts.isCatchClause(node)) {
      const inner = new Scope(scope);
      if (node.variableDeclaration) for (const n of bindingNames(node.variableDeclaration.name)) inner.vars.set(n.text, Kind.Plain);
      visit(node.block, inner);
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      visitPattern(node.name, scope);
      if (node.initializer) visit(node.initializer, scope);
      return;
    }

    if (ts.isJsxAttribute(node)) {
      if (node.initializer) visit(node.initializer, scope);
      return;
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      visit(node.attributes, scope);
      return;
    }

    if (ts.isJsxClosingElement(node)) return;

    ts.forEachChild(node, (c) => visit(c, scope));
  };

  const visitPattern = (name: ts.BindingName, scope: Scope): void => {
    if (ts.isIdentifier(name)) return;
    for (const el of name.elements) {
      if (ts.isOmittedExpression(el)) continue;
      if (el.propertyName && ts.isComputedPropertyName(el.propertyName)) visit(el.propertyName.expression, scope);
      if (el.initializer) visit(el.initializer, scope);
      visitPattern(el.name, scope);
    }
  };

  const top = new Scope(null);
  declareStatements(top, sf.statements);
  for (const st of sf.statements) visit(st, top);

  if (!inserts.length) return { code, inserts, textual };
  inserts.sort((a, b) => a.pos - b.pos);
  let out = '';
  let last = 0;
  for (const ins of inserts) {
    out += code.slice(last, ins.pos) + ins.text;
    last = ins.pos;
  }
  out += code.slice(last);
  return { code: out, inserts, textual };
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
