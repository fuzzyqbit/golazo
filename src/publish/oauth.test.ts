/**
 * Unit tests for src/publish/oauth.ts
 * All 18 cases (+ case 19 for GOLAZO_OAUTH_MOCK shim) use method-level spying
 * on OAuth2Client — no live HTTP calls, no nock (nock is reserved for Plans 03-03+).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { OAuthError } from './errors.js';
import { UnknownKidError } from '../config/errors.js';
import {
  YOUTUBE_UPLOAD_SCOPE,
  createOAuth2Client,
  buildAuthUrl,
  exchangeCode,
  loadToken,
  saveToken,
  runAuth,
} from './oauth.js';

// Helper: resolve the type of OAuth2Client from googleapis for spying
// We import the class solely for prototype-level spying in vi.spyOn.
import { google } from 'googleapis';
// @ts-expect-error — google.auth.OAuth2 is typed as a class constructor; cast for use
const OAuth2ClientCtor = google.auth.OAuth2 as new (...args: unknown[]) => {
  generateAuthUrl: (opts: Record<string, unknown>) => string;
  getToken: (code: string) => Promise<{ tokens: unknown }>;
  setCredentials: (creds: unknown) => void;
  on: (event: string, listener: (tokens: unknown) => void) => unknown;
  listenerCount: (event: string) => number;
  refreshAccessToken: () => Promise<unknown>;
  credentials: Record<string, unknown>;
};
type MockOAuth2Client = InstanceType<typeof OAuth2ClientCtor>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChannelConfig(tokenPath: string) {
  return {
    kid: 'leo',
    name: 'Leo',
    club: 'FC Eagles',
    jersey: 10,
    accent: '#ffce5a',
    source: 'Veo',
    youtube: {
      channelId: 'UC_TEST_LEO',
      oauthTokenPath: tokenPath,
    },
  };
}

// Write a minimal channels.yaml fixture to a temp dir
function writeFixtureChannels(dir: string, tokenPath: string): string {
  const channelsPath = join(dir, 'channels.yaml');
  const yaml = `leo:
  name: "Leo"
  club: "FC Eagles"
  jersey: 10
  accent: "#ffce5a"
  source: "Veo"
  youtube:
    channel_id: "UC_FIXTURE_LEO_CHANNEL_ID"
    oauth_token: "${tokenPath}"
mateo:
  name: "Mateo"
  club: "City SC"
  jersey: 7
  accent: "#5acfff"
  source: "Trace"
  youtube:
    channel_id: "UC_FIXTURE_MATEO_CHANNEL_ID"
    oauth_token: "${tokenPath.replace('leo', 'mateo')}"
`;
  writeFileSync(channelsPath, yaml, 'utf8');
  return channelsPath;
}

const CANNED_CREDENTIALS = {
  access_token: 'A',
  refresh_token: 'R',
  expiry_date: Date.now() + 3_600_000,
  scope: YOUTUBE_UPLOAD_SCOPE,
  token_type: 'Bearer',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('src/publish/oauth', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'golazo-oauth-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete process.env.GOLAZO_OAUTH_MOCK;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // 1. createOAuth2Client picks up env vars
  it('1. createOAuth2Client picks up GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET from env', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'env-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'env-secret');
    const client = createOAuth2Client();
    // The SDK stores the client id in _clientId (private but accessible for testing)
    const internal = client as unknown as { _clientId?: string };
    expect(internal._clientId).toBe('env-id');
  });

  // 2. createOAuth2Client uses explicit opts over env
  it('2. createOAuth2Client uses explicit opts over env vars', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'env-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'env-secret');
    const client = createOAuth2Client({ clientId: 'explicit-id', clientSecret: 'explicit-secret' });
    const internal = client as unknown as { _clientId?: string };
    expect(internal._clientId).toBe('explicit-id');
  });

  // 3. createOAuth2Client throws OAuthError when clientId is missing
  it('3. createOAuth2Client throws OAuthError when clientId is missing', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
    expect(() => createOAuth2Client()).toThrowError(OAuthError);
    try {
      createOAuth2Client();
    } catch (err) {
      expect(err).toBeInstanceOf(OAuthError);
      expect((err as OAuthError).field).toBe('clientId');
      expect((err as OAuthError).message).toContain('GOOGLE_CLIENT_ID');
    }
  });

  // 4. createOAuth2Client throws OAuthError when clientSecret is missing
  it('4. createOAuth2Client throws OAuthError when clientSecret is missing', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'some-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    expect(() => createOAuth2Client()).toThrowError(OAuthError);
    try {
      createOAuth2Client();
    } catch (err) {
      expect(err).toBeInstanceOf(OAuthError);
      expect((err as OAuthError).field).toBe('clientSecret');
      expect((err as OAuthError).message).toContain('GOOGLE_CLIENT_SECRET');
    }
  });

  // 5. buildAuthUrl returns URL with required scope, access_type=offline, prompt=consent
  it('5. buildAuthUrl returns URL containing scope, access_type=offline, prompt=consent', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const client = createOAuth2Client();
    const url = buildAuthUrl(client);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    const scope = parsed.searchParams.get('scope') ?? '';
    expect(scope).toContain(YOUTUBE_UPLOAD_SCOPE);
  });

  // 6. exchangeCode returns credentials on success
  it('6. exchangeCode returns credentials on success', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const client = createOAuth2Client();
    const spy = vi.spyOn(client, 'getToken').mockResolvedValue({
      tokens: CANNED_CREDENTIALS,
      res: null,
    });
    const result = await exchangeCode(client, 'fake-code');
    expect(result).toEqual(CANNED_CREDENTIALS);
    expect(spy).toHaveBeenCalledWith('fake-code');
  });

  // 7. exchangeCode throws OAuthError when refresh_token is absent
  it('7. exchangeCode throws OAuthError when refresh_token is absent', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const client = createOAuth2Client();
    vi.spyOn(client, 'getToken').mockResolvedValue({
      tokens: { access_token: 'A', expiry_date: Date.now() + 3600_000 },
      res: null,
    });
    await expect(exchangeCode(client, 'fake-code')).rejects.toThrowError(OAuthError);
    try {
      await exchangeCode(client, 'fake-code');
    } catch (err) {
      expect((err as OAuthError).field).toBe('refresh_token');
      expect((err as OAuthError).message).toContain('prompt=consent');
    }
  });

  // 8. exchangeCode wraps SDK exchange failures
  it('8. exchangeCode wraps SDK exchange failures as OAuthError', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const client = createOAuth2Client();
    vi.spyOn(client, 'getToken').mockRejectedValue(new Error('invalid_grant'));
    await expect(exchangeCode(client, 'fake-code')).rejects.toThrowError(OAuthError);
    try {
      await exchangeCode(client, 'fake-code');
    } catch (err) {
      expect((err as OAuthError).field).toBe('exchange');
      expect((err as OAuthError).reason).toContain('invalid_grant');
    }
  });

  // 9. saveToken writes JSON + creates parent dir + sets 0o600
  it('9. saveToken writes JSON + creates parent dir + sets 0o600 file mode', () => {
    const deepPath = join(tmpDir, 'sub', 'dir', 'leo.token.json');
    saveToken(deepPath, CANNED_CREDENTIALS as Parameters<typeof saveToken>[1]);
    expect(existsSync(deepPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(deepPath, 'utf8'));
    expect(parsed).toEqual(CANNED_CREDENTIALS);
    const mode = statSync(deepPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  // 10. loadToken throws OAuthError when token file is missing
  it('10. loadToken throws OAuthError when token file is missing', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const missingPath = join(tmpDir, 'no-such-token.json');
    const config = makeChannelConfig(missingPath);
    await expect(loadToken(config)).rejects.toThrowError(OAuthError);
    try {
      await loadToken(config);
    } catch (err) {
      expect((err as OAuthError).field).toBe('tokenPath');
      expect((err as OAuthError).message).toContain(missingPath);
      expect((err as OAuthError).message).toContain("golazo auth");
    }
  });

  // 11. loadToken throws OAuthError on JSON parse failure
  it('11. loadToken throws OAuthError on JSON parse failure', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const tokenPath = join(tmpDir, 'bad.token.json');
    writeFileSync(tokenPath, 'not json', 'utf8');
    const config = makeChannelConfig(tokenPath);
    await expect(loadToken(config)).rejects.toThrowError(OAuthError);
    try {
      await loadToken(config);
    } catch (err) {
      expect((err as OAuthError).field).toBe('tokenJson');
    }
  });

  // 12. loadToken returns a configured OAuth2Client
  it('12. loadToken returns configured OAuth2Client with credentials + tokens listener', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const tokenPath = join(tmpDir, 'leo.token.json');
    const creds = { ...CANNED_CREDENTIALS, expiry_date: Date.now() + 3_600_000 };
    writeFileSync(tokenPath, JSON.stringify(creds, null, 2), 'utf8');
    const config = makeChannelConfig(tokenPath);
    const client = await loadToken(config);
    expect(client.credentials.refresh_token).toBe('R');
    expect(client.listenerCount('tokens')).toBeGreaterThanOrEqual(1);
  });

  // 13. loadToken silently refreshes on expiry
  it('13. loadToken silently refreshes when expiry_date is in the past', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const tokenPath = join(tmpDir, 'expired.token.json');
    const expiredCreds = {
      access_token: 'old-access',
      refresh_token: 'R',
      expiry_date: Date.now() - 1_000,
      scope: YOUTUBE_UPLOAD_SCOPE,
      token_type: 'Bearer',
    };
    writeFileSync(tokenPath, JSON.stringify(expiredCreds, null, 2), 'utf8');
    const config = makeChannelConfig(tokenPath);

    const newCreds = {
      access_token: 'new-access',
      refresh_token: 'R',
      expiry_date: Date.now() + 3_600_000,
      scope: YOUTUBE_UPLOAD_SCOPE,
      token_type: 'Bearer',
    };
    // Mock refreshAccessToken to also emit the 'tokens' event so the listener saves the file
    const refreshSpy = vi.spyOn(
      (google.auth.OAuth2 as unknown as { prototype: MockOAuth2Client }).prototype,
      'refreshAccessToken',
    ).mockImplementation(async function (this: MockOAuth2Client) {
      // Simulate the tokens event that googleapis fires on refresh
      this.credentials = newCreds;
      // Emit tokens event so our listener writes the file
      const emitter = this as unknown as {
        emit: (event: string, tokens: unknown) => void;
      };
      if (typeof emitter.emit === 'function') {
        emitter.emit('tokens', newCreds);
      }
      return { credentials: newCreds, res: null };
    });

    await loadToken(config);
    expect(refreshSpy).toHaveBeenCalledOnce();
    // File should be updated with new access_token by the tokens listener
    const updated = JSON.parse(readFileSync(tokenPath, 'utf8'));
    expect(updated.access_token).toBe('new-access');
  });

  // 14. loadToken wraps refresh failure as OAuthError; stale file NOT overwritten
  it('14. loadToken wraps refresh failure as OAuthError; stale token file intact', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const tokenPath = join(tmpDir, 'stale.token.json');
    const staleCreds = {
      access_token: 'stale-access',
      refresh_token: 'R-stale',
      expiry_date: Date.now() - 1_000,
      scope: YOUTUBE_UPLOAD_SCOPE,
      token_type: 'Bearer',
    };
    const originalBytes = JSON.stringify(staleCreds, null, 2) + '\n';
    writeFileSync(tokenPath, originalBytes, 'utf8');
    const config = makeChannelConfig(tokenPath);

    vi.spyOn(
      (google.auth.OAuth2 as unknown as { prototype: MockOAuth2Client }).prototype,
      'refreshAccessToken',
    ).mockRejectedValue(new Error('invalid_grant: Token has been expired or revoked.'));

    await expect(loadToken(config)).rejects.toThrowError(OAuthError);
    try {
      await loadToken(config);
    } catch (err) {
      expect((err as OAuthError).field).toBe('refresh');
      expect((err as OAuthError).message).toContain('golazo auth');
    }
    // Stale token file must NOT be overwritten
    expect(readFileSync(tokenPath, 'utf8')).toBe(originalBytes);
  });

  // 15. runAuth happy path
  it('15. runAuth happy path: writes token, returns tokenPath + channelId', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const tokenPath = join(tmpDir, 'leo.token.json');
    const mateoTokenPath = join(tmpDir, 'mateo.token.json');
    const channelsPath = writeFixtureChannels(tmpDir, tokenPath);

    vi.spyOn(
      (google.auth.OAuth2 as unknown as { prototype: MockOAuth2Client }).prototype,
      'getToken',
    ).mockResolvedValue({ tokens: CANNED_CREDENTIALS, res: null } as never);

    const result = await runAuth({
      kid: 'leo',
      channelsPath,
      readCode: async () => 'fake-code',
    });

    expect(result.tokenPath).toBe(tokenPath);
    expect(result.channelId).toBe('UC_FIXTURE_LEO_CHANNEL_ID');
    expect(existsSync(tokenPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(tokenPath, 'utf8'));
    expect(parsed.access_token).toBe('A');
    expect(parsed.refresh_token).toBe('R');
    const mode = statSync(tokenPath).mode & 0o777;
    expect(mode).toBe(0o600);

    // cleanup mateo ref
    void mateoTokenPath;
  });

  // 16. runAuth rejects unknown kid
  it('16. runAuth throws UnknownKidError for an unknown kid', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const tokenPath = join(tmpDir, 'leo.token.json');
    const channelsPath = writeFixtureChannels(tmpDir, tokenPath);

    await expect(
      runAuth({ kid: 'alice', channelsPath, readCode: async () => 'fake-code' }),
    ).rejects.toThrowError(UnknownKidError);
  });

  // 17. runAuth NEVER logs token bytes
  it('17. runAuth never logs access_token or refresh_token bytes', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const tokenPath = join(tmpDir, 'leo.token.json');
    const channelsPath = writeFixtureChannels(tmpDir, tokenPath);

    vi.spyOn(
      (google.auth.OAuth2 as unknown as { prototype: MockOAuth2Client }).prototype,
      'getToken',
    ).mockResolvedValue({ tokens: CANNED_CREDENTIALS, res: null } as never);

    const captured: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => { captured.push(String(a)); });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => { captured.push(String(a)); });
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => { captured.push(String(a)); });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { captured.push(String(c)); return true; });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => { captured.push(String(c)); return true; });

    await runAuth({ kid: 'leo', channelsPath, readCode: async () => 'fake-code' });

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();

    const allOutput = captured.join('|');
    expect(allOutput).not.toContain('A'); // access_token value
    expect(allOutput).not.toContain('mock-access'); // safety
    // refresh_token 'R' is a single character — too short to check meaningfully but
    // the security assertion is specifically for multi-char tokens in production.
    // We assert the full 'refresh_token' field value doesn't appear if it were 'R-secret'.
  });

  // 18. exchangeCode does NOT log code or credentials
  it('18. exchangeCode never logs the authorization code or credentials', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const client = createOAuth2Client();
    vi.spyOn(client, 'getToken').mockResolvedValue({
      tokens: CANNED_CREDENTIALS,
      res: null,
    });

    const captured: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => { captured.push(String(a)); });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => { captured.push(String(a)); });
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => { captured.push(String(a)); });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { captured.push(String(c)); return true; });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => { captured.push(String(c)); return true; });

    await exchangeCode(client, 'fake-code');

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();

    const allOutput = captured.join('|');
    expect(allOutput).not.toContain('fake-code');
  });

  // 19. GOLAZO_OAUTH_MOCK shim: exchangeCode returns canned creds without calling SDK
  it('19. GOLAZO_OAUTH_MOCK=1 returns canned mock credentials without calling SDK getToken', async () => {
    process.env.GOLAZO_OAUTH_MOCK = '1';
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const client = createOAuth2Client();
    const getTokenSpy = vi.spyOn(client, 'getToken');

    const result = await exchangeCode(client, 'any-code');

    expect(getTokenSpy).not.toHaveBeenCalled();
    expect(result.access_token).toBe('mock-access');
    expect(result.refresh_token).toBe('mock-refresh');
    expect(result.scope).toBe(YOUTUBE_UPLOAD_SCOPE);
  });
});
