import { describe, it, expect } from 'vitest';
import { OAuthError, TemplateError } from './errors.js';

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

describe('TemplateError', () => {
  it('5. message format: "template: <field>: <reason>. <remediation>"', () => {
    const err = new TemplateError({
      field: 'game.opponent',
      reason: 'empty string',
      remediation: 'check manifest',
    });
    expect(err.message).toBe('template: game.opponent: empty string. check manifest');
  });

  it('6. instanceof TemplateError and instanceof Error both true', () => {
    const err = new TemplateError({ field: 'kid.name', reason: 'required', remediation: 'check channels.yaml' });
    expect(err).toBeInstanceOf(TemplateError);
    expect(err).toBeInstanceOf(Error);
  });

  it('7. toJSON() returns { name: "TemplateError", field, reason, remediation }', () => {
    const err = new TemplateError({
      field: 'game.result',
      reason: 'invalid enum',
      remediation: 'check manifest',
    });
    expect(err.toJSON()).toEqual({
      name: 'TemplateError',
      field: 'game.result',
      reason: 'invalid enum',
      remediation: 'check manifest',
    });
  });

  it('8. err.name === "TemplateError"', () => {
    const err = new TemplateError({ field: 'game.scoreFor', reason: 'non-negative required', remediation: 'check manifest' });
    expect(err.name).toBe('TemplateError');
  });
});
