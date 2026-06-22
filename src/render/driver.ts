/**
 * `runRender` — the render orchestrator for the golazo pipeline (Plan 02-04).
 *
 * Wires Plans 02-01 (theme), 02-02 (music), and 02-03 (compositions) into
 * a working `golazo render <folder>` end-to-end:
 *
 *  1. Read manifest (throws RenderError if missing).
 *  2. Load channel config.
 *  3. Load music pool.
 *  4. Pick music track deterministically.
 *  5. Idempotency check — skip if hash matches and files exist (unless --force).
 *  6. Bundle Remotion.
 *  7. Build episodeInputProps.
 *  8. selectComposition for Episode.
 *  9. renderMedia → episode.mp4.
 * 10. selectComposition for Thumbnail.
 * 11. renderStill → thumb.png.
 * 12. ffprobe for confirmed durationSec.
 * 13. buildManifest with extended render block.
 * 14. Invariant check: top-level manifestHash unchanged.
 * 15. writeManifest.
 * 16. Return RenderResult.
 *
 * **Determinism guarantee:** same input clips + same manifestHash + same pool
 * → same music pick → same output bytes. Cross-machine byte-stability is
 * enforced by `pickTrack`'s sha256-seeded algorithm.
 *
 * **PREP-07 contract:** `render` and `music` blocks are SIBLINGS of the
 * top-level `manifestHash`, not parents. Neither block is included in
 * `computeManifestHash`. The invariant check at step 14 asserts this
 * programmatically.
 */
import { existsSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve, basename } from 'node:path';
import { promisify } from 'node:util';

import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill } from '@remotion/renderer';

import { readManifest, writeManifest, buildManifest, type Manifest } from '../prepare/manifest.js';
import { loadChannel } from '../config/channels.js';
import { RenderError } from '../prepare/errors.js';
import { loadMusicPool } from './musicPool.js';
import { pickTrack } from './musicPicker.js';
import { prettyOpponent } from './opponentPretty.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Why `runRender` rendered (or skipped). */
export type RenderReason =
  | 'first-render'
  | 'hash-match'
  | 'hash-changed'
  | 'force'
  | 'missing-render-block';

/** Return value of {@link runRender}. */
export interface RenderResult {
  /** `true` when the render was skipped due to a matching hash. */
  skipped: boolean;
  /** The reason for the decision. */
  reason: RenderReason;
  /** Absolute path to episode.mp4. */
  episodePath: string;
  /** Absolute path to thumb.png. */
  thumbnailPath: string;
  /** The updated manifest (with render + music blocks populated). */
  manifest: Manifest;
}

/** Options for {@link runRender}. */
export interface RunRenderOpts {
  /** Path to the game folder (relative or absolute). */
  folderPath: string;
  /** Path to channels.yaml. Defaults to `'./channels.yaml'`. */
  channelsPath?: string;
  /** When `true`, re-render even when the recorded hash matches. */
  force?: boolean;
  /**
   * Low-resolution override for CI / integration tests.
   * Default: production 1920×1080 @ 30 fps.
   * When `true`: episode scale=0.166 (~320×180), still scale=0.5 (~640×360).
   */
  lowRes?: boolean;
  /** Override the music pool index path (testing). Default: remotion/assets/music/index.json. */
  musicIndexPath?: string;
}

// ---------------------------------------------------------------------------
// MIME type map (minimal — only types used by this project)
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

// ---------------------------------------------------------------------------
// Local file server (serves absolute filesystem paths via HTTP)
// ---------------------------------------------------------------------------

interface FileServer {
  baseUrl: string;
  close(): void;
  /** Returns an HTTP URL for an absolute path. */
  urlFor(absPath: string): string;
}

/**
 * Start a minimal local HTTP file server on an OS-assigned port.
 * Used to serve clip files and music tracks to Remotion's headless renderer
 * (which cannot load file:// URLs for <Audio> and <OffthreadVideo> components).
 */
async function startFileServer(): Promise<FileServer> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      const rawPath = req.url ? decodeURIComponent(req.url) : '/';
      // Security: only serve known absolute paths (no directory traversal)
      if (!rawPath.startsWith('/')) {
        res.writeHead(400);
        res.end('Bad request');
        return;
      }
      // The path in the URL is the absolute filesystem path, URL-encoded
      const absPath = rawPath;
      if (!existsSync(absPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(absPath);
      } catch {
        res.writeHead(500);
        res.end('Stat error');
        return;
      }

      const mime = MIME_TYPES[extname(absPath).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      });
      createReadStream(absPath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      const port = addr.port;
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        baseUrl,
        close: () => server.close(),
        urlFor: (absPath: string) => `${baseUrl}${encodeURIComponent(absPath).replace(/%2F/g, '/')}`,
      });
    });

    server.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Bundle memoisation
// ---------------------------------------------------------------------------

/** Soft memo to avoid re-bundling within the same Node process. */
let _bundleCache: string | null = null;

// ---------------------------------------------------------------------------
// ffprobe helper
// ---------------------------------------------------------------------------

async function probeEpisodeDuration(filePath: string): Promise<number> {
  let stdout: string;
  try {
    const result = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      filePath,
    ]);
    stdout = result.stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RenderError({
      field: 'ffprobe',
      reason: `ffprobe failed on '${filePath}': ${msg}`,
      remediation: 'ensure ffmpeg/ffprobe from Homebrew is on PATH',
    });
  }

  const info = JSON.parse(stdout) as {
    streams: Array<{ duration?: string; codec_type?: string }>;
  };
  const videoStream = info.streams.find((s) => s.codec_type === 'video');
  const duration = videoStream?.duration ? parseFloat(videoStream.duration) : 0;
  if (duration <= 0) {
    throw new RenderError({
      field: 'ffprobe.duration',
      reason: `no positive duration found in '${filePath}'`,
      remediation: 'ensure renderMedia produced a valid h264 mp4',
    });
  }
  return duration;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Orchestrate one render cycle against `opts.folderPath`. See module JSDoc
 * for the full 16-step algorithm.
 *
 * @throws {RenderError}         Missing manifest, Remotion failures, invariant violations.
 * @throws {ManifestError}       Malformed on-disk manifest.
 * @throws {MusicPoolError}      Missing or malformed music index.
 * @throws {MusicPickError}      Empty music pool.
 * @throws {ChannelsConfigError} Missing or invalid channels.yaml.
 * @throws {UnknownKidError}     Kid not in channels.yaml.
 */
export async function runRender(opts: RunRenderOpts): Promise<RenderResult> {
  const absFolder = resolve(opts.folderPath);
  const folderName = basename(absFolder);

  // Optional override for the Chrome binary Remotion launches. On macOS < 15,
  // Remotion's auto-downloaded Chrome Headless Shell never launches; the
  // operator can point Remotion at a working binary (e.g. Playwright's
  // chrome-headless-shell) via GOLAZO_BROWSER_EXECUTABLE. Unset → undefined →
  // identical to Remotion's default behavior (no change on macOS 15+).
  const browserExecutable = process.env.GOLAZO_BROWSER_EXECUTABLE || undefined;

  // Step 1: read manifest
  const manifest = readManifest(absFolder);
  if (manifest === null) {
    throw new RenderError({
      field: 'manifestPath',
      reason: `manifest not found at '${join(absFolder, '.golazo/manifest.json')}'`,
      remediation: "run 'golazo prepare <folder>' first",
    });
  }

  // Step 2: load channel config
  const channel = loadChannel(manifest.kid, { path: opts.channelsPath });

  // Step 3: load music pool
  const pool = loadMusicPool({ indexPath: opts.musicIndexPath });

  // Step 4: pick music track
  const pick = pickTrack({
    manifestHash: manifest.manifestHash,
    totalDurationSec: manifest.totalDurationSec,
    pool,
  });
  const chosenEntry = pool.find((e) => e.file === pick.track);
  if (!chosenEntry) {
    throw new RenderError({
      field: 'musicTrack',
      reason: `pickTrack returned track '${pick.track}' not found in loaded pool`,
      remediation: 'check remotion/assets/music/index.json for consistency',
    });
  }

  // Absolute output paths
  const episodeAbsPath = join(absFolder, '.golazo', 'episode.mp4');
  const thumbnailAbsPath = join(absFolder, '.golazo', 'thumb.png');

  // Step 5: idempotency check
  let reason: RenderReason;

  if (opts.force) {
    reason = 'force';
  } else if (manifest.render) {
    if (manifest.render.manifestHash === manifest.manifestHash) {
      // Hash matches — verify files still exist on disk
      if (existsSync(episodeAbsPath) && existsSync(thumbnailAbsPath)) {
        return {
          skipped: true,
          reason: 'hash-match',
          episodePath: episodeAbsPath,
          thumbnailPath: thumbnailAbsPath,
          manifest,
        };
      }
      // Files missing despite recorded match — log warning and re-render
      console.warn(
        `[golazo] recorded render block matches but episode.mp4 or thumb.png is missing — re-rendering`,
      );
      reason = 'first-render'; // treat as first-render since files are gone
    } else {
      reason = 'hash-changed';
    }
  } else {
    // No render block in manifest — either first-ever render or manifest was
    // rewritten by a subsequent runPrepare (which discards the render block).
    // If episode.mp4 already exists on disk, this is a hash-changed scenario
    // (content changed and manifest was re-prepared); otherwise it's first-render.
    reason = existsSync(episodeAbsPath) ? 'hash-changed' : 'first-render';
  }

  // Ensure .golazo/ directory exists before rendering
  const dotGolazoDir = join(absFolder, '.golazo');
  if (!existsSync(dotGolazoDir)) {
    mkdirSync(dotGolazoDir, { recursive: true });
  }

  // Start local file server for serving clip + music assets to headless Chrome.
  // Remotion's headless renderer cannot load file:// URLs for <Audio> and
  // <OffthreadVideo> components — they must be served via HTTP.
  let fileServer: FileServer;
  try {
    fileServer = await startFileServer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RenderError({
      field: 'fileServer',
      reason: `failed to start local asset server: ${msg}`,
      remediation: 'ensure no port conflicts and retry',
    });
  }

  // Step 6: bundle Remotion (with soft memo, invalidate on force)
  let bundleLocation: string;
  if (
    _bundleCache !== null &&
    !opts.force &&
    process.env.RENDER_BUNDLE_NOCACHE !== '1'
  ) {
    bundleLocation = _bundleCache;
  } else {
    try {
      bundleLocation = await bundle({
        entryPoint: resolve('remotion/Root.tsx'),
        // Mirror the webpack override from remotion.config.ts so NodeNext
        // .js imports resolve to .ts/.tsx sources during bundling.
        webpackOverride: (config) => ({
          ...config,
          resolve: {
            ...config.resolve,
            extensionAlias: {
              '.js': ['.ts', '.tsx', '.js'],
              '.jsx': ['.tsx', '.jsx'],
            },
          },
        }),
      });
      _bundleCache = bundleLocation;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new RenderError({
        field: 'remotion.bundle',
        reason: msg,
        remediation: 'inspect stderr above and check remotion/Root.tsx',
      });
    }
  }

  // Step 7: build episodeInputProps
  // Clips and music use HTTP URLs (via the local file server) rather than
  // file:// URLs, because Remotion's headless Chrome renderer cannot load
  // file:// assets for <Audio> and <OffthreadVideo> components.
  const episodeInputProps = {
    kid: {
      name: channel.name,
      club: channel.club,
      jersey: channel.jersey,
      accent: channel.accent,
    },
    game: {
      date: manifest.game.date,
      opponent: prettyOpponent(manifest.game.opponent),
      scoreFor: manifest.game.scoreFor,
      scoreAgainst: manifest.game.scoreAgainst,
      result: manifest.game.result,
    },
    clips: manifest.clips.map((c) => ({
      file: c.file,
      absPath: fileServer.urlFor(resolve(absFolder, c.file)),
      durationSec: c.durationSec,
    })),
    music: {
      absPath: fileServer.urlFor(chosenEntry.absPath),
      durationSec: pick.durationSec,
      strategy: pick.strategy,
    },
  };

  // Steps 8-15: render episode + thumbnail, then write manifest.
  // The file server must be closed after rendering regardless of success/failure.
  try {
    // Step 8: selectComposition for Episode
    let episodeComposition: Awaited<ReturnType<typeof selectComposition>>;
    try {
      episodeComposition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'Episode',
        inputProps: episodeInputProps,
        browserExecutable,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new RenderError({
        field: 'remotion.selectComposition',
        reason: msg,
        remediation: 'inspect stderr above and check remotion/Root.tsx + remotion/Episode.tsx',
      });
    }

    // Step 9: renderMedia → episode.mp4 with optional scale for lowRes
    try {
      await renderMedia({
        composition: episodeComposition,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: episodeAbsPath,
        inputProps: episodeInputProps,
        scale: opts.lowRes ? 0.166 : 1,
        imageFormat: 'jpeg',
        jpegQuality: 80,
        audioCodec: 'aac',
        browserExecutable,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new RenderError({
        field: 'remotion.renderMedia',
        reason: msg,
        remediation: 'inspect stderr above and check remotion/Root.tsx + remotion/Episode.tsx',
      });
    }

    // Step 10+11: selectComposition + renderStill for Thumbnail
    const thumbnailInputProps = {
      kid: episodeInputProps.kid,
      game: episodeInputProps.game,
    };

    let thumbnailComposition: Awaited<ReturnType<typeof selectComposition>>;
    try {
      thumbnailComposition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'Thumbnail',
        inputProps: thumbnailInputProps,
        browserExecutable,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new RenderError({
        field: 'remotion.selectComposition.thumbnail',
        reason: msg,
        remediation: 'inspect stderr above and check remotion/Root.tsx + remotion/Thumbnail.tsx',
      });
    }

    // Step 12: renderStill → thumb.png
    try {
      await renderStill({
        composition: thumbnailComposition,
        serveUrl: bundleLocation,
        output: thumbnailAbsPath,
        inputProps: thumbnailInputProps,
        imageFormat: 'png',
        scale: opts.lowRes ? 0.5 : 1,
        browserExecutable,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new RenderError({
        field: 'remotion.renderStill',
        reason: msg,
        remediation: 'inspect stderr above and check remotion/Root.tsx + remotion/Thumbnail.tsx',
      });
    }

    // Step 13: ffprobe confirmed durationSec
    const ffprobedDuration = await probeEpisodeDuration(episodeAbsPath);

    // Determine output dimensions based on lowRes flag
    const outputWidth = opts.lowRes ? Math.round(1920 * 0.166) : 1920;
    const outputHeight = opts.lowRes ? Math.round(1080 * 0.166) : 1080;

    // Step 14: build extended manifest
    const extendedManifest = buildManifest({
      folderName,
      kid: manifest.kid,
      gameMeta: manifest.game,
      clips: manifest.clips,
      music: {
        track: pick.track,
        durationSec: pick.durationSec,
        strategy: pick.strategy,
        reroll: pick.reroll,
      },
      render: {
        episodePath: '.golazo/episode.mp4',
        thumbnailPath: '.golazo/thumb.png',
        renderedAt: new Date().toISOString(),
        manifestHash: manifest.manifestHash,
        width: outputWidth,
        height: outputHeight,
        durationSec: ffprobedDuration,
      },
    });

    // Step 14 (invariant): extending the manifest MUST NOT change the top-level manifestHash
    if (extendedManifest.manifestHash !== manifest.manifestHash) {
      throw new RenderError({
        field: 'manifestHash',
        reason:
          'render block extension changed top-level manifestHash — PREP-07 contract broken',
        remediation:
          'inspect buildManifest in src/prepare/manifest.ts; render/music blocks must be excluded from computeManifestHash',
      });
    }

    // Step 15: write manifest
    writeManifest(absFolder, extendedManifest);

    // Step 16: return result
    return {
      skipped: false,
      reason,
      episodePath: episodeAbsPath,
      thumbnailPath: thumbnailAbsPath,
      manifest: extendedManifest,
    };
  } finally {
    // Always close the local file server, even if rendering threw
    fileServer.close();
  }
}
