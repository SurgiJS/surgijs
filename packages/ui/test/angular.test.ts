import '@angular/compiler';
import { ElementRef, Injector, runInInjectionContext } from '@angular/core';
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

  it('writes inputs to the element properties', () => {
    const el = document.createElement('s-button') as unknown as HTMLElement & Record<string, unknown>;
    const directive = create(el);
    directive.variant = 'danger';
    directive.disabled = true;
    expect(el.variant).toBe('danger');
    expect(el.disabled).toBe(true);
  });
});
