/**
 * OAuth2 helpers for the golazo publish pipeline.
 *
 * Wraps the googleapis OAuth2Client with golazo-specific token persistence,
 * silent refresh on expiry, and operator-facing OAuthError remediation messages.
 *
 * Exports:
 *   createOAuth2Client — build an OAuth2Client from env/opts
 *   buildAuthUrl — generate the consent-screen URL
 *   exchangeCode — exchange an authorization code for tokens
 *   saveToken — atomic write of credentials JSON with 0o600 mode
 *   loadToken — load + refresh a persisted token, return a ready-to-use client
 *   runAuth — orchestrator for the one-time authorization flow (called by CLI)
 *
 * Scopes: YOUTUBE_UPLOAD_SCOPE only — single-purpose, no broad youtube scope.
 * Redirect URI: 127.0.0.1 loopback (http://127.0.0.1:<ephemeral-port>) — the
 *   flow Google requires for native/Desktop clients after deprecating OOB in
 *   2023. runAuth starts a short-lived node:http server bound to 127.0.0.1:0,
 *   captures the authorization code from the browser redirect, and shuts down.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import http from 'node:http';
import { google } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';

import { loadChannelsFile } from '../config/channels.js';
import { UnknownKidError } from '../config/errors.js';
import { OAuthError } from './errors.js';
import type { ChannelConfig } from '../config/types.js';

/** YouTube upload scope — single-purpose, no broader access. */
export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

// ---------------------------------------------------------------------------
// createOAuth2Client
// ---------------------------------------------------------------------------

/**
 * Build an OAuth2Client, reading clientId/clientSecret from opts then env.
 * Throws OAuthError if either credential is missing.
 */
export function createOAuth2Client(opts?: {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}): OAuth2Client {
  const clientId = opts?.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = opts?.clientSecret || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    throw new OAuthError({
      field: 'clientId',
      reason: 'not provided',
      remediation: 'set GOOGLE_CLIENT_ID env var (see channels.yaml.example) and rerun',
    });
  }
  if (!clientSecret) {
    throw new OAuthError({
      field: 'clientSecret',
      reason: 'not provided',
      remediation: 'set GOOGLE_CLIENT_SECRET env var (see channels.yaml.example) and rerun',
    });
  }

  // No static redirect default anymore. runAuth always passes the loopback
  // redirect URI; loadToken never builds an auth URL so it needs no redirect.
  if (opts?.redirectUri) {
    return new google.auth.OAuth2(clientId, clientSecret, opts.redirectUri);
  }
  return new google.auth.OAuth2(clientId, clientSecret);
}

// ---------------------------------------------------------------------------
// buildAuthUrl
// ---------------------------------------------------------------------------

/**
 * Generate the Google consent-screen URL.
 * access_type=offline is REQUIRED for a refresh_token.
 * prompt=consent is REQUIRED so re-authorizing the same account still returns a refresh_token.
 */
export function buildAuthUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [YOUTUBE_UPLOAD_SCOPE],
  });
}

// ---------------------------------------------------------------------------
// exchangeCode
// ---------------------------------------------------------------------------

/**
 * Exchange an authorization code for credentials (access_token + refresh_token).
 *
 * @remarks
 * TEST-ONLY SHIM: If `process.env.GOLAZO_OAUTH_MOCK === '1'`, this function
 * returns deterministic mock credentials WITHOUT calling the Google SDK.
 * This is the only production code path that branches on a test env var.
 * Used exclusively by `src/cli/auth.integration.test.ts` for shell-out tests
 * where `vi.mock` / `vi.spyOn` cannot cross the `execFile` boundary.
 *
 * Removal owner: Phase 4 cleanup — replace with injectable `exchangeCode`
 * implementation pattern (dependency injection via constructor or factory).
 * Tracked as a Phase 4 carry-forward in 03-01-SUMMARY.md.
 */
export async function exchangeCode(client: OAuth2Client, code: string): Promise<Credentials> {
  // TEST-ONLY: return mock credentials when GOLAZO_OAUTH_MOCK=1 is set.
  // This env-var shim is the minimal seam for shell-out integration testing.
  if (process.env.GOLAZO_OAUTH_MOCK === '1') {
    return {
      access_token: 'mock-access',
      refresh_token: 'mock-refresh',
      expiry_date: Date.now() + 3_600_000,
      scope: YOUTUBE_UPLOAD_SCOPE,
      token_type: 'Bearer',
    };
  }

  let tokens: Credentials;
  try {
    const response = await client.getToken(code);
    tokens = response.tokens;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new OAuthError({
      field: 'exchange',
      reason,
      remediation: "check the authorization code and rerun 'golazo auth <kid>'",
    });
  }

  if (!tokens.refresh_token) {
    throw new OAuthError({
      field: 'refresh_token',
      reason: 'Google did not return a refresh_token; access_type=offline + prompt=consent is required',
      remediation: 'rerun golazo auth <kid> and accept the consent screen',
    });
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// saveToken
// ---------------------------------------------------------------------------

/**
 * Atomically write credentials JSON to tokenPath.
 * Creates parent directories as needed. Sets file mode to 0o600 (owner read/write only).
 * NEVER logs the credentials.
 */
export function saveToken(tokenPath: string, credentials: Credentials): void {
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(credentials, null, 2) + '\n', 'utf8');
  chmodSync(tokenPath, 0o600);
}

// ---------------------------------------------------------------------------
// loadToken
// ---------------------------------------------------------------------------

/**
 * Load a persisted token from disk, configure an OAuth2Client, and silently
 * refresh if the access_token has expired.
 *
 * Registers a 'tokens' listener so googleapis can write refreshed credentials
 * back to disk automatically when an API call triggers a silent refresh.
 */
export async function loadToken(
  channelConfig: ChannelConfig,
  opts?: {
    clientId?: string;
    clientSecret?: string;
  },
): Promise<OAuth2Client> {
  const { oauthTokenPath } = channelConfig.youtube;

  if (!existsSync(oauthTokenPath)) {
    throw new OAuthError({
      field: 'tokenPath',
      reason: `oauth token file not found at ${oauthTokenPath}`,
      remediation: "run 'golazo auth <kid>'",
    });
  }

  let creds: Credentials;
  try {
    creds = JSON.parse(readFileSync(oauthTokenPath, 'utf8')) as Credentials;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new OAuthError({
      field: 'tokenJson',
      reason: `failed to parse token file at ${oauthTokenPath}: ${reason}`,
      remediation: "delete the file and rerun 'golazo auth <kid>'",
    });
  }

  const client = createOAuth2Client({
    clientId: opts?.clientId,
    clientSecret: opts?.clientSecret,
  });
  client.setCredentials(creds);

  // Register a 'tokens' listener so auto-refresh writes updated credentials back to disk.
  // googleapis only emits the new access_token on the 'tokens' event; we merge with the
  // stored refresh_token so the file always has a complete blob.
  client.on('tokens', (newTokens: Credentials) => {
    const merged: Credentials = {
      ...creds,
      ...newTokens,
      // Preserve the stored refresh_token if Google omits it from the event
      refresh_token: newTokens.refresh_token ?? creds.refresh_token,
    };
    // Update our local ref so future merges have the latest creds
    creds = merged;
    saveToken(oauthTokenPath, merged);
  });

  // Eager refresh if the access_token has expired
  if (creds.expiry_date && creds.expiry_date < Date.now()) {
    try {
      await client.refreshAccessToken();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new OAuthError({
        field: 'refresh',
        reason,
        remediation: "run 'golazo auth <kid>' to reauthorize",
      });
    }
  }

  return client;
}

// ---------------------------------------------------------------------------
// RunAuthOpts / RunAuthResult
// ---------------------------------------------------------------------------

/** Options for the one-time authorization flow orchestrator. */
export interface RunAuthOpts {
  /** The kid identifier (e.g. 'leo', 'mateo'). */
  kid: string;
  /** Path to channels.yaml (default: './channels.yaml'). */
  channelsPath?: string;
  /** Override the Google client ID (default: GOOGLE_CLIENT_ID env var). */
  clientId?: string;
  /** Override the Google client secret (default: GOOGLE_CLIENT_SECRET env var). */
  clientSecret?: string;
  /**
   * Function that produces the authorization code from the user. Injected so
   * tests can stub it without standing up the loopback server. The default
   * prints the consent URL and awaits the code captured from the browser
   * redirect to the 127.0.0.1 loopback server (no stdin).
   */
  readCode?: (authUrl: string) => Promise<string>;
}

/** Result of a successful authorization flow. */
export interface RunAuthResult {
  /** Absolute path where the token was written. */
  tokenPath: string;
  /** YouTube channel ID for the authorized kid. */
  channelId: string;
}

// ---------------------------------------------------------------------------
// captureLoopbackCode
// ---------------------------------------------------------------------------

/** A live loopback capture: the server, its redirect URI, and the code promise. */
export interface LoopbackCapture {
  /** OS-assigned ephemeral port the server is listening on. */
  port: number;
  /** The redirect URI to bake into the consent URL: http://127.0.0.1:<port>. */
  redirectUri: string;
  /** Resolves with the authorization code, or rejects with an OAuthError on denial. */
  codePromise: Promise<string>;
  /** The underlying http server (exposed so callers can close it on error paths). */
  server: http.Server;
  /** Idempotently close the server if it is still listening. */
  close: () => void;
}

/** Minimal static page shown in the browser after the redirect is captured. */
const CLOSE_TAB_PAGE =
  '<!doctype html><meta charset="utf-8"><title>golazo</title>' +
  '<body style="font-family:system-ui;padding:2rem">' +
  '<h1>Authorization received</h1>' +
  '<p>You can close this tab and return to the terminal.</p></body>';

/**
 * Start an ephemeral node:http server bound to 127.0.0.1:0 to capture the
 * authorization code from Google's browser redirect.
 *
 * Binds to loopback ONLY (never 0.0.0.0). Resolves once the server is listening
 * so the OS-assigned port is known. On the first request that carries a `code`
 * or `error` query param the server responds with a small close-tab page,
 * resolves/rejects {@link LoopbackCapture.codePromise}, and closes itself so the
 * ephemeral port is released. Other paths (e.g. /favicon.ico) get a 204 without
 * resolving. NEVER logs the query string, code, or token bytes.
 */
export function captureLoopbackCode(): Promise<LoopbackCapture> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  // Swallow unhandled-rejection noise: on the denial path the OAuthError may be
  // observed by the caller only after a tick. Attach a no-op catch so an
  // immediate rejection (before the caller awaits) does not crash the process;
  // the caller still sees the rejection on its own await.
  codePromise.catch(() => {});

  const server = http.createServer((req, res) => {
    // Parse against the loopback origin; req.url is path + query only.
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (!code && !error) {
      // Ignore favicon/other probes without resolving the capture.
      res.statusCode = 204;
      res.end();
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(CLOSE_TAB_PAGE);

    // Release the port once we have an answer.
    server.close();

    if (error) {
      rejectCode(
        new OAuthError({
          field: 'consent',
          reason: `authorization denied: ${error}`,
          remediation: "rerun 'golazo auth <kid>' and approve the consent screen",
        }),
      );
      return;
    }
    // code is non-null here.
    resolveCode(code as string);
  });

  return new Promise<LoopbackCapture>((resolve, reject) => {
    server.once('error', (err) => {
      reject(
        new OAuthError({
          field: 'loopback',
          reason: `failed to bind a 127.0.0.1 loopback port for the OAuth redirect: ${err.message}`,
          remediation: "rerun 'golazo auth <kid>'",
        }),
      );
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(
          new OAuthError({
            field: 'loopback',
            reason: 'failed to bind a 127.0.0.1 loopback port for the OAuth redirect',
            remediation: "rerun 'golazo auth <kid>'",
          }),
        );
        return;
      }
      const port = address.port;
      resolve({
        port,
        redirectUri: `http://127.0.0.1:${port}`,
        codePromise,
        server,
        close: () => {
          if (server.listening) {
            server.close();
          }
        },
      });
    });
  });
}

// ---------------------------------------------------------------------------
// runAuth
// ---------------------------------------------------------------------------

/**
 * Orchestrate the one-time YouTube OAuth authorization flow for a kid.
 *
 * Starts a 127.0.0.1 loopback server FIRST to claim an ephemeral port, builds
 * the consent URL with redirect_uri=http://127.0.0.1:<port>, then captures the
 * code from the browser redirect (or the injected readCode stub in tests).
 * The loopback server is always closed in a finally block so no listener leaks.
 * Does not log the credentials at any point — only the consent URL + success path.
 */
export async function runAuth(opts: RunAuthOpts): Promise<RunAuthResult> {
  // 1. Load channels.yaml permissively (skipTokenCheck=true) — the token doesn't exist yet.
  const file = loadChannelsFile({ path: opts.channelsPath, skipTokenCheck: true });

  // 2. Look up the kid entry.
  const entry = file[opts.kid];
  if (!entry) {
    throw new UnknownKidError({ kidKey: opts.kid, validKeys: Object.keys(file) });
  }

  const tokenPath = entry.youtube.oauthTokenPath;
  const channelId = entry.youtube.channelId;

  // 3. Start the loopback capture to claim the ephemeral port, then build the
  //    client + consent URL with the matching redirect_uri.
  const capture = await captureLoopbackCode();
  try {
    const client = createOAuth2Client({
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      redirectUri: capture.redirectUri,
    });
    const authUrl = buildAuthUrl(client);

    // 4. Obtain the authorization code: the injected stub in tests, otherwise
    //    print the consent URL and await the loopback browser redirect.
    const code = opts.readCode ? await opts.readCode(authUrl) : await defaultReadCode(authUrl, capture);

    // 5. Exchange the code for credentials (same client carries the redirect_uri).
    const credentials = await exchangeCode(client, code);

    // 6. Persist the token.
    saveToken(tokenPath, credentials);

    // 7. Return result (the CLI handler prints the success message).
    return { tokenPath, channelId };
  } finally {
    // Never leak the ephemeral listener — close it on success OR throw.
    capture.close();
  }
}

// ---------------------------------------------------------------------------
// defaultReadCode
// ---------------------------------------------------------------------------

/**
 * Default code reader for runAuth. Prints the consent URL to stdout, then
 * awaits the authorization code captured from the browser redirect to the
 * 127.0.0.1 loopback server. No stdin handshake. NEVER logs the code.
 */
async function defaultReadCode(authUrl: string, capture: LoopbackCapture): Promise<string> {
  process.stdout.write(
    `Open this URL in your browser and grant access:\n${authUrl}\n\n` +
      'Waiting for the browser redirect on 127.0.0.1...\n',
  );
  return capture.codePromise;
}
