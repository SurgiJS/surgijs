# Control flow

## For

```tsx
<For each={items()} by={(item) => item.id}>
  {(item, index) => <li>{index()}: {item.name}</li>}
</For>
```

Rows are keyed by `by(item, index)` or by the item itself. A row whose key survives keeps its DOM nodes and its reactive scope; new keys render, missing keys dispose. `index` is a signal and exists only when the render function declares a second parameter.

### Keys and updates

A key renders its row **once**. When an item with the same key arrives with different content, the row is not rendered again, and the `item` it received at the first render stays the same object. Two ways to show new content:

- Read changing values through signals or memos inside the row, so the row's bindings update in place.
- Include the changing values in the key, so a changed item becomes a new row: `by={(p) => p.id + ':' + p.value}`. This is what you want when each row is a snapshot of its item, for example a chart bar.

Keys must be unique. With no `by`, the item itself is the key, which suits lists of strings and stable objects. Replacing items with fresh objects (for example after a refetch) then re-renders every row, so give such lists a `by`.

## Show

```tsx
<Show when={user()} fallback={<Login />}>
  {(u) => <Profile user={u} />}
</Show>
```

`when` counts as true for any value except `null`, `undefined` and `false`, so `0` and `''` render the children. A function child that declares a parameter receives the value and renders again when the value changes. Switching branches disposes the previous one.

## Switch and Match

```tsx
<Switch fallback={<p>Not found</p>}>
  <Match when={route() === 'home'}><Home /></Match>
  <Match when={route() === 'about'}><About /></Match>
</Switch>
```

The first truthy `Match` renders. The branch stays mounted while the same `Match` wins.

## Portal

```tsx
<Portal mount={document.querySelector('#overlays')}>
  <Dialog />
</Portal>
```

Children render into `mount` (default `document.body`) and leave it when the owner disposes.

## ErrorBoundary

```tsx
<ErrorBoundary fallback={(err, reset) => <button onClick={reset}>Retry: {String(err)}</button>}>
  <Widget />
</ErrorBoundary>
```

Errors thrown while rendering children, and later in their effects and bindings, replace the children with `fallback`. `reset` renders the children again.

## createResource

```tsx
const user = createResource(() => fetch(`/api/users/${id()}`).then((r) => r.json()));

<Show when={!user.loading()} fallback={<Spinner />}>
  <p>{user()?.name}</p>
</Show>;
```

The fetcher runs again when the signals it reads change. A response that arrives after a newer request is ignored.
