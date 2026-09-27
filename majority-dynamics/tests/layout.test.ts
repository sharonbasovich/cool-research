import { describe, expect, it } from 'vitest';
import { ROUTES } from '../src/shared/layout';

describe('routes', () => {
  it('lists four pages', () => expect(ROUTES).toHaveLength(4));
});
