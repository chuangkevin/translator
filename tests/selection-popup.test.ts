import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectionPopup } from '../src/lib/selection-popup';

describe('SelectionPopup', () => {
  let popup: SelectionPopup;
  let onTranslate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onTranslate = vi.fn();
    popup = new SelectionPopup(onTranslate);
    popup.mount();
  });

  it('mount adds popup container to document.body', () => {
    expect(document.getElementById('xt-selection-popup')).not.toBeNull();
  });

  it('show makes popup visible with loading state', () => {
    popup.show('Hello', { x: 100, y: 200 });
    const el = document.getElementById('xt-selection-popup')!;
    expect(el.style.display).not.toBe('none');
    expect(el.textContent).toContain('Hello');
  });

  it('setTranslation updates popup content for matching requestId', () => {
    popup.show('Hello', { x: 100, y: 200 });
    const [, id] = onTranslate.mock.calls[0];
    popup.setTranslation('你好', id);
    expect(document.getElementById('xt-selection-popup')!.textContent).toContain('你好');
  });

  it('setTranslation ignores stale requestId', () => {
    popup.show('Hello', { x: 100, y: 200 });
    popup.show('World', { x: 100, y: 200 });
    const [, firstId] = onTranslate.mock.calls[0];
    popup.setTranslation('你好', firstId);
    const el = document.getElementById('xt-selection-popup')!;
    expect(el.textContent).not.toContain('你好');
  });

  it('hide makes popup invisible', () => {
    popup.show('Hello', { x: 100, y: 200 });
    popup.hide();
    expect(document.getElementById('xt-selection-popup')!.style.display).toBe('none');
  });

  it('calls onTranslate with selected text and requestId when shown', () => {
    popup.show('World', { x: 50, y: 50 });
    expect(onTranslate).toHaveBeenCalledWith('World', 1);
  });

  it('escapes HTML in original text to prevent XSS', () => {
    popup.show("it's <b>bold</b>", { x: 50, y: 50 });
    const el = document.getElementById('xt-selection-popup')!;
    expect(el.textContent).toContain("it's");
    expect(el.querySelectorAll('b').length).toBe(0);
  });
});
