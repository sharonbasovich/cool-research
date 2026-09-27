import { describe, expect, it } from 'vitest';
import { ROUTES, activeRoute } from '../src/shared/layout';

describe('routes', () => {
  it('lists four pages', () => expect(ROUTES).toHaveLength(4));

  it.each([
    ['/', 'index.html'],
    ['/cool-research/', 'index.html'],
    ['/cool-research/index.html', 'index.html'],
    ['/cool-research/lab/', 'lab/index.html'],
    ['/lab/index.html', 'lab/index.html'],
    ['/cool-research/histories/', 'histories/index.html'],
    ['/cool-research/proof-map/index.html', 'proof-map/index.html'],
  ])('marks %s as %s', (path, href) => expect(activeRoute(path)).toBe(href));
});
