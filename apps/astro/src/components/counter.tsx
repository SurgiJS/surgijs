import { defineComponent, useState, type ReactiveProps } from '@surgijs/core';

export interface CounterProps {
  title?: string;
  step?: number;
}

const styles = `
  :host { display: block; max-width: 18rem; }
  .card { padding: 1rem; border: 1px solid #d0d7de; border-radius: 0.5rem; font-family: system-ui, sans-serif; }
  button { font: inherit; padding: 0.25rem 0.75rem; }
`;

const Counter = (props: ReactiveProps<CounterProps>) => {
  const [count, setCount] = useState(0);
  const { title, step } = props;
  return (
    <div class="card">
      <h3>{title ?? 'Counter'}</h3>
      <p>
        Value: <output>{count}</output>
      </p>
      <button onClick={() => setCount((c) => c + (step() ?? 1))}>Add</button>
      <slot></slot>
      <footer>
        <slot name="footer"></slot>
      </footer>
    </div>
  );
};

export const MyCounter = defineComponent('my-counter', Counter, { title: String, step: Number }, { styles });
