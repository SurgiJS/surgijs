import { defineComponent, type JSX, type ReactiveProps } from '@surgijs/core';

interface Props {
  title?: string;
  step?: number;
  open?: boolean;
  items?: string[];
}

export const Card = defineComponent<Props>(
  'x-card',
  (props: ReactiveProps<Props>) => (
    <section>
      <h3>{props.title}</h3>
      <p>
        <i>{props.step}</i>
        <b>{String(props.open())}</b>
        <u>{props.items()?.join(',')}</u>
      </p>
      <slot></slot>
    </section>
  ),
  { title: String, step: Number, open: Boolean, items: Array },
  { styles: 'section { color: red }', shadow: { mode: 'open', delegatesFocus: true } },
);

// JSX cannot type a promise as an element.
const Slow = (async () => {
  await Promise.resolve();
  return <b>late</b>;
}) as unknown as () => JSX.Element;

export const Late = defineComponent('x-late', () => <Slow />);

export const Light = defineComponent('x-light', (props: ReactiveProps<{}>) => <div>{props.children}</div>, {}, { shadow: false });
