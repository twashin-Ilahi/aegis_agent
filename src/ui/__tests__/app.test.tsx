// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

Element.prototype.scrollIntoView = () => {};

describe('app smoke test', () => {
  it('renders every tab through the full demo without runtime errors', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    const errors: unknown[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => {
      errors.push(a);
    };
    const { default: App } = await import('../../App');
    const { engine } = await import('../store');
    const { setupDemo, crash, runAdversarialSuite } = await import('../../core/scenarios');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<App />);
    });
    expect(host.textContent).toContain('Launch the demo');

    const click = async (label: string) => {
      const el = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));
      expect(el, `button ${label}`).toBeTruthy();
      await act(async () => {
        el!.click();
        await new Promise((r) => setTimeout(r, 20));
      });
    };

    await act(async () => {
      await setupDemo(engine);
    });
    expect(host.textContent).toContain('Loan health');
    expect(host.querySelectorAll('svg[role="img"]').length).toBeGreaterThan(0);

    await act(async () => {
      crash(engine, 40, 6);
      for (let i = 0; i < 14; i++) await engine.tick();
    });
    expect(host.textContent).toContain('liquidated');

    for (const tab of ['Agent', 'Yield', 'Activity', 'Account', 'Lab', 'Dashboard']) await click(tab);

    // chat flow through the UI
    await click('Agent');
    const input = host.querySelector('input[aria-label="Your goal"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'Keep my loan above 1.4');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Send');
    expect(host.textContent).toContain('Here is what I understood');
    await click('Confirm');
    expect(host.textContent).toContain('Confirmed.');

    await click('Lab');
    await act(async () => {
      await runAdversarialSuite(engine);
    });
    await click('Run suite');
    expect(host.textContent).toMatch(/\d+\/\d+ blocked/);

    await click('Activity');
    expect(host.textContent).toContain('Activity log');

    await click('Emergency stop');
    expect(host.textContent).toContain('Agent paused');
    expect(host.querySelector('.toast.alert')?.textContent).toContain('Emergency stop');

    await act(async () => root.unmount());
    console.error = origErr;
    expect(errors).toEqual([]);
  }, 60_000);
});
