/**
 * EpisodeDetail — Server Component presenting the full episode detail view.
 *
 * Sections (top-down):
 *   1. Back link — ← all episodes
 *   2. Title — rendered title from renderTitle() as <h1>
 *   3. Description — rendered description with preserved \n newlines (<pre>)
 *   4. Manifest section — hash + clip list + music pick + render block
 *   5. Publish section — videoId + watchUrl + YouTube Studio link, or "Not published yet"
 *
 * No 'use client' directive — fully server-rendered.
 * Phase 8 will add the <video> player as a separate concern; this component
 * leaves a `player-mount` section as a clearly-labeled seam.
 */

import Link from 'next/link';
import type { EpisodeIndex } from '@/lib/episodeIndex';
import type { Manifest } from '@/lib/ui/manifestRead';
import type { PublishRecordDoc } from '@/lib/ui/publishRead';
import styles from './EpisodeDetail.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EpisodeDetailProps {
  row: EpisodeIndex;
  manifest: Manifest;
  publish: PublishRecordDoc | null;
  title: string;
  description: string;
  accent: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EpisodeDetail({
  row,
  manifest,
  publish,
  title,
  description,
  accent,
}: EpisodeDetailProps): React.JSX.Element {
  return (
    <article className={styles.article}>
      {/* Section 1: Back link */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.backLink}>
          ← all episodes
        </Link>
      </nav>

      {/* Accent bar — per-kid color */}
      <div className={styles.accentBar} style={{ backgroundColor: accent }} />

      {/* Section 2: Title */}
      <section className={styles.titleSection}>
        <h1 className={styles.title}>{title}</h1>
      </section>

      {/* Section 3: Description */}
      <section className={styles.descriptionSection}>
        <h2 className={styles.sectionLabel}>Description</h2>
        <pre className={styles.description}>{description}</pre>
      </section>

      {/* Phase 8 seam: video player will slot in here */}
      <section className={styles.playerMount} aria-label="Video player (Phase 8)">
        {/* PLAY-03/04/05: Phase 8 adds <video poster={thumbUrl} src={episodeUrl} controls> here */}
      </section>

      {/* Section 4: Manifest */}
      <section className={styles.manifestSection}>
        <h2 className={styles.sectionLabel}>Manifest</h2>

        <dl className={styles.metaList}>
          <dt className={styles.metaKey}>Hash</dt>
          <dd className={styles.metaHash}>{manifest.manifestHash}</dd>

          <dt className={styles.metaKey}>Clips</dt>
          <dd className={styles.metaValue}>
            <ol className={styles.clipList}>
              {manifest.clips.map((clip, idx) => (
                <li key={idx} className={styles.clipItem}>
                  <span className={styles.clipFile}>{clip.file}</span>
                  <span className={styles.clipSpacer} />
                  <span className={styles.clipDuration}>{clip.durationSec}s</span>
                </li>
              ))}
            </ol>
          </dd>

          <dt className={styles.metaKey}>Music</dt>
          <dd className={styles.metaValue}>
            {manifest.music != null ? (
              <span>
                {manifest.music.track} ({manifest.music.durationSec}s)
              </span>
            ) : (
              <span className={styles.absent}>(not set)</span>
            )}
          </dd>

          <dt className={styles.metaKey}>Render</dt>
          <dd className={styles.metaValue}>
            {manifest.render != null ? (
              <span>
                Rendered: {manifest.render.renderedAt} &rarr; {manifest.render.episodePath}
              </span>
            ) : (
              <span className={styles.absent}>(not yet rendered)</span>
            )}
          </dd>
        </dl>
      </section>

      {/* Section 5: Publish */}
      <section className={styles.publishSection}>
        <h2 className={styles.sectionLabel}>Publish status</h2>

        {publish != null ? (
          <dl className={styles.metaList}>
            <dt className={styles.metaKey}>Video ID</dt>
            <dd className={styles.metaValue}>{publish.videoId}</dd>

            <dt className={styles.metaKey}>Watch URL</dt>
            <dd className={styles.metaValue}>
              <a
                href={publish.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.externalLink}
              >
                {publish.watchUrl}
              </a>
            </dd>

            <dt className={styles.metaKey}>Uploaded at</dt>
            <dd className={styles.metaValue}>{publish.uploadedAt}</dd>

            <dt className={styles.metaKey}>Channel</dt>
            <dd className={styles.metaValue}>{publish.channelId}</dd>

            <dt className={styles.metaKey}>Privacy</dt>
            <dd className={styles.metaValue}>{publish.privacyStatus}</dd>

            <dt className={styles.metaKey}>YouTube Studio</dt>
            <dd className={styles.metaValue}>
              <a
                href={`https://studio.youtube.com/video/${publish.videoId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.externalLink}
              >
                YouTube Studio ↗
              </a>
            </dd>
          </dl>
        ) : (
          <div className={styles.notPublished}>
            <p>Not published yet.</p>
            <p className={styles.hint}>
              Run <code className={styles.code}>golazo publish &lt;folder&gt;</code> to upload.
            </p>
          </div>
        )}
      </section>
    </article>
  );
}
