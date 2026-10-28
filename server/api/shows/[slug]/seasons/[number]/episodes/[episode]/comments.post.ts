import { EPISODE_COMMENT_MAX_LENGTH, resolveWatchedEpisode, toEpisodeComment } from '~/server/utils/episode-comments';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ body?: unknown; parentId?: unknown; isSpoiler?: unknown }>(event);
  if (body?.isSpoiler !== undefined && typeof body.isSpoiler !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid spoiler flag.' });
  }
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > EPISODE_COMMENT_MAX_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'The comment is empty or too long.' });
  }
  const parentId = body?.parentId ?? null;
  if (parentId !== null && (typeof parentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(parentId))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid parent comment.' });
  }
  const { client, user, showId, season, episode } = await resolveWatchedEpisode(event);
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const username = typeof metadata.username === 'string' ? metadata.username.trim().slice(0, 80) : '';
  const avatarUrl = typeof metadata.avatar_url === 'string' && /^https?:\/\//i.test(metadata.avatar_url) ? metadata.avatar_url.slice(0, 2000) : null;
  const { data, error } = await client.from('episode_comment').insert({
    show_id: showId,
    season,
    episode,
    user_id: user.sub,
    parent_id: parentId,
    is_spoiler: body?.isSpoiler === true,
    author_name: username || null,
    author_avatar_url: avatarUrl,
    body: text,
  }).select('id, user_id, parent_id, author_name, author_avatar_url, body, is_spoiler, created_at').single();
  // Raised by the database's posting rate limit.
  if (error?.code === 'P0429') {
    throw createError({ statusCode: 429, statusMessage: 'You are commenting too fast. Wait a few seconds.' });
  }
  // Raised when the parent is a reply, or belongs to another episode.
  if (error?.code === 'P0422') throw createError({ statusCode: 400, statusMessage: 'Invalid parent comment.' });
  if (error || !data) {
    console.error('Could not create episode comment:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not post your comment.' });
  }
  setResponseStatus(event, 201);
  return { comment: toEpisodeComment(data, user.sub) };
});
