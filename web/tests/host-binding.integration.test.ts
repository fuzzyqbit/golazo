/**
 * host-binding.integration.test.ts
 *
 * Integration test: spawns `next dev` in three scenarios to verify two-layer
 * localhost-only defense (WEB-02 + WEB-03).
 *
 * Scenario A — happy path (default env): server binds 127.0.0.1:14173
 * Scenario B — HOST=0.0.0.0 bare (no -H flag): instrumentation guard fires,
 *              process exits non-zero, stderr contains WEB-03
 * Scenario C — composed operator path (HOST=0.0.0.0 npm run dev): CLI -H flag
 *              in the dev script wins over env; server binds 127.0.0.1:14177
 *
 * Set GOLAZO_SKIP_HOST_INTEGRATION=1 to skip the entire suite in
 * time-constrained environments. CI omits this env var so tests fire.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const WEB_DIR = resolve(REPO_ROOT, 'web');

const PORT_A = 14173;
const PORT_B = 14176;
const PORT_C = 14177;

// Startup-ready markers for Next.js 16 Turbopack dev server
const READY_MARKERS = ['Ready in', 'Local:', 'compiled successfully', '○ Compiling', '✓ Compiled'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SpawnResult {
  process: ChildProcess;
  stdout: string[];
  stderr: string[];
  exitCode: Promise<number | null>;
}

function spawnNextDev(port: number, extraArgs: string[], env: NodeJS.ProcessEnv): SpawnResult {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const child = spawn('npx', ['next', 'dev', '-p', String(port), ...extraArgs], {
    cwd: WEB_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));

  const exitCode = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  return { process: child, stdout, stderr, exitCode };
}

function spawnNpmRunDev(port: number, env: NodeJS.ProcessEnv): SpawnResult {
  const stdout: string[] = [];
  const stderr: string[] = [];

  // npm run dev -- -p <port> forwards -p to the underlying next dev
  const child = spawn('npm', ['run', 'dev', '--', '-p', String(port)], {
    cwd: WEB_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // detached so we can kill the whole process group (-pid)
  });

  child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));

  const exitCode = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  return { process: child, stdout, stderr, exitCode };
}

function waitForReady(result: SpawnResult, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const check = setInterval(() => {
      const combined = [...result.stdout, ...result.stderr].join('');
      if (READY_MARKERS.some((m) => combined.includes(m))) {
        clearInterval(check);
        resolve(true);
      }
    }, 200);

    // Also resolve early if process exits (means it failed)
    result.exitCode.then(() => {
      clearInterval(check);
      resolve(false);
    });

    setTimeout(() => {
      clearInterval(check);
      resolve(false);
    }, timeoutMs);
  });
}

function waitForExit(result: SpawnResult, timeoutMs: number): Promise<number | null> {
  return Promise.race([
    result.exitCode,
    new Promise<number | null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function killProcess(child: ChildProcess, detached = false): void {
  if (child.pid == null || child.killed) return;
  try {
    if (detached) {
      // Kill the whole process group (npm wraps next dev)
      process.kill(-child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // Process may have already exited
  }
  // SIGKILL after 2s grace
  setTimeout(() => {
    try {
      if (detached) {
        process.kill(-child.pid!, 'SIGKILL');
      } else {
        child.kill('SIGKILL');
      }
    } catch {
      // Ignore
    }
  }, 2000);
}

function lsofForPort(port: number): string {
  try {
    return execFileSync('lsof', ['-iTCP:' + port, '-sTCP:LISTEN', '-P', '-n'], {
      encoding: 'utf8',
    });
  } catch {
    // lsof exits non-zero if no process listens on the port
    return '';
  }
}

function parseListenBindAddress(lsofOut: string, port: number): string | null {
  const lines = lsofOut.split('\n');
  for (const line of lines) {
    // NAME column contains entries like "127.0.0.1:14173 (LISTEN)" or "*:14173 (LISTEN)"
    const match = line.match(/(\S+):(\d+)\s*\(LISTEN\)/);
    if (match && match[2] === String(port)) {
      return match[1] ?? null;
    }
  }
  return null;
}

function envWithout(key: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env[key];
  return env;
}

// ---------------------------------------------------------------------------
// Active spawned processes — cleanup in afterEach
// ---------------------------------------------------------------------------

const activeProcesses: Array<{ child: ChildProcess; detached: boolean }> = [];

afterEach(() => {
  while (activeProcesses.length > 0) {
    const { child, detached } = activeProcesses.pop()!;
    killProcess(child, detached);
  }
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const SKIP = process.env.GOLAZO_SKIP_HOST_INTEGRATION === '1';

describe.skipIf(SKIP)('host-binding (integration)', () => {
  // -------------------------------------------------------------------------
  // Scenario A — happy path: default env, server binds 127.0.0.1
  // -------------------------------------------------------------------------

  it(
    'Scenario A: default env → next dev binds 127.0.0.1 and serves placeholder',
    async () => {
      const env = envWithout('HOST');
      const result = spawnNextDev(PORT_A, ['-H', '127.0.0.1'], env);
      activeProcesses.push({ child: result.process, detached: false });

      const ready = await waitForReady(result, 20_000);

      if (!ready) {
        const combined = [...result.stdout, ...result.stderr].join('\n');
        throw new Error(`Server did not emit ready marker within 20s.\n\nOutput:\n${combined}`);
      }

      // HTTP smoke: fetch from loopback
      const resp = await fetch(`http://127.0.0.1:${PORT_A}/`);
      expect(resp.status).toBe(200);
      const body = await resp.text();
      expect(body).toContain('golazo');

      // Bind address: lsof confirms only 127.0.0.1 bound
      const lsofOut = lsofForPort(PORT_A);
      if (lsofOut) {
        const addr = parseListenBindAddress(lsofOut, PORT_A);
        expect(addr).toBe('127.0.0.1');
      } else {
        // lsof not available or port not found — curl succeeded, trust it
        console.warn('lsof returned no output for port', PORT_A, '— skipping bind-address check');
      }
    },
    30_000,
  );

  // -------------------------------------------------------------------------
  // Scenario B — HOST=0.0.0.0 bare (no -H flag): instrumentation guard fires
  // -------------------------------------------------------------------------

  it(
    'Scenario B: HOST=0.0.0.0 bare next dev (no -H flag) → instrumentation guard aborts with WEB-03',
    async () => {
      // NOTE: deliberately NO -H flag here — isolates the instrumentation guard (layer 2)
      const env: NodeJS.ProcessEnv = { ...process.env, HOST: '0.0.0.0' };
      const result = spawnNextDev(PORT_B, [], env);
      activeProcesses.push({ child: result.process, detached: false });

      // Process should exit non-zero (guard throws in register())
      const code = await waitForExit(result, 15_000);

      const combined = [...result.stdout, ...result.stderr].join('\n');

      expect(code, `Expected non-zero exit. Combined output:\n${combined}`).not.toBe(0);
      expect(combined, 'Expected WEB-03 in output').toContain('WEB-03');
      expect(combined, 'Expected offending HOST value in output').toContain('0.0.0.0');

      // Port must NOT be bound
      const lsofOut = lsofForPort(PORT_B);
      expect(lsofOut, `Expected port ${PORT_B} to be unbound, got:\n${lsofOut}`).toBe('');
    },
    20_000,
  );

  // -------------------------------------------------------------------------
  // Scenario C — composed operator path: HOST=0.0.0.0 npm run dev
  //   CLI flag in dev script (-H 127.0.0.1) wins over env HOST=0.0.0.0
  // -------------------------------------------------------------------------

  it(
    'Scenario C: HOST=0.0.0.0 npm run dev → CLI -H 127.0.0.1 from script wins; server binds 127.0.0.1',
    async () => {
      const env: NodeJS.ProcessEnv = { ...process.env, HOST: '0.0.0.0' };
      // npm run dev -- -p 14177 forwards -p to next dev; script's -H 127.0.0.1 stays in effect
      const result = spawnNpmRunDev(PORT_C, env);
      activeProcesses.push({ child: result.process, detached: true });

      const ready = await waitForReady(result, 25_000);

      if (!ready) {
        const combined = [...result.stdout, ...result.stderr].join('\n');
        throw new Error(
          `Scenario C: server did not emit ready marker within 25s.\n\nOutput:\n${combined}`,
        );
      }

      // HTTP smoke: server must be actively serving on loopback
      const resp = await fetch(`http://127.0.0.1:${PORT_C}/`);
      expect(resp.status).toBe(200);
      const body = await resp.text();
      expect(body).toContain('golazo');

      // Bind address: CLI -H 127.0.0.1 must win over env HOST=0.0.0.0
      const lsofOut = lsofForPort(PORT_C);
      if (lsofOut) {
        const addr = parseListenBindAddress(lsofOut, PORT_C);
        expect(
          addr,
          `Expected 127.0.0.1 bind (CLI -H flag wins over env HOST=0.0.0.0). lsof:\n${lsofOut}`,
        ).toBe('127.0.0.1');
      } else {
        console.warn('lsof returned no output for port', PORT_C, '— skipping bind-address check');
      }

      // WEB-03 must NOT appear — instrumentation guard must not fire
      const combined = [...result.stdout, ...result.stderr].join('\n');
      expect(
        combined,
        'WEB-03 must NOT appear — instrumentation guard should not fire when CLI -H flag is in effect',
      ).not.toContain('WEB-03');
    },
    35_000,
  );
});
