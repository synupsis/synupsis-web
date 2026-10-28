// Trakt rejects requests that do not identify the calling app with a
// descriptive User-Agent, so every API call must go through these headers.
// See https://developer.trakt.tv/docs/required-headers
export const TRAKT_USER_AGENT = 'Synupsis/1.0.0';

export function createTraktHeaders(clientId: string | undefined): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': TRAKT_USER_AGENT,
    'trakt-api-version': '2',
    ...(clientId ? { 'trakt-api-key': clientId } : {}),
  };
}
