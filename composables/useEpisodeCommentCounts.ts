// Comment counts per episode of one series, shared by the comments button and the comments view.
export function useEpisodeCommentCounts(slug: string) {
  const counts = useState<Record<string, number>>(`episode-comment-counts-${slug}`, () => ({}));
  const key = (season: number, episode: number) => `${season}:${episode}`;

  function countOf(season: number, episode: number): number | undefined {
    return counts.value[key(season, episode)];
  }

  function setCount(season: number, episode: number, count: number) {
    counts.value = { ...counts.value, [key(season, episode)]: Math.max(0, count) };
  }

  async function loadCount(season: number, episode: number) {
    if (countOf(season, episode) !== undefined) return;
    try {
      const response = await $fetch<{ count: number }>(`/api/shows/${slug}/seasons/${season}/episodes/${episode}/comments/count`);
      setCount(season, episode, response.count);
    } catch {
      // The button simply stays without a number.
    }
  }

  return { countOf, setCount, loadCount };
}
