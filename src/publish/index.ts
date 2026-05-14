/**
 * Public barrel for src/publish — re-exports the OAuth helpers, template
 * renderers, and error classes that downstream Plans 03-03..03-05 import
 * from here.
 */
export {
  createOAuth2Client,
  buildAuthUrl,
  exchangeCode,
  loadToken,
  saveToken,
  runAuth,
  YOUTUBE_UPLOAD_SCOPE,
} from './oauth.js';
export type { RunAuthOpts, RunAuthResult } from './oauth.js';
export { OAuthError, TemplateError, UploadError } from './errors.js';
export {
  renderTitle,
  renderDescription,
  renderTemplates,
  TITLE_TEMPLATE,
  DESCRIPTION_TEMPLATE,
} from './templates.js';
export type { TemplateInput, TemplateOutput } from './templates.js';
export {
  uploadEpisode,
  DEFAULT_YOUTUBE_CATEGORY_ID,
  PRIVACY_STATUS,
} from './uploader.js';
export type { UploadEpisodeArgs, PublishRecord } from './uploader.js';
export {
  withRetry,
  publishWithRetry,
  classifyError,
  DEFAULT_RETRY_DELAYS_MS,
} from './retry.js';
export type { ErrorClassification, WithRetryOpts } from './retry.js';
export { QuotaExceededError, PublishError } from './errors.js';
export type {
  QuotaExceededErrorInput,
  QuotaExceededErrorJson,
  PublishErrorInput,
  PublishErrorJson,
} from './errors.js';
export {
  publishRecordSchema,
  readPublishRecord,
  writePublishRecord,
  PUBLISH_RECORD_FILE_NAME,
} from './publishRecord.js';
export type { PublishRecordDoc } from './publishRecord.js';
