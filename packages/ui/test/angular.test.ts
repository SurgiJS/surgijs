import '@angular/compiler';
import { booleanAttribute, ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { buttonSchema } from '@surgijs/ui/button';
import { SButtonDirective } from '../src/angular';

const create = (el: HTMLElement) => {
  const injector = Injector.create({ providers: [{ provide: ElementRef, useValue: new ElementRef(el) }] });
  return runInInjectionContext(injector, () => new SButtonDirective());
};

describe('SButtonDirective', () => {
  it('has an input for every prop the element observes', () => {
    for (const key of Object.keys(buttonSchema)) {
      expect(Object.getOwnPropertyDescriptor(SButtonDirective.prototype, key)?.set, key).toBeTypeOf('function');
    }
  });

  it('coerces boolean inputs with booleanAttribute', () => {
    // `<s-button disabled>` hands the input '' and `disabled="false"` hands it 'false'.
    // inputConfig is the linked definition: [flags, publicName, declaredName, transform].
    const config = (SButtonDirective as unknown as { ɵdir: { inputConfig: Record<string, unknown> } }).ɵdir.inputConfig;
    for (const [key, ctor] of Object.entries(buttonSchema)) {
      const transform = Array.isArray(config[key]) ? (config[key] as unknown[])[3] : undefined;
      expect(transform, key).toBe(ctor === Boolean ? booleanAttribute : undefined);
    }
  });

  it('writes inputs to the element properties', () => {
    const el = document.createElement('s-button') as unknown as HTMLElement & Record<string, unknown>;
    const directive = create(el);
    directive.variant = 'danger';
    directive.disabled = true;
    expect(el.variant).toBe('danger');
    expect(el.disabled).toBe(true);
  });
});
