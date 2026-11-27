interface Connection {
  init(state: unknown): void;
  send(action: unknown, state: unknown): void;
  subscribe(listener: (message: { type?: string; state?: unknown; payload?: unknown }) => void): void;
}

type Extension = { connect?: (options?: { name?: string }) => Connection } | ((options?: { name?: string }) => Connection);

export interface DevAction {
  type: string;
  key?: string;
}

export interface DevtoolsBinding {
  get(): Record<string, unknown>;
  /** Time travel: write the lifted state back. Must not emit or refetch. */
  replace(state: Record<string, unknown>): void;
  /** Action typed into the monitor. */
  dispatch(action: Record<string, unknown>): void;
}

let serial = 0;

function storeName(): string {
  serial += 1;
  return serial === 1 ? 'SurgiJS' : `SurgiJS ${serial}`;
}

function parse(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Connects one store to the Redux DevTools extension when it is installed.
 * Returns the sender, or null when the extension is absent.
 */
export function connectDevtools(binding: DevtoolsBinding): ((action: DevAction) => void) | null {
  const raw = (globalThis as { __REDUX_DEVTOOLS_EXTENSION__?: Extension }).__REDUX_DEVTOOLS_EXTENSION__;
  if (!raw) return null;
  let conn: Connection;
  try {
    const connect = typeof raw === 'function' ? raw : raw.connect?.bind(raw);
    if (!connect) return null;
    conn = connect({ name: storeName() });
  } catch {
    return null;
  }

  const send = (action: DevAction) => {
    try {
      conn.send(action, binding.get());
    } catch {
      /* the extension could not serialize this state */
    }
  };

  try {
    conn.init(binding.get());
  } catch {
    /* ignore */
  }

  try {
    conn.subscribe((message) => {
      if (message.type === 'DISPATCH') {
        const next = parse(message.state);
        if (next) binding.replace(next);
        return;
      }
      if (message.type === 'ACTION') {
        const action = parse(message.payload);
        if (action) binding.dispatch(action);
      }
    });
  } catch {
    /* ignore */
  }

  return send;
}
