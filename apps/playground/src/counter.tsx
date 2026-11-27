import { defineComponent, useEffect, useState, type ReactiveProps } from '@surgijs/core';

export interface CounterProps {
  step?: number;
  title?: string;
}

export const Counter = (props: ReactiveProps<CounterProps>) => {
  const [count, setCount] = useState(0);
  const { title, step } = props;
  useEffect(() => {
    console.log(`Title updated: ${title}`);
    return () => console.log('Cleanup effect');
  });
  return (
    <div class="card">
      <h3>{title ?? 'Counter'}</h3>
      <p>Value: {count}</p>
      <button onClick={() => setCount((c) => c + (step() ?? 1))}>Add</button>
    </div>
  );
};

export const MyCounter = defineComponent('my-counter', Counter, { step: Number, title: String });
