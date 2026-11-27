import { setHydrateRoot } from './component';
import { parseTemplate, setClaim, setHydrating } from './dom';

let cursor: Node | null = null;
const shapes = new Map<string, Node>();

function shape(html: string, flags: number): Node {
  let node = shapes.get(html);
  if (!node) {
    node = parseTemplate(html, flags);
    shapes.set(html, node);
  }
  return node;
}

function skip(n: Node | null): Node | null {
  while (n && n.nodeType === 3 && !(n as Text).data.trim()) n = n.nextSibling;
  return n;
}

/**
 * Brings server markup in line with the client template: the parser merges a static
 * text prefix with the value that follows it, the template keeps them apart.
 */
function align(node: Node, tmpl: Node): void {
  let t = tmpl.firstChild;
  let n = node.firstChild;
  while (t) {
    if (t.nodeType === 8) {
      // A placeholder marks a dynamic child; the server content before its marker is dropped.
      while (n && n.nodeType !== 8) {
        const next: ChildNode | null = n.nextSibling;
        node.removeChild(n);
        n = next;
      }
    } else if (t.nodeType === 3) {
      if (!n || n.nodeType !== 3) {
        node.insertBefore(t.cloneNode(), n);
        t = t.nextSibling;
        continue;
      }
      const d = (t as Text).data;
      const s = (n as Text).data;
      const placeholder = d === ' ' && !t.previousSibling && !t.nextSibling;
      if (!placeholder && s.length > d.length && s.startsWith(d)) {
        (n as Text).splitText(d.length);
        n = n.nextSibling;
      }
    } else if (t.nodeType === 1 && n && n.nodeType === 1) align(n, t);
    t = t.nextSibling;
    n = n ? n.nextSibling : null;
  }
  // Server content after the last template child belongs to a dynamic child, which the client renders again.
  while (n) {
    const next: ChildNode | null = n.nextSibling;
    node.removeChild(n);
    n = next;
  }
}

function claim(html: string, flags: number): Node | null {
  if (!cursor) return null;
  const node = skip(cursor);
  const tmpl = shape(html, flags);
  if (!node || node.nodeType !== 1 || (node as Element).localName !== (tmpl as Element).localName) return null;
  cursor = node.nextSibling;
  align(node, tmpl);
  return node;
}

function hydrateRoot(root: Node): (() => void) | null {
  if (!root.firstChild) return null;
  const prevCursor = cursor;
  const prev = setHydrating(true);
  cursor = root.firstChild;
  return () => {
    cursor = prevCursor;
    setHydrating(prev);
  };
}

/**
 * Makes components adopt server-rendered shadow roots (Declarative Shadow DOM):
 * templates claim existing nodes and bindings attach to them in place.
 */
export function enableHydration(): void {
  setClaim(claim);
  setHydrateRoot(hydrateRoot);
}

export function disableHydration(): void {
  setClaim(null);
  setHydrateRoot(null);
  setHydrating(false);
  cursor = null;
}
