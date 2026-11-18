# Components

## defineComponent

```ts
defineComponent<P>(tag, render, schema?, options?)
```

- `tag`: custom element name. A second call with a defined tag returns the existing class.
- `render(props, host)`: a function component. `props` holds a getter per schema key.
- `schema`: `{ name: String | Number | Boolean | Object | Array }`. Keys become observed attributes in kebab case (`maxItems` ↔ `max-items`) and properties on the element.
- `options.shadow`: `true` (open shadow root, the default), a `ShadowRootInit`, or `false` for light DOM.
- `options.form`: `true` makes the element form-associated.

Pass the props type as a generic when the schema alone would infer constructor types:

```ts
defineComponent<{ value?: string }>('ui-field', Field, { value: String }, { form: true });
```

## Attributes and properties

Attributes coerce by schema type: `Number` uses `+value`, `Boolean` treats presence as `true` and `"false"` as `false`, `Object` and `Array` parse JSON. Setting a `String`, `Number` or `Boolean` property reflects it back to the attribute. Properties set before the element upgrades are picked up on first connect.

## Shadow and light DOM

With a shadow root the component renders into it and slots work as usual. A closed root registers its own event delegation, so handlers inside fire exactly once. Use a ref on an inner element when the host needs access to the closed tree.

In light DOM the original children move into `props.children` before the first render, and the component places them wherever it inserts `{props.children}`.

Disconnecting disposes the render root and clears it. Reconnecting renders again with the current property values.

## Forms

With `{ form: true }` the element calls `attachInternals()` and gains:

- `setFormValue(value)` and `setFormValidity(flags, message, anchor)`;
- `value` property writes forwarded to the form value;
- `formDisabled` signal updated by `formDisabledCallback`;
- `formResetCallback` restoring the `value` attribute captured on first connect.

## Example: dropdown

<ui-dropdown placeholder="Choose a language" options='[{"value":"ts","label":"TypeScript"},{"value":"go","label":"Go"},{"value":"rs","label":"Rust"}]'></ui-dropdown>

The dropdown from `apps/playground/src/dropdown.tsx` supports ArrowUp, ArrowDown, Home, End, Enter, Space, Escape and Tab, and emits a `change` event with the selected value.
