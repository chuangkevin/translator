import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FloatingButton } from '../src/lib/floating-button';

describe('FloatingButton', () => {
  let onToggleBilingual: ReturnType<typeof vi.fn>;
  let onToggleSelection: ReturnType<typeof vi.fn>;
  let btn: FloatingButton;

  beforeEach(() => {
    document.body.innerHTML = '';
    onToggleBilingual = vi.fn();
    onToggleSelection = vi.fn();
    btn = new FloatingButton({ onToggleBilingual, onToggleSelection });
  });

  it('mount adds floating host to document.body', () => {
    btn.mount();
    expect(document.getElementById('xt-floating-host')).not.toBeNull();
  });

  it('unmount removes host from document.body', () => {
    btn.mount();
    btn.unmount();
    expect(document.getElementById('xt-floating-host')).toBeNull();
  });

  it('updateState sets bilingual icon appearance', () => {
    btn.mount();
    btn.updateState({ bilingualEnabled: true, selectionEnabled: false, error: false });
    const host = document.getElementById('xt-floating-host')!;
    expect(host.innerHTML).toContain('xt-active');
  });

  it('showError adds error indicator', () => {
    btn.mount();
    btn.updateState({ bilingualEnabled: false, selectionEnabled: false, error: true });
    expect(document.getElementById('xt-floating-host')!.innerHTML).toContain('xt-error');
  });
});
