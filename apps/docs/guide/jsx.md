# JSX to DOM

The compiler turns every JSX tree into a static HTML template plus a list of bindings. The runtime clones the template and walks to the dynamic nodes with `firstChild` / `nextSibling`.

```tsx
const Row = (props: ReactiveProps<{ label: string; on: boolean }>) => (
  <div class={props.on ? 'row on' : 'row'}>
    <span class="label">{props.label}</span>
  </div>
);
```

compiles to

```js
const _tmpl$1 = /*#__PURE__*/ _$template('<div><span class="label"></span></div>');

const Row = (props) => (() => {
  const _el$2 = _tmpl$1(), _el$3 = _el$2.firstChild;
  _$bind(_el$2, () => (props.on() ? 'row on' : 'row'), _$className);
  _$insert(_el$3, () => props.label());
  return _el$2;
})();
```

## Expressions

- An expression without calls is static and runs once.
- An expression with calls is dynamic. Reads that happen on every run become a `bind`: the runtime collects the signals during the first run and re-applies the value when one of them changes.
- Reads inside conditional branches (`a ? b() : c()`, `a && b()`, `a?.b()`) become a render effect that tracks dependencies on every run.
- Readers that depend only on their arguments are hoisted to module scope and deduplicated.
- A text signal that is the only child binds `setText` to a placeholder text node.

## Children

| Position | Output |
| --- | --- |
| Only child, text signal | `" "` placeholder and `setText` |
| Only child | `insert(el, value)`; the value owns all children |
| Last child | `insert(el, value, null)`; appends after static children |
| Between static children | `<!---->` marker and `insert(el, value, marker)` |

`insert` accepts strings, numbers, nodes, fragments, arrays and functions. Arrays reconcile with a keyed DOM diff that reuses existing nodes.

## Attributes and properties

::: v-pre
| JSX | DOM |
| --- | --- |
| `class`, `className` | `className`, removed on `null`/`false` |
| `style={{ color, '--gap': x }}` | `style[key]`, dashed keys through `setProperty` |
| `style="a: b"` | `style.cssText` |
| `htmlFor` | `for` attribute |
| `xlink:href`, `xml:lang`, `xmlns:x` | `setAttributeNS` with the right namespace |
| `attr:name` | always an attribute |
| `prop:name` | always a property |
| `ref={el}` / `ref={(el) => ...}` | assigns `el.current` or calls the function |
| `{...props}` | `spread`, which applies each key with the same rules |
| other names | property when the element has it, attribute otherwise; dashed names always set attributes |
:::

`true` renders an empty attribute, `null`, `undefined` and `false` remove it.

## Events

`onClick`, `onInput`, `onKeyDown` and the other bubbling UI events use delegation: one listener per event type on `document` (and on closed shadow roots), handlers stored on the element. The dispatcher walks `composedPath()`, sets `currentTarget`, skips disabled elements and honors `stopPropagation()`.

`on:name` adds a native listener for any event, including custom events and non-bubbling ones such as `mouseenter`.

## Components

A capitalized tag calls the function with a props object. Every prop is a getter, `children` included, so the child decides when to read it. Built-in control components (`For`, `Show`, `Switch`, `Match`, `Portal`, `ErrorBoundary`, context providers) receive their props in the shape they document.
