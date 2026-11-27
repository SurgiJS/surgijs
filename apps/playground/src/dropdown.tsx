import { createMemo, defineComponent, defineEvent, For, Show, useId, useState, type Emit, type ReactiveProps } from '@surgijs/core';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps {
  placeholder?: string;
  options?: DropdownOption[];
  value?: string;
}

const css = `
  :host { display: inline-block; position: relative; font: inherit; }
  .trigger { min-width: 12rem; padding: .5rem .75rem; text-align: left; border: 1px solid #c8ccd4; border-radius: 6px; background: #fff; cursor: pointer; }
  .trigger:focus-visible { outline: 2px solid #4f7cff; outline-offset: 2px; }
  .menu { position: absolute; z-index: 1; left: 0; right: 0; margin: 4px 0 0; padding: 4px; list-style: none; background: #fff; border: 1px solid #c8ccd4; border-radius: 6px; box-shadow: 0 6px 24px rgb(0 0 0 / .12); }
  .option { padding: .4rem .6rem; border-radius: 4px; cursor: pointer; }
  .option.active { background: #eef2ff; }
  .option[aria-selected="true"] { font-weight: 600; }
`;

export const dropdownEvents = {
  change: defineEvent<string>(),
};

export type DropdownEvents = typeof dropdownEvents;

export const Dropdown = (props: ReactiveProps<DropdownProps>, host: HTMLElement, emit: Emit<DropdownEvents>) => {
  const { placeholder, options, value } = props;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const id = useId('listbox');
  const list = () => options() ?? [];
  const selected = createMemo(() => list().find((o) => o.value === value()));

  const choose = (option: DropdownOption) => {
    (host as HTMLElement & DropdownProps).value = option.value;
    emit('change', option.value);
    setOpen(false);
  };

  const show = () => {
    const i = list().findIndex((o) => o.value === value());
    setActive(i < 0 ? 0 : i);
    setOpen(true);
  };

  const move = (delta: number) => {
    const n = list().length;
    if (!n) return;
    if (!open()) return show();
    setActive((i) => (i + delta + n) % n);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const n = list().length;
    switch (e.key) {
      case 'ArrowDown':
        move(1);
        break;
      case 'ArrowUp':
        move(-1);
        break;
      case 'Home':
        setActive(0);
        break;
      case 'End':
        setActive(n - 1);
        break;
      case 'Enter':
      case ' ': {
        const option = list()[active()];
        if (open() && option) choose(option);
        else show();
        break;
      }
      case 'Escape':
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div class="dropdown">
      <style>{css}</style>
      <button
        type="button"
        class="trigger"
        aria-haspopup="listbox"
        aria-controls={id}
        aria-expanded={open() ? 'true' : 'false'}
        onClick={() => (open() ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        {selected()?.label ?? placeholder ?? 'Select'}
      </button>
      <Show when={open()}>
        <ul class="menu" role="listbox" id={id}>
          <For each={list()} by={(o) => o.value}>
            {(option, i) => (
              <li
                role="option"
                class={i() === active() ? 'option active' : 'option'}
                aria-selected={option.value === value() ? 'true' : 'false'}
                onPointerMove={() => setActive(i())}
                onClick={() => choose(option)}
              >
                {option.label}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
};

export const UiDropdown = defineComponent<DropdownProps, DropdownEvents>(
  'ui-dropdown',
  Dropdown,
  {
    placeholder: String,
    options: Array,
    value: String,
  },
  { events: dropdownEvents },
);

export type UiDropdownElement = InstanceType<typeof UiDropdown>;

declare global {
  interface HTMLElementTagNameMap {
    'ui-dropdown': UiDropdownElement;
  }
}
