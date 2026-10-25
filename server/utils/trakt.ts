// Trakt rejects requests that do not identify the calling app with a
// descriptive User-Agent, so every API call must go through these headers.
// See https://developer.trakt.tv/docs/required-headers
const TRAKT_USER_AGENT = 'Synupsis/1.0.0';

export function createTraktHeaders(clientId: string | undefined) {
  return {
    'Content-Type': 'application/json',
    'User-Agent': TRAKT_USER_AGENT,
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };
}
