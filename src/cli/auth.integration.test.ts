/**
 * CLI shell-out integration tests for `golazo auth <kid>` (Plan 03-01).
 *
 * Uses GOLAZO_OAUTH_MOCK=1 to bypass the live Google OAuth endpoint so
 * tests run in CI without credentials. Each test gets its own sandbox HOME.
 *
 * Cases:
 *  1. HAPPY PATH: exit 0, stdout contains "token written to", file written with canned creds
 *  2. NEVER LOGS TOKEN: stdout + stderr never contain mock-access or mock-refresh
 *  3. UNKNOWN KID: exit 1, stderr contains "unknown kid 'alice'"
 *  4. MISSING CLIENT ID: exit 1, stderr contains "oauth: clientId: not provided"
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
import { spawn } from 'node:child_process';

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
// Shell-out helper
// ---------------------------------------------------------------------------

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(
  args: string[],
  env: Record<string, string | undefined>,
  stdin = '',
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

    child.stdin.write(stdin);
    child.stdin.end();

    child.on('close', (code) => { resolve({ code, stdout, stderr }); });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('golazo auth <kid> — CLI integration (GOLAZO_OAUTH_MOCK=1)', () => {
  let sandbox: string;

  afterEach(() => {
    if (sandbox) {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  // 1. HAPPY PATH
  it('1. happy path: exit 0, writes token file, stdout contains token path + channelId', async () => {
    sandbox = setupSandbox();
    const channelsPath = join(sandbox, 'tests/fixtures/golazo/channels.yaml');
    const expectedTokenPath = join(sandbox, 'tests/fixtures/golazo/leo.token.json');

    const result = await runCli(
      ['auth', 'leo', '--channels-config', channelsPath],
      {
        HOME: sandbox,
        GOOGLE_CLIENT_ID: 'test-cid',
        GOOGLE_CLIENT_SECRET: 'test-csecret',
        GOLAZO_OAUTH_MOCK: '1',
      },
      'fake-code\n',
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

  // 2. NEVER LOGS TOKEN
  it('2. never logs token bytes in stdout or stderr', async () => {
    sandbox = setupSandbox();
    const channelsPath = join(sandbox, 'tests/fixtures/golazo/channels.yaml');

    const result = await runCli(
      ['auth', 'leo', '--channels-config', channelsPath],
      {
        HOME: sandbox,
        GOOGLE_CLIENT_ID: 'test-cid',
        GOOGLE_CLIENT_SECRET: 'test-csecret',
        GOLAZO_OAUTH_MOCK: '1',
      },
      'fake-code\n',
    );

    expect(result.stdout).not.toContain('mock-access');
    expect(result.stdout).not.toContain('mock-refresh');
    expect(result.stderr).not.toContain('mock-access');
    expect(result.stderr).not.toContain('mock-refresh');
  }, 30_000);

  // 3. UNKNOWN KID
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
      'fake-code\n',
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('alice');
    expect(existsSync(unexpectedTokenPath)).toBe(false);
  }, 30_000);

  // 4. MISSING CLIENT ID
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
      'fake-code\n',
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('oauth: clientId: not provided');
  }, 30_000);
});
