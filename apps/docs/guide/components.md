# Components

## defineComponent

```ts
defineComponent<P, X>(tag, render, schema?, options?)
```

- `tag`: custom element name. A second call with a defined tag returns the existing class and swaps in the new `render`: connected instances re-render with it. This is how hot module replacement updates a component in place. The schema and options keep their first values, and component state resets on a hot update. A module that calls `defineComponent` accepts its own updates, so modules importing its other exports keep the old values until the page reloads.
- `render(props, host, emit)`: a function component. `props` holds a getter per schema key, `emit` dispatches the events declared in `options.events`.
- `schema`: `{ name: String | Number | Boolean | Object | Array }`. Keys become observed attributes in kebab case (`maxItems` ↔ `max-items`) and properties on the element.
- `options.shadow`: `true` (open shadow root, the default), a `ShadowRootInit`, or `false` for light DOM.
- `options.form`: `true` makes the element form-associated.
- `options.events`: the events the component emits, built with `defineEvent<T>()`.

Pass the props type as a generic when the schema alone would infer constructor types:

```ts
defineComponent<{ value?: string }>('ui-field', Field, { value: String }, { form: true });
```

## Attributes and properties

Attributes coerce by schema type: `Number` uses `+value`, `Boolean` treats presence as `true` and `"false"` as `false`, `Object` and `Array` parse JSON. Setting a `String`, `Number` or `Boolean` property reflects it back to the attribute. Properties set before the element upgrades are picked up on first connect.

## Shadow and light DOM

With a shadow root the component renders into it and slots work as usual. A closed root registers its own event delegation, so handlers inside fire exactly once. Use a ref on an inner element when the host needs access to the closed tree.

In light DOM the original children move into `props.children` before the first render, and the component places them wherever it inserts `{props.children}`.

Disconnecting disposes the render root and clears it in the next microtask. An element moved within the document (removed and inserted again in the same task) keeps its rendered tree and state. Reconnecting after disposal renders again with the current property values.

## Styles

`{ styles: css }` (a string or an array of strings) is parsed once per `defineComponent` into a `CSSStyleSheet` and adopted by every instance through `adoptedStyleSheets`, so a hundred elements share one copy of the CSS. Without constructable stylesheets, or when the CSS contains `@import` (which `replaceSync` drops), each root gets a `<style>` element instead. The option applies to shadow roots only.

```ts
defineComponent('ui-badge', Badge, {}, { styles: ':host { display: inline-block } .dot > b { color: red }' });
```

## React DevTools

With the React DevTools extension installed, each custom element shows up while `vite` is serving: the element, its render function, nested components (`Show`, `For`, `Switch`, and your own), and their DOM elements. Props are the values the component last read. `useState`, `useMemo`, `useRef` and `useId` values show under "state". Picking an element on the page selects it in the tree. The Vite plugin loads `@surgijs/core/devtools` for that session. A production build does not include it.

## Forms

With `{ form: true }` the element calls `attachInternals()` and gains:

- `setFormValue(value)` and `setFormValidity(flags, message, anchor)`;
- `value` property writes forwarded to the form value;
- `formDisabled` signal updated by `formDisabledCallback`;
- `formResetCallback` restoring the `value` attribute captured on first connect.

## Events

`defineEvent<T>(flags?)` declares an event and its `detail` type; `void` (the default) means the event carries no detail. The render function receives `emit(name, detail)` as its third argument and dispatches a `CustomEvent` on the host. `emit` returns `false` when a listener cancelled the event.

```tsx
const pickerEvents = { change: defineEvent<string>(), close: defineEvent({ cancelable: true }) };

const Picker = (props: ReactiveProps<PickerProps>, host: HTMLElement, emit: Emit<typeof pickerEvents>) => {
  // ...
  emit('change', 'go');
  emit('close');
  return null;
};

export const UiPicker = defineComponent<PickerProps, typeof pickerEvents>('ui-picker', Picker, { value: String }, { events: pickerEvents });
```

Events bubble and cross shadow boundaries unless the declaration says otherwise; `bubbles`, `composed` and `cancelable` set each flag. The declaration types the element: `el.addEventListener('change', (e) => e.detail)` sees a `string`, and `emit` rejects names or details the declaration does not have.

## Example: dropdown

<ui-dropdown placeholder="Choose a language" options='[{"value":"ts","label":"TypeScript"},{"value":"go","label":"Go"},{"value":"rs","label":"Rust"}]'></ui-dropdown>

The dropdown from `apps/playground/src/dropdown.tsx` supports ArrowUp, ArrowDown, Home, End, Enter, Space, Escape and Tab, and emits a `change` event typed as `string`, carrying the selected value.
