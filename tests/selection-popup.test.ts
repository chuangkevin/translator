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

  it('setTranslation updates popup content', () => {
    popup.show('Hello', { x: 100, y: 200 });
    popup.setTranslation('你好');
    expect(document.getElementById('xt-selection-popup')!.textContent).toContain('你好');
  });

  it('hide makes popup invisible', () => {
    popup.show('Hello', { x: 100, y: 200 });
    popup.hide();
    expect(document.getElementById('xt-selection-popup')!.style.display).toBe('none');
  });

  it('calls onTranslate with selected text when shown', () => {
    popup.show('World', { x: 50, y: 50 });
    expect(onTranslate).toHaveBeenCalledWith('World');
  });
});
