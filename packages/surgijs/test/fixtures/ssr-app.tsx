import { createContext, ErrorBoundary, For, Match, Portal, Show, Switch, useContext, type JSX, type ReactiveProps } from '@surgijs/core';

export const Theme = createContext('light');

export const Badge = (props: ReactiveProps<{ label?: string }>) => {
  const { label } = props;
  return <b class="badge">{label ?? 'none'}</b>;
};

export const Themed = () => {
  const theme = useContext(Theme);
  return <p class={theme()}>themed</p>;
};

export const Panel = (props: ReactiveProps<{ title?: string }>) => {
  const { title } = props;
  return (
    <section>
      <h2>{title}</h2>
      <Badge label={title()} />
      {props.children}
    </section>
  );
};

export interface ListProps {
  items?: string[];
  mode?: string;
  show?: boolean;
}

export const List = (props: ReactiveProps<ListProps>) => {
  const { items, mode, show } = props;
  return (
    <div>
      <Show when={show}>
        <i>shown</i>
      </Show>
      <ul>
        <For each={items ?? []}>{(item) => <li>{item}</li>}</For>
      </ul>
      <Switch fallback={<em>other</em>}>
        <Match when={mode() === 'a'}>
          <span>A</span>
        </Match>
        <Match when={mode() === 'b'}>
          <span>B</span>
        </Match>
      </Switch>
    </div>
  );
};

export const Boom = (): JSX.Element => {
  throw new Error('boom');
};

export const Guarded = () => (
  <ErrorBoundary fallback={<p>failed</p>}>
    <Boom />
  </ErrorBoundary>
);

export const Portaled = () => (
  <div>
    <Portal>
      <i>elsewhere</i>
    </Portal>
  </div>
);

// Async components are typed loosely: JSX cannot type a promise as an element.
export const Later = (async (props: ReactiveProps<{ value?: string }>) => {
  const { value } = props;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return <q>{value}</q>;
}) as unknown as (props: { value?: string }) => JSX.Element;

export const Deferred = () => (
  <section>
    <Later value="soon" />
  </section>
);

export const Page = (props: ReactiveProps<{ title?: string }>) => {
  const { title } = props;
  return (
    <main>
      <Panel title={title()}>
        <em>{title}</em>
      </Panel>
      <Theme.Provider value="dark">
        <Themed />
      </Theme.Provider>
      <List items={['x', '<y>']} mode="b" show />
    </main>
  );
};

export interface User {
  name: string;
}

export const Users = (props: ReactiveProps<{ user?: User | null; names?: string[] }>) => {
  const { user, names } = props;
  return (
    <div>
      <Show when={user()}>{(u) => <b>{u.name}</b>}</Show>
      <ol>
        <For each={names() ?? []}>{(name, index) => <li>{index()}:{name}</li>}</For>
      </ol>
    </div>
  );
};

export const Await = (props: ReactiveProps<{ value?: Promise<string> }>) => {
  const { value } = props;
  return <p>{value}</p>;
};
