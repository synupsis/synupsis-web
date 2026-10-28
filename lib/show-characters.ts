import type { ShowCastCharacter, VisibleCastCharacter } from '~/types/show-character.types';

/**
 * The characters a viewer may see: those of the seasons up to `throughSeason`
 * (all of them when null), the most present first. One-episode guests are left
 * out once there are enough recurring characters.
 */
export function visibleCastCharacters(
  characters: ShowCastCharacter[],
  throughSeason: number | null,
  { limit = 40, minEpisodes = 2, minCharacters = 4 } = {},
): VisibleCastCharacter[] {
  const ranked = characters
    .map(({ episodesBySeason, ...character }) => ({
      ...character,
      episodeCount: Object.entries(episodesBySeason)
        .filter(([season]) => throughSeason === null || Number(season) <= throughSeason)
        .reduce((total, [, episodes]) => total + episodes, 0),
    }))
    .filter(character => character.episodeCount > 0)
    .sort((a, b) => b.episodeCount - a.episodeCount || a.name.localeCompare(b.name));
  const recurring = ranked.filter(character => character.episodeCount >= minEpisodes);
  // A short first season may have few recurring characters: its main cast still shows.
  const kept = recurring.length >= minCharacters ? recurring : ranked.slice(0, Math.max(minCharacters, recurring.length));
  return kept.slice(0, limit);
}
