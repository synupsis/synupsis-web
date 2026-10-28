import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { buildSeasonHub } from '~/server/services/season-hub';
import { normalizeRecapLocale } from '~/lib/recap-locales';

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug;
  const seasonNumber = Number(event.context.params?.number);
  const traktId = Number(slug?.split('-').pop());
  if (!slug || !Number.isInteger(traktId) || !Number.isInteger(seasonNumber) || seasonNumber <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid show or season.' });
  }

  const throughEpisode = Number(getQuery(event).throughEpisode ?? 0);
  const locale = normalizeRecapLocale(getQuery(event).locale);
  const service = serverSupabaseServiceRole<Database>(event);
  const { data: show, error: showError } = await service
    .from('show')
    .select('id, name, trakt_id, image, summary, genres')
    .eq('trakt_id', traktId)
    .maybeSingle();
  if (showError) throw createError({ statusCode: 500, statusMessage: 'Could not load this show.' });
  if (!show) throw createError({ statusCode: 404, statusMessage: 'Show not found.' });

  const { data: season, error: seasonError } = await service
    .from('season')
    .select('id, number, name, image, first_aired')
    .eq('show_id', show.id)
    .eq('number', seasonNumber)
    .maybeSingle();
  if (seasonError) throw createError({ statusCode: 500, statusMessage: 'Could not load this season.' });
  if (!season) throw createError({ statusCode: 404, statusMessage: 'Season not found.' });

  const [{ data: recaps, error: recapError }, { data: overrides }, { data: corrections }] = await Promise.all([
    service
      .from('recap')
      .select('id, locale, source_snapshot, event_graph, is_canonical, format_version')
      .eq('season_id', season.id)
      .eq('status', 'published')
      .order('is_canonical', { ascending: false })
      .order('format_version', { ascending: false })
      .order('created_at', { ascending: false }),
    service
      .from('season_content_override')
      .select('target_type, target_key, field, value, reveal_episode')
      .eq('season_id', season.id)
      .eq('active', true)
      .lte('reveal_episode', validCursor(throughEpisode)),
    service
      .from('season_content_correction')
      .select(`
        id, target_type, target_key, field, current_value, proposed_value,
        reason, source_url, reveal_episode, created_at,
        votes:season_content_correction_vote(user_id, value)
      `)
      .eq('season_id', season.id)
      .eq('status', 'pending')
      .lte('reveal_episode', validCursor(throughEpisode))
      .order('created_at', { ascending: false }),
  ]);
  if (recapError) throw createError({ statusCode: 500, statusMessage: 'Could not load season knowledge.' });

  // The recap in the requested language first; another language rather than no knowledge.
  const recapList = [...(recaps ?? [])].sort((first, second) => (
    Number(second.locale === locale) - Number(first.locale === locale)
  ));
  const knowledgeRecap = recapList.find(recap => recap.source_snapshot && recap.event_graph) ?? null;
  let userId: string | null = null;
  try {
    userId = (await serverSupabaseUser(event))?.sub ?? null;
  } catch {
    // Public season hubs do not require a session.
  }

  return buildSeasonHub({
    show: {
      id: show.id,
      name: show.name,
      slug,
      image: show.image,
      summary: show.summary,
      genres: show.genres ?? [],
    },
    season: {
      id: season.id,
      number: season.number,
      name: season.name || `Saison ${season.number}`,
      image: season.image,
      firstAired: season.first_aired,
    },
    recapId: recapList[0]?.id ?? null,
    sourceSnapshot: knowledgeRecap?.source_snapshot ?? null,
    eventGraph: knowledgeRecap?.event_graph ?? null,
    requestedThroughEpisode: validCursor(throughEpisode),
    overrides: overrides ?? [],
    corrections: corrections ?? [],
    userId,
  });
});

function validCursor(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 0;
}
