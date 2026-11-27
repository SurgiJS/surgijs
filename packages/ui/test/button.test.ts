import { afterEach, describe, expect, it, vi } from 'vitest';
import { flush } from '@surgijs/core';
import { SButton, type SButtonElement } from '@surgijs/ui/button';

afterEach(() => document.body.replaceChildren());

function mount(html: string): { host: SButtonElement; button: HTMLButtonElement } {
  document.body.innerHTML = html;
  const host = document.querySelector('s-button')!;
  flush();
  return { host, button: host.shadowRoot!.querySelector('button')! };
}

describe('<s-button>', () => {
  it('registers once and renders a native button with slots', () => {
    expect(customElements.get('s-button')).toBe(SButton);
    const { host, button } = mount('<s-button>Save</s-button>');
    expect(host.shadowRoot!.mode).toBe('open');
    expect(button.type).toBe('button');
    expect(button.getAttribute('part')).toBe('base');
    const slots = Array.from(button.querySelectorAll('slot')).map((s) => s.name);
    expect(slots).toEqual(['start', '', 'end']);
    expect(button.querySelector('.spinner')!.hasAttribute('hidden')).toBe(true);
    expect(host.textContent).toBe('Save');
  });

  it('reflects variant and size so theme selectors apply', () => {
    const { host } = mount('<s-button>Go</s-button>');
    host.variant = 'danger';
    host.size = 'sm';
    expect(host.getAttribute('variant')).toBe('danger');
    expect(host.getAttribute('size')).toBe('sm');
  });

  it('names icon-only buttons through label', () => {
    const { host, button } = mount('<s-button label="Close"><svg slot="start"></svg></s-button>');
    expect(button.getAttribute('aria-label')).toBe('Close');
    host.label = undefined;
    flush();
    expect(button.hasAttribute('aria-label')).toBe(false);
  });

  it('disables the inner button and blocks clicks', () => {
    const { host, button } = mount('<s-button disabled>Delete</s-button>');
    const onClick = vi.fn();
    host.addEventListener('click', onClick);
    expect(button.disabled).toBe(true);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(onClick).not.toHaveBeenCalled();
    host.disabled = false;
    flush();
    expect(button.disabled).toBe(false);
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('stays focusable while loading but announces busy and blocks clicks', () => {
    const { host, button } = mount('<s-button loading>Saving</s-button>');
    const onClick = vi.fn();
    host.addEventListener('click', onClick);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.querySelector('.spinner')!.hasAttribute('hidden')).toBe(false);
    button.click();
    expect(onClick).not.toHaveBeenCalled();
    host.loading = false;
    flush();
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
  });

  it('follows a disabled fieldset through formDisabledCallback', () => {
    const { host, button } = mount('<s-button>Send</s-button>');
    (host as unknown as { formDisabledCallback(d: boolean): void }).formDisabledCallback(true);
    flush();
    expect(button.disabled).toBe(true);
  });

  it('submits and resets the closest form', () => {
    document.body.innerHTML = '<form><s-button type="submit">Send</s-button><s-button type="reset">Clear</s-button><s-button>Nothing</s-button></form>';
    flush();
    const form = document.querySelector('form')!;
    const submit = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {});
    const reset = vi.spyOn(form, 'reset').mockImplementation(() => {});
    const inner = (i: number) => document.querySelectorAll('s-button')[i]!.shadowRoot!.querySelector('button')!;
    inner(0).click();
    inner(1).click();
    inner(2).click();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
