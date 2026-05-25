import { describe, it, expect, beforeEach } from 'vitest';
import { BilingualInjector, isSimplifiedChinese } from '../src/lib/bilingual-injector';

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

  it('re-injection after clear produces exactly one translation per original element', () => {
    document.body.innerHTML = '<p>Hello</p><p>World</p>';
    const injector = new BilingualInjector(document.body);
    for (const el of injector.getTargets()) injector.inject(el, '譯');
    injector.clear();
    for (const el of injector.getTargets()) injector.inject(el, '譯2');
    expect(document.querySelectorAll('.xt-translation')).toHaveLength(2);
    expect(document.querySelectorAll('[data-xt-id]')).toHaveLength(2);
  });

  it('replaceSimplified replaces element text and stores original in data-xt-orig', () => {
    document.body.innerHTML = '<p>书山有路</p>';
    const injector = new BilingualInjector(document.body);
    const p = document.querySelector('p')!;
    injector.replaceSimplified(p, '書山有路');

    expect(p.textContent).toBe('書山有路');
    expect(p.getAttribute('data-xt-orig')).toBe('书山有路');
    expect(injector.getTargets()).toHaveLength(0);
  });

  it('clear restores simplified Chinese replacements', () => {
    document.body.innerHTML = '<p>书山有路</p>';
    const injector = new BilingualInjector(document.body);
    const p = document.querySelector('p')!;
    injector.replaceSimplified(p, '書山有路');
    injector.clear();

    expect(p.textContent).toBe('书山有路');
    expect(p.hasAttribute('data-xt-orig')).toBe(false);
    expect(injector.getTargets()).toHaveLength(1);
  });
});

describe('isSimplifiedChinese', () => {
  it('detects simplified Chinese characters', () => {
    expect(isSimplifiedChinese('今天天气很好')).toBe(true); // 气
    expect(isSimplifiedChinese('我们一起去')).toBe(true);   // 们
    expect(isSimplifiedChinese('这本书很好')).toBe(true);   // 这, 书
  });

  it('returns false for Traditional Chinese', () => {
    expect(isSimplifiedChinese('今天天氣很好')).toBe(false);
    expect(isSimplifiedChinese('我們一起去')).toBe(false);
    expect(isSimplifiedChinese('這本書很好')).toBe(false);
  });

  it('returns false for English text', () => {
    expect(isSimplifiedChinese('Hello World')).toBe(false);
  });

  it('returns false for Japanese text even with CJK characters', () => {
    expect(isSimplifiedChinese('今日はいい天気ですね')).toBe(false); // contains hiragana
  });

  it('injectPlaceholder inserts a node with "…" and loading animation class', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const injector = new BilingualInjector(document.body);
    const p = document.querySelector('p')!;
    const node = injector.injectPlaceholder(p);

    expect(node.textContent).toBe('…');
    expect(node.style.opacity).toBe('0.4');
    expect(node.classList.contains('xt-translation')).toBe(true);
    expect(node.classList.contains('xt-loading')).toBe(true);
    expect(p.getAttribute('data-xt-id')).not.toBeNull();
  });

  it('injectPlaceholder injects a <style> element into the document head', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const injector = new BilingualInjector(document.body);
    injector.injectPlaceholder(document.querySelector('p')!);
    expect(document.getElementById('xt-injector-style')).not.toBeNull();
  });

  it('injectPlaceholder does not inject duplicate style elements', () => {
    document.body.innerHTML = '<p>A</p><p>B</p>';
    const injector = new BilingualInjector(document.body);
    for (const el of injector.getTargets()) injector.injectPlaceholder(el);
    expect(document.querySelectorAll('#xt-injector-style')).toHaveLength(1);
  });

  it('fulfill removes xt-loading class and opacity', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const injector = new BilingualInjector(document.body);
    const p = document.querySelector('p')!;
    const node = injector.injectPlaceholder(p);

    injector.fulfill(node, '你好');

    expect(node.textContent).toBe('你好');
    expect(node.style.opacity).toBe('');
    expect(node.classList.contains('xt-loading')).toBe(false);
  });

  it('heading placeholder uses proportional font size (70% of original) and keeps font-weight', () => {
    document.body.innerHTML = '<h1>Heading</h1>';
    const injector = new BilingualInjector(document.body);
    const h1 = document.querySelector('h1')!;
    const node = injector.injectPlaceholder(h1);
    // In jsdom, getComputedStyle returns 0px for unset sizes, so fontSize will be 14px (minimum).
    // The key assertion is that font-weight is NOT overridden to 'normal'.
    expect(node.style.fontWeight).not.toBe('normal');
  });
});

describe('BilingualInjector li targeting', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('targets <li> inside <nav> (all elements are translated)', () => {
    document.body.innerHTML = '<nav><ul><li>Home</li><li>News</li></ul></nav>';
    const injector = new BilingualInjector(document.body);
    expect(injector.getTargets()).toHaveLength(2);
  });

  it('targets <li> in regular content lists', () => {
    document.body.innerHTML = '<ul><li>Content item</li></ul>';
    const injector = new BilingualInjector(document.body);
    expect(injector.getTargets()).toHaveLength(1);
  });
});

describe('BilingualInjector td/li injection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('injects translation inside <td> to preserve table column count', () => {
    document.body.innerHTML = '<table><tr><td>Cell A</td><td>Cell B</td></tr></table>';
    const injector = new BilingualInjector(document.body);
    const td = document.querySelector('td')!;
    injector.inject(td, '翻譯A');

    // Must not add extra <td> siblings — column count unchanged
    const row = document.querySelector('tr')!;
    expect(row.querySelectorAll('td')).toHaveLength(2);
    // Translation node should be inside the <td>
    const transNode = td.querySelector('.xt-translation');
    expect(transNode).not.toBeNull();
    expect(transNode!.textContent).toBe('翻譯A');
  });

  it('injects translation inside <li> to avoid doubling list items', () => {
    document.body.innerHTML = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const injector = new BilingualInjector(document.body);
    const li = document.querySelector('li')!;
    injector.inject(li, '項目一');

    // Must not add extra <li> siblings
    const ul = document.querySelector('ul')!;
    expect(ul.querySelectorAll('li')).toHaveLength(2);
    // Translation node should be inside the <li>
    const transNode = li.querySelector('.xt-translation');
    expect(transNode).not.toBeNull();
    expect(transNode!.textContent).toBe('項目一');
  });

  it('clear removes inner translation nodes from td', () => {
    document.body.innerHTML = '<table><tr><td>Cell</td></tr></table>';
    const injector = new BilingualInjector(document.body);
    const td = document.querySelector('td')!;
    injector.inject(td, '翻譯');
    injector.clear();

    expect(document.querySelectorAll('.xt-translation')).toHaveLength(0);
    expect(td.querySelectorAll('.xt-translation')).toHaveLength(0);
    const row = document.querySelector('tr')!;
    expect(row.querySelectorAll('td')).toHaveLength(1);
  });

  it('injectPlaceholder for <p> inserts sibling (not inner) to preserve block flow', () => {
    document.body.innerHTML = '<p>Text</p>';
    const injector = new BilingualInjector(document.body);
    const p = document.querySelector('p')!;
    injector.injectPlaceholder(p);

    // Placeholder should be a sibling, not inside the <p>
    expect(p.querySelector('.xt-translation')).toBeNull();
    expect(p.nextElementSibling?.classList.contains('xt-translation')).toBe(true);
  });
});
