# surgijs

Runtime of [SurgiJS](https://github.com/SurgiJS/surgijs): compiled Web Components on JSX/TSX with signals and direct DOM bindings. Zero dependencies, about 5.9 KB gzip for the whole runtime.

```bash
npm i surgijs
npm i -D @surgijs/compiler typescript
```

```tsx
import { defineComponent, useState } from 'surgijs';

const Counter = () => {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>Clicked {count} times</button>;
};

defineComponent('my-counter', Counter);
```

Entry points: `surgijs`, `surgijs/server` (SSR to declarative shadow DOM), `surgijs/hydrate`, `surgijs/jsx-runtime`.

Documentation: https://surgijs.github.io/surgijs/
