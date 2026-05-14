import { describe, it, expect } from 'vitest';
import { OAuthError } from './errors.js';

describe('OAuthError', () => {
  it('1. populates field, reason, remediation, and message correctly', () => {
    const err = new OAuthError({
      field: 'tokenPath',
      reason: 'not found',
      remediation: "run 'golazo auth leo'",
    });
    expect(err.message).toBe("oauth: tokenPath: not found. run 'golazo auth leo'");
    expect(err.field).toBe('tokenPath');
    expect(err.reason).toBe('not found');
    expect(err.remediation).toBe("run 'golazo auth leo'");
  });

  it('2. instanceof OAuthError and instanceof Error both true', () => {
    const err = new OAuthError({ field: 'exchange', reason: 'invalid', remediation: 'retry' });
    expect(err).toBeInstanceOf(OAuthError);
    expect(err).toBeInstanceOf(Error);
  });

  it('3. toJSON() returns { name, field, reason, remediation }', () => {
    const err = new OAuthError({
      field: 'refresh',
      reason: 'token revoked',
      remediation: "run 'golazo auth leo' to reauthorize",
    });
    expect(err.toJSON()).toEqual({
      name: 'OAuthError',
      field: 'refresh',
      reason: 'token revoked',
      remediation: "run 'golazo auth leo' to reauthorize",
    });
  });

  it('4. err.name === "OAuthError"', () => {
    const err = new OAuthError({ field: 'tokenJson', reason: 'malformed', remediation: 'reauth' });
    expect(err.name).toBe('OAuthError');
  });
});
