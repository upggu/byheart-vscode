import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('package.json', () => {
  it('keeps the local-only contract', () => {
    expect(pkg.extensionKind).toEqual(['ui']);
    expect(pkg).not.toHaveProperty('browser');
    expect(pkg.contributes).not.toHaveProperty('keybindings');
    expect(pkg.license).toBe('MIT');
    expect(pkg.name).toBe('byheart');
  });
});
