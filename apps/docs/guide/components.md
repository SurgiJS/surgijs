# Components

## defineComponent

```ts
defineComponent<P, X>(tag, render, schema?, options?)
```

- `tag`: custom element name. A second call with a defined tag returns the existing class.
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
};

export const UiPicker = defineComponent<PickerProps, typeof pickerEvents>('ui-picker', Picker, { value: String }, { events: pickerEvents });
```

Events bubble and cross shadow boundaries unless the declaration says otherwise; `bubbles`, `composed` and `cancelable` set each flag. The declaration types the element: `el.addEventListener('change', (e) => e.detail)` sees a `string`, and `emit` rejects names or details the declaration does not have.

## Example: dropdown

<ui-dropdown placeholder="Choose a language" options='[{"value":"ts","label":"TypeScript"},{"value":"go","label":"Go"},{"value":"rs","label":"Rust"}]'></ui-dropdown>

The dropdown from `apps/playground/src/dropdown.tsx` supports ArrowUp, ArrowDown, Home, End, Enter, Space, Escape and Tab, and emits a `change` event typed as `string`, carrying the selected value.
