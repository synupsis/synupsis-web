import { resolveLibraryShow, toLibraryEntry } from '~/server/utils/library';

// Adds the series, or updates its progress. A null season keeps it without tracking.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ slug?: unknown; season?: unknown; episode?: unknown; spoilerShieldEnabled?: unknown }>(event);
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  const season = body?.season == null ? null : Number(body.season);
  const episode = Number(body?.episode ?? 0);
  if (!slug || slug.length > 200
    || (season !== null && (!Number.isInteger(season) || season <= 0))
    || !Number.isInteger(episode) || episode < 0
    || (body?.spoilerShieldEnabled !== undefined && typeof body.spoilerShieldEnabled !== 'boolean')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid library entry.' });
  }
  const { client, userId, showId } = await resolveLibraryShow(event);
  const { data, error } = await client.from('library_entry').upsert({
    user_id: userId,
    show_id: showId,
    slug,
    season,
    episode: season === null ? 0 : episode,
    // Omit the column for older clients: progress-only writes keep the saved
    // preference, while new entries use the database's protected default.
    ...(typeof body.spoilerShieldEnabled === 'boolean' ? { spoiler_shield_enabled: body.spoilerShieldEnabled } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,show_id' })
    .select('slug, season, episode, spoiler_shield_enabled, updated_at')
    .single();
  if (error || !data) throw createError({ statusCode: 500, statusMessage: 'Could not save your library.' });
  return { entry: toLibraryEntry(data) };
});
