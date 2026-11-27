import { afterEach, describe, expect, it, vi } from 'vitest';
import { flush } from '@surgijs/core';
import { disableHydration, enableHydration } from '@surgijs/core/hydrate';
import { renderButton } from '@surgijs/ui/server';
import { buttonStyles } from '../src/button/button.styles';

afterEach(() => {
  disableHydration();
  document.body.replaceChildren();
});

const parts = (html: string): [string, string, string, string] => {
  const m = /^<s-button([^>]*)><template shadowrootmode="open" shadowrootdelegatesfocus>([\s\S]*)<\/template>([\s\S]*)<\/s-button>$/.exec(html);
  if (!m) throw new Error(`unexpected markup: ${html}`);
  return [m[0], m[1]!, m[2]!, m[3]!];
};

describe('renderButton', () => {
  it('renders the host, a declarative shadow root and slotted children', () => {
    const html = renderButton({ variant: 'secondary', size: 'lg', loading: true }, 'Saving');
    const [, attrs, shadow, children] = parts(html);
    expect(attrs).toBe(' variant="secondary" size="lg" loading');
    expect(children).toBe('Saving');
    expect(shadow).toContain(
      '<button type="button" class="base" part="base" aria-disabled="true" aria-busy="true"><span class="spinner" part="spinner" aria-hidden="true"></span><slot name="start"></slot><slot></slot><slot name="end"></slot></button>',
    );
  });

  it('keeps the stylesheet byte for byte, so server CSS matches the client', () => {
    const [, , shadow] = parts(renderButton());
    expect(shadow.startsWith(`<style>${buttonStyles}</style>`)).toBe(true);
  });

  it('renders disabled and label, escaping attribute values', () => {
    const [, attrs, shadow] = parts(renderButton({ disabled: true, label: 'Close "dialog"' }));
    expect(attrs).toBe(' disabled label="Close &quot;dialog&quot;"');
    expect(shadow).toContain(' disabled aria-label="Close &quot;dialog&quot;"');
    expect(shadow).toContain('class="spinner" part="spinner" aria-hidden="true" hidden');
  });
});

describe('hydration', () => {
  it('adopts the server button and keeps it interactive', async () => {
    const [, , shadow] = parts(renderButton({ type: 'submit' }, 'Send'));
    enableHydration();
    await import('@surgijs/ui/button');
    // happy-dom skips attributeChangedCallback on upgrade, so the host is created after
    // define with the server shadow root already attached; Playwright covers real DSD.
    const host = document.createElement('s-button');
    host.setAttribute('type', 'submit');
    host.attachShadow({ mode: 'open', delegatesFocus: true }).innerHTML = shadow;
    host.append('Send');
    const server = host.shadowRoot!.querySelector('button')!;
    document.body.innerHTML = '<form></form>';
    document.querySelector('form')!.append(host);
    flush();

    const button = host.shadowRoot!.querySelector('button')!;
    expect(button).toBe(server);
    expect(host.shadowRoot!.querySelectorAll('button')).toHaveLength(1);
    const form = document.querySelector('form')!;
    const submit = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {});
    button.click();
    expect(submit).toHaveBeenCalledTimes(1);
    host.loading = true;
    flush();
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});
