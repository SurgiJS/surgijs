/** @jsxImportSource @surgijs/core */
import { defineComponent, useState, type ReactiveProps } from '@surgijs/core';
import { counterStyles } from './styles';

export interface CounterProps {
  title?: string;
  step?: number;
}

export const Counter = (props: ReactiveProps<CounterProps>) => {
  const [count, setCount] = useState(0);
  const { title, step } = props;
  return (
    <div class="card">
      <h3>{title ?? 'Counter'}</h3>
      <p>
        Value: <output>{count}</output>
      </p>
      <button onClick={() => setCount((c) => c + (step() ?? 1))}>Add</button>
    </div>
  );
};

export const MyCounter = defineComponent('my-counter', Counter, { title: String, step: Number }, { styles: counterStyles });
