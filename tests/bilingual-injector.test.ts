import { describe, it, expect, beforeEach } from 'vitest';
import { BilingualInjector } from '../src/lib/bilingual-injector';

describe('BilingualInjector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('getTargets returns translatable elements', () => {
    document.body.innerHTML = '<p>Hello</p><h1>Title</h1><span>ignored</span>';
    const injector = new BilingualInjector(document.body);
    const targets = injector.getTargets();
    expect(targets).toHaveLength(2);
    expect(targets.map(el => el.tagName.toLowerCase())).toEqual(['p', 'h1']);
  });

  it('skips elements that are already translated', () => {
    document.body.innerHTML = '<p data-xt-id="1">Hello</p>';
    const injector = new BilingualInjector(document.body);
    expect(injector.getTargets()).toHaveLength(0);
  });

  it('injects translation node after target', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const injector = new BilingualInjector(document.body);
    const p = document.querySelector('p')!;
    injector.inject(p, '你好');

    const translation = document.querySelector('.xt-translation');
    expect(translation).not.toBeNull();
    expect(translation!.textContent).toBe('你好');
    expect(translation!.previousElementSibling).toBe(p);
  });

  it('marks injected element with data-xt-id so it is not re-targeted', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const injector = new BilingualInjector(document.body);
    const p = document.querySelector('p')!;
    injector.inject(p, '你好');

    expect(p.getAttribute('data-xt-id')).not.toBeNull();
    expect(injector.getTargets()).toHaveLength(0);
  });

  it('clear removes all translation nodes and data-xt-id attributes', () => {
    document.body.innerHTML = '<p>Hello</p><p>World</p>';
    const injector = new BilingualInjector(document.body);
    for (const el of injector.getTargets()) {
      injector.inject(el, '譯文');
    }
    injector.clear();
    expect(document.querySelectorAll('.xt-translation')).toHaveLength(0);
    expect(document.querySelectorAll('[data-xt-id]')).toHaveLength(0);
  });

  it('skips elements with no visible text content', () => {
    document.body.innerHTML = '<p>   </p><p>有內容</p>';
    const injector = new BilingualInjector(document.body);
    expect(injector.getTargets()).toHaveLength(1);
  });
});
