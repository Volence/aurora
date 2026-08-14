import { describe, it, expect } from 'vitest';
import { joinPath } from '../join-path';

describe('joinPath', () => {
  it('adds the separator when the directory has none', () => {
    expect(joinPath('/home/x/s1disasm', 'project.json')).toBe('/home/x/s1disasm/project.json');
  });

  it('does not double it when the directory already ends in one', () => {
    // The bug: aeon's basePath carries a trailing slash, so the template
    // literal it replaced printed `/home/x/aeon//project.json`.
    expect(joinPath('/home/x/aeon/', 'project.json')).toBe('/home/x/aeon/project.json');
    expect(joinPath('/home/x/aeon///', 'project.json')).toBe('/home/x/aeon/project.json');
  });

  it('does not double it when the relative part starts with one either', () => {
    expect(joinPath('/home/x/aeon/', '/project.json')).toBe('/home/x/aeon/project.json');
  });

  it('keeps a root directory usable', () => {
    expect(joinPath('/', 'project.json')).toBe('/project.json');
  });
});
