/**
 * CLI shell-out integration tests for `golazo auth <kid>` (Plan 03-01,
 * reworked for the 127.0.0.1 loopback redirect — quick task 260622-d47).
 *
 * Uses GOLAZO_OAUTH_MOCK=1 to bypass the live Google OAuth endpoint so
 * tests run in CI without credentials. Each test gets its own sandbox HOME.
 *
 * The OOB stdin-paste flow is gone. The CLI now starts an ephemeral
 * 127.0.0.1 loopback server and prints a consent URL whose `redirect_uri`
 * points at that server. These tests simulate the browser redirect by
 * parsing `redirect_uri` from the consent URL line on stdout, then issuing
 * `http.get('http://127.0.0.1:<port>/?code=fake-code')`. The captured code
 * flows into the GOLAZO_OAUTH_MOCK exchange; the CLI writes the token and
 * exits 0 — no stdin handshake.
 *
 * Cases:
 *  1. HAPPY PATH: exit 0, stdout contains "token written to", file written with canned creds
 *  2. NEVER LOGS TOKEN: stdout + stderr never contain mock-access or mock-refresh
 *  3. UNKNOWN KID: exit 1, stderr contains "unknown kid 'alice'" (fails before server starts)
 *  4. MISSING CLIENT ID: exit 1, stderr contains "oauth: clientId: not provided" (fails before server starts)
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import http from 'node:http';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const FIXTURE_CHANNELS_DIR = resolve(REPO_ROOT, 'tests/fixtures/golazo');

// ---------------------------------------------------------------------------
// Sandbox helper
// ---------------------------------------------------------------------------

/**
 * Create a per-test sandbox HOME directory. Clones the fixture directory
 * and deletes committed token files so runAuth performs a real write.
 */
function setupSandbox(): string {
  const sandbox = mkdtempSync(join(tmpdir(), 'golazo-auth-'));
  cpSync(FIXTURE_CHANNELS_DIR, join(sandbox, 'tests/fixtures/golazo'), { recursive: true });
  // Delete committed token files — the point of auth is to CREATE them
  rmSync(join(sandbox, 'tests/fixtures/golazo/leo.token.json'), { force: true });
  rmSync(join(sandbox, 'tests/fixtures/golazo/mateo.token.json'), { force: true });
  return sandbox;
}

// ---------------------------------------------------------------------------
// Shell-out helpers
// ---------------------------------------------------------------------------

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Spawn the CLI without driving the loopback flow. Suitable for error-path
 * cases (unknown kid, missing client id) that fail BEFORE the loopback
 * server starts, so no browser-redirect simulation is needed.
 */
async function runCli(
  args: string[],
  env: Record<string, string | undefined>,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'src/cli/index.ts', ...args], {
      env: { ...process.env, ...env },
      cwd: REPO_ROOT,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    // No stdin handshake under loopback — close stdin immediately.
    child.stdin.end();

    child.on('close', (code) => { resolve({ code, stdout, stderr }); });
  });
}

/** Extract the first `http://127.0.0.1:<port>` redirect_uri from accumulated stdout. */
function parseRedirectUri(stdout: string): string | null {
  // The consent URL is a single long line; find it and read its redirect_uri param.
  const urlMatch = stdout.match(/https:\/\/\S+/);
  if (!urlMatch) return null;
  try {
    const consentUrl = new URL(urlMatch[0]);
    const redirectUri = consentUrl.searchParams.get('redirect_uri');
    if (redirectUri && /^http:\/\/127\.0\.0\.1:\d+$/.test(redirectUri)) {
      return redirectUri;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Issue a one-shot GET to the loopback capture server to deliver the code. */
function deliverCode(redirectUri: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${redirectUri}/?code=${encodeURIComponent(code)}`, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', reject);
  });
}

/**
 * Spawn the CLI and drive the loopback flow: wait for the consent URL line,
 * parse its redirect_uri, then GET the loopback port with the fake code.
 */
async function runCliLoopback(
  args: string[],
  env: Record<string, string | undefined>,
  code: string,
): Promise<RunResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child: ChildProcessWithoutNullStreams = spawn(
      'npx',
      ['tsx', 'src/cli/index.ts', ...args],
      {
        env: { ...process.env, ...env },
        cwd: REPO_ROOT,
      },
    );

    let stdout = '';
    let stderr = '';
    let delivered = false;

    child.stdin.end();

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!delivered) {
        const redirectUri = parseRedirectUri(stdout);
        if (redirectUri) {
          delivered = true;
          // Give the loopback listener a beat to be fully ready, then deliver.
          deliverCode(redirectUri, code).catch(rejectRun);
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('error', rejectRun);
    child.on('close', (exitCode) => {
      resolveRun({ code: exitCode, stdout, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('golazo auth <kid> — CLI integration (GOLAZO_OAUTH_MOCK=1, loopback)', () => {
  let sandbox: string;

  afterEach(() => {
    if (sandbox) {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  // 1. HAPPY PATH (loopback)
  it('1. happy path: loopback redirect delivers code, exit 0, writes token file', async () => {
    sandbox = setupSandbox();
    const channelsPath = join(sandbox, 'tests/fixtures/golazo/channels.yaml');
    const expectedTokenPath = join(sandbox, 'tests/fixtures/golazo/leo.token.json');

    const result = await runCliLoopback(
      ['auth', 'leo', '--channels-config', channelsPath],
      {
        HOME: sandbox,
        GOOGLE_CLIENT_ID: 'test-cid',
        GOOGLE_CLIENT_SECRET: 'test-csecret',
        GOLAZO_OAUTH_MOCK: '1',
      },
      'fake-code',
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('token written to');
    expect(result.stdout).toContain('UC_FIXTURE_LEO_CHANNEL_ID');
    expect(existsSync(expectedTokenPath)).toBe(true);

    const parsed = JSON.parse(readFileSync(expectedTokenPath, 'utf8'));
    expect(parsed.access_token).toBe('mock-access');
    expect(parsed.refresh_token).toBe('mock-refresh');

    const mode = statSync(expectedTokenPath).mode & 0o777;
    expect(mode).toBe(0o600);
  }, 30_000);

  // 2. NEVER LOGS TOKEN (loopback)
  it('2. never logs token bytes in stdout or stderr', async () => {
    sandbox = setupSandbox();
    const channelsPath = join(sandbox, 'tests/fixtures/golazo/channels.yaml');

    const result = await runCliLoopback(
      ['auth', 'leo', '--channels-config', channelsPath],
      {
        HOME: sandbox,
        GOOGLE_CLIENT_ID: 'test-cid',
        GOOGLE_CLIENT_SECRET: 'test-csecret',
        GOLAZO_OAUTH_MOCK: '1',
      },
      'fake-code',
    );

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('mock-access');
    expect(result.stdout).not.toContain('mock-refresh');
    expect(result.stderr).not.toContain('mock-access');
    expect(result.stderr).not.toContain('mock-refresh');
  }, 30_000);

  // 3. UNKNOWN KID — fails before the loopback server starts, no redirect needed.
  it('3. unknown kid: exit 1, stderr contains "unknown kid"', async () => {
    sandbox = setupSandbox();
    const channelsPath = join(sandbox, 'tests/fixtures/golazo/channels.yaml');
    const unexpectedTokenPath = join(sandbox, 'tests/fixtures/golazo/alice.token.json');

    const result = await runCli(
      ['auth', 'alice', '--channels-config', channelsPath],
      {
        HOME: sandbox,
        GOOGLE_CLIENT_ID: 'test-cid',
        GOOGLE_CLIENT_SECRET: 'test-csecret',
        GOLAZO_OAUTH_MOCK: '1',
      },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('alice');
    expect(existsSync(unexpectedTokenPath)).toBe(false);
  }, 30_000);

  // 4. MISSING CLIENT ID — fails before the loopback server starts, no redirect needed.
  it('4. missing GOOGLE_CLIENT_ID: exit 1, stderr contains "oauth: clientId: not provided"', async () => {
    sandbox = setupSandbox();
    const channelsPath = join(sandbox, 'tests/fixtures/golazo/channels.yaml');

    // Remove GOOGLE_CLIENT_ID and GOLAZO_OAUTH_MOCK from env
    const env: Record<string, string | undefined> = {
      HOME: sandbox,
      GOOGLE_CLIENT_SECRET: 'test-csecret',
      GOOGLE_CLIENT_ID: undefined,
      GOLAZO_OAUTH_MOCK: undefined,
    };

    const result = await runCli(
      ['auth', 'leo', '--channels-config', channelsPath],
      env,
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('oauth: clientId: not provided');
  }, 30_000);
});
