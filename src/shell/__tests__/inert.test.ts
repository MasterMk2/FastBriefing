// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { inertOutside } from '../inert';

afterEach(() => {
  document.body.replaceChildren();
});

/** body > [root > [header, main > [layer, aside]], fileInput, drawer], as the app mounts its parts. */
function page() {
  document.body.innerHTML = `
    <div id="root"><header id="header"></header><main id="main"><section id="layer"></section><aside id="aside"></aside></main></div>
    <input id="file-input" type="file">
    <div id="drawer"></div>
    <script id="script"></script>`;
  const byId = (id: string) => document.getElementById(id)!;
  return { byId, layer: byId('layer') };
}

describe('inertOutside (A11Y-1, A11Y-3)', () => {
  it('marks every element outside the layer, including the siblings of its ancestors up to the body', () => {
    const { byId, layer } = page();
    inertOutside(layer);
    for (const id of ['header', 'aside', 'file-input', 'drawer']) expect(byId(id).hasAttribute('inert'), id).toBe(true);
    for (const id of ['layer', 'main', 'root', 'script']) expect(byId(id).hasAttribute('inert'), id).toBe(false);
  });

  it('removes only its own marks, and leaves out what keep accepts', () => {
    const { byId, layer } = page();
    byId('drawer').setAttribute('inert', '');
    const restore = inertOutside(layer, element => element.id === 'aside');
    expect(byId('aside').hasAttribute('inert')).toBe(false);
    restore();
    expect(byId('header').hasAttribute('inert')).toBe(false);
    expect(byId('file-input').hasAttribute('inert')).toBe(false);
    // The drawer was inert before the call, so it stays inert.
    expect(byId('drawer').hasAttribute('inert')).toBe(true);
  });
});
