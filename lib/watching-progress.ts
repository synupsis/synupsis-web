type AiredEpisode = { number: number; firstAired: string | null };

// Shared by the episode tracker and library previews. Unknown release dates
// cannot confirm the latest aired episode; future episodes do not count yet.
export function lastConfirmedAiredEpisode(episodes: readonly AiredEpisode[], now = Date.now()): number | null {
  let lastEpisode = 0;
  for (const episode of episodes) {
    if (!Number.isInteger(episode.number) || episode.number <= 0 || !episode.firstAired) return null;
    const airedAt = Date.parse(episode.firstAired);
    if (!Number.isFinite(airedAt)) return null;
    if (airedAt <= now) lastEpisode = Math.max(lastEpisode, episode.number);
  }
  return lastEpisode || null;
}
