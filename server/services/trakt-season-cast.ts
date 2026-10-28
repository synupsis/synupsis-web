import type { ShowCastCharacter } from '~/types/show-character.types';

type TraktCastMember = {
  character?: string | null;
  characters?: Array<string | null> | null;
  episode_count?: number | null;
  person?: {
    name?: string | null;
    ids?: { trakt?: number | null } | null;
    images?: { headshot?: Array<string | null> | null } | null;
  } | null;
};

export type SeasonCastMember = {
  name: string;
  actorName: string;
  actorImageUrl: string | null;
  episodeCount: number;
  personId: number | null;
};

// Credits notes that are not part of a character's name.
const CREDIT_NOTES = /\s*\((?:uncredited|voice|archive footage|credit only)\)/gi;
// Unnamed parts ("Man on Sidewalk", "Waitress #2", "Himself"): extras, not characters.
const GENERIC_ROLE = /^(?:(?:the|a|an)\s+)?(?:man|woman|men|women|guy|girl|boy|kid|child|lady|gentleman|waiter|waitress|nurse|doctor|cop|officer|policeman|guard|patron|customer|driver|passenger|reporter|announcer|bartender|clerk|cashier|extra|voice|himself|herself|themselves|narrator|stand-in|crowd|bystander|pedestrian|student|worker|employee)\b|#\s*\d|\b\d+$/i;

/** One season's cast from Trakt: each actor once, with the character they play, extras left out. */
export function toSeasonCast(value: unknown): SeasonCastMember[] {
  const cast = (value as { cast?: unknown } | null)?.cast;
  if (!Array.isArray(cast)) return [];
  return cast.flatMap((raw): SeasonCastMember[] => {
    const member = raw as TraktCastMember;
    const name = cleanName(member.characters?.find(Boolean) ?? member.character);
    const actorName = cleanName(member.person?.name);
    const episodeCount = Number(member.episode_count);
    if (!name || !actorName || GENERIC_ROLE.test(name) || !Number.isInteger(episodeCount) || episodeCount <= 0) return [];
    const headshot = member.person?.images?.headshot?.find(Boolean);
    const personId = member.person?.ids?.trakt;
    return [{
      name,
      actorName,
      actorImageUrl: headshot ? (/^https?:\/\//i.test(headshot) ? headshot : `https://${headshot.replace(/^\/\//, '')}`) : null,
      episodeCount,
      personId: Number.isInteger(personId) ? personId as number : null,
    }];
  });
}

/** The series' characters, each with their episodes season by season. */
export function mergeSeasonCasts(seasons: Array<{ season: number; cast: SeasonCastMember[] }>): ShowCastCharacter[] {
  const characters = new Map<string, ShowCastCharacter>();
  for (const { season, cast } of seasons) {
    for (const member of cast) {
      const key = `${member.personId ?? member.actorName}|${normalize(member.name)}`;
      const known = characters.get(key) ?? {
        name: member.name,
        actorName: member.actorName,
        actorImageUrl: member.actorImageUrl,
        episodesBySeason: {},
      };
      known.episodesBySeason[season] = (known.episodesBySeason[season] ?? 0) + member.episodeCount;
      characters.set(key, known);
    }
  }
  return [...characters.values()];
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.replace(CREDIT_NOTES, '').replace(/\s+/g, ' ').trim() : '';
}

function normalize(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
