import { describe, it, expect } from 'vitest';
import { validateHostBinding, LOOPBACK_HOSTS } from './hostGuard.js';

describe('LOOPBACK_HOSTS', () => {
  it('exports the expected allowlist', () => {
    expect(LOOPBACK_HOSTS).toContain('127.0.0.1');
    expect(LOOPBACK_HOSTS).toContain('localhost');
    expect(LOOPBACK_HOSTS).toContain('::1');
    expect(LOOPBACK_HOSTS).toContain('[::1]');
  });
});

describe.each([
  ['undefined', undefined, 'ok'],
  ['empty string', '', 'ok'],
  ['127.0.0.1', '127.0.0.1', 'ok'],
  ['localhost', 'localhost', 'ok'],
  ['::1', '::1', 'ok'],
  ['[::1]', '[::1]', 'ok'],
  ['LocalHost (mixed case)', 'LocalHost', 'ok'],
  ['whitespace-padded 127.0.0.1', '  127.0.0.1  ', 'ok'],
  ['0.0.0.0', '0.0.0.0', 'throws'],
  ['10.0.0.5 (LAN IP)', '10.0.0.5', 'throws'],
  ['192.168.1.42 (LAN IP)', '192.168.1.42', 'throws'],
  ['127.0.0.1:4173 (host+port)', '127.0.0.1:4173', 'throws'],
  ['arbitrary FQDN', 'example.com', 'throws'],
] as const)('validateHostBinding(%s)', (_label, input, expected) => {
  it(`is ${expected}`, () => {
    if (expected === 'ok') {
      expect(() => validateHostBinding(input as string | undefined)).not.toThrow();
    } else {
      const strInput = input as string;
      expect(() => validateHostBinding(strInput)).toThrow(/WEB-03/);
      // Also assert the offending value appears in the error message
      const escapedInput = strInput.replace(/[.[\]]/g, '\\$&');
      expect(() => validateHostBinding(strInput)).toThrow(new RegExp(escapedInput));
    }
  });
});
