/**
 * Public barrel for src/publish — re-exports the OAuth helpers and error
 * classes that downstream Plans 03-02..03-05 import from here.
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
export { OAuthError } from './errors.js';
