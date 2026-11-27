import { afterEach, describe, expect, it } from 'vitest';
import { flush } from '@surgijs/core';
import '../../../apps/playground/src/dropdown.tsx';

const OPTIONS = '[{"value":"ts","label":"TypeScript"},{"value":"go","label":"Go"}]';

function setup() {
  const el = document.createElement('ui-dropdown');
  el.setAttribute('placeholder', 'Choose a language');
  el.setAttribute('options', OPTIONS);
  document.body.appendChild(el);
  const root = el.shadowRoot!;
  const trigger = root.querySelector('button')!;
  const key = (k: string) => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
    flush();
  };
  const options = () => Array.from(root.querySelectorAll('li'));
  return { el, root, trigger, key, options };
}

afterEach(() => document.body.replaceChildren());

describe('ui-dropdown', () => {
  it('shows the placeholder', () => {
    const { trigger, root } = setup();
    expect(trigger.textContent).toBe('Choose a language');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('ul')).toBeNull();
  });

  it('opens, moves and selects with the keyboard', () => {
    const { el, trigger, key, options, root } = setup();
    const changes: string[] = [];
    el.addEventListener('change', (e) => changes.push(e.detail));
    key('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(options().map((li) => li.textContent)).toEqual(['TypeScript', 'Go']);
    expect(options()[0]!.className).toBe('option active');
    key('ArrowDown');
    expect(options()[1]!.className).toBe('option active');
    key('Enter');
    expect(root.querySelector('ul')).toBeNull();
    expect(el.value).toBe('go');
    expect(el.getAttribute('value')).toBe('go');
    expect(trigger.textContent).toBe('Go');
    expect(changes).toEqual(['go']);
    key('ArrowDown');
    expect(options()[1]!.className).toBe('option active');
    expect(options()[1]!.getAttribute('aria-selected')).toBe('true');
    key('Escape');
    expect(root.querySelector('ul')).toBeNull();
  });

  it('selects with the pointer', () => {
    const { el, trigger, options } = setup();
    trigger.click();
    flush();
    options()[0]!.click();
    flush();
    expect(el.value).toBe('ts');
    expect(trigger.textContent).toBe('TypeScript');
  });

  it('wraps around with ArrowUp', () => {
    const { key, options } = setup();
    key('ArrowDown');
    key('ArrowUp');
    expect(options()[1]!.className).toBe('option active');
  });
});
