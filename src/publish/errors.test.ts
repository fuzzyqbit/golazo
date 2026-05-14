import { describe, it, expect } from 'vitest';
import { OAuthError, TemplateError, UploadError, QuotaExceededError, PublishError } from './errors.js';

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

describe('UploadError', () => {
  it('9. message format: "upload: <field>: <reason>. <remediation>"', () => {
    const err = new UploadError({
      field: 'videoId',
      reason: 'response missing id',
      remediation: 'inspect body',
    });
    expect(err.message).toBe('upload: videoId: response missing id. inspect body');
    expect(err.field).toBe('videoId');
    expect(err.reason).toBe('response missing id');
    expect(err.remediation).toBe('inspect body');
  });

  it('10. instanceof UploadError and instanceof Error both true', () => {
    const err = new UploadError({ field: 'episodePath', reason: 'file not found', remediation: "run 'golazo render'" });
    expect(err).toBeInstanceOf(UploadError);
    expect(err).toBeInstanceOf(Error);
  });

  it('11. toJSON() returns { name: "UploadError", field, reason, remediation }', () => {
    const err = new UploadError({
      field: 'thumbnailPath',
      reason: 'file not found',
      remediation: "run 'golazo render <folder>' first",
    });
    expect(err.toJSON()).toEqual({
      name: 'UploadError',
      field: 'thumbnailPath',
      reason: 'file not found',
      remediation: "run 'golazo render <folder>' first",
    });
  });

  it('12. err.name === "UploadError"', () => {
    const err = new UploadError({ field: 'videoId', reason: 'missing', remediation: 'inspect response' });
    expect(err.name).toBe('UploadError');
  });
});

describe('QuotaExceededError', () => {
  it('13. default message starts with "publish: quota: YouTube daily upload quota exhausted. Rerun after " and ends with "Z."', () => {
    const err = new QuotaExceededError();
    expect(err.message).toMatch(
      /^publish: quota: YouTube daily upload quota exhausted\. Rerun after .+Z\.$/,
    );
  });

  it('14. custom reason + resumeAtHint: message matches expected format', () => {
    const err = new QuotaExceededError({
      reason: 'custom',
      resumeAtHint: '2026-05-14T08:00:00.000Z',
    });
    expect(err.message).toBe('publish: quota: custom. Rerun after 2026-05-14T08:00:00.000Z.');
  });

  it('15. instanceof QuotaExceededError AND instanceof Error both true', () => {
    const err = new QuotaExceededError();
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err).toBeInstanceOf(Error);
  });

  it('16. err.name === "QuotaExceededError"; toJSON() returns { name, reason, resumeAtHint }', () => {
    const err = new QuotaExceededError({
      reason: 'YouTube daily upload quota exhausted',
      resumeAtHint: '2026-05-14T00:00:00.000Z',
    });
    expect(err.name).toBe('QuotaExceededError');
    expect(err.toJSON()).toEqual({
      name: 'QuotaExceededError',
      reason: 'YouTube daily upload quota exhausted',
      resumeAtHint: '2026-05-14T00:00:00.000Z',
    });
  });
});

describe('PublishError', () => {
  it('17. message format: "publish: <field>: <reason>. <remediation>"', () => {
    const err = new PublishError({
      field: 'manifestPath',
      reason: 'manifest not found',
      remediation: "run 'golazo prepare <folder>' first",
    });
    expect(err.message).toBe(
      "publish: manifestPath: manifest not found. run 'golazo prepare <folder>' first",
    );
    expect(err.field).toBe('manifestPath');
    expect(err.reason).toBe('manifest not found');
    expect(err.remediation).toBe("run 'golazo prepare <folder>' first");
  });

  it('18. instanceof PublishError and instanceof Error both true', () => {
    const err = new PublishError({
      field: 'episodePath',
      reason: 'episode.mp4 not found',
      remediation: "run 'golazo render <folder>' first",
    });
    expect(err).toBeInstanceOf(PublishError);
    expect(err).toBeInstanceOf(Error);
  });

  it('19. toJSON() returns { name: "PublishError", field, reason, remediation }', () => {
    const err = new PublishError({
      field: 'thumbnailPath',
      reason: 'thumb.png not found',
      remediation: "run 'golazo render <folder>' first",
    });
    expect(err.toJSON()).toEqual({
      name: 'PublishError',
      field: 'thumbnailPath',
      reason: 'thumb.png not found',
      remediation: "run 'golazo render <folder>' first",
    });
  });

  it('20. err.name === "PublishError"', () => {
    const err = new PublishError({
      field: '(json)',
      reason: 'failed to parse',
      remediation: "delete the file and rerun 'golazo publish'",
    });
    expect(err.name).toBe('PublishError');
  });
});
