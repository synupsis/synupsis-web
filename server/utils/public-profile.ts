import type { H3Event } from 'h3';
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { isProfileHandle, normalizeProfileHandle } from '~/lib/public-profile';
import type { PublicProfile } from '~/types/public-profile.types';

/**
 * The page at /u/<handle>, read with the visitor's own session: row security
 * already hides accounts without a username. Also returns who is looking, if anyone.
 */
export async function resolvePublicProfile(event: H3Event) {
  const handle = normalizeProfileHandle(String(event.context.params?.handle ?? ''));
  if (!isProfileHandle(handle)) throw createError({ statusCode: 404, statusMessage: 'Profile not found.' });
  const client = await serverSupabaseClient<Database>(event);
  const viewer = await serverSupabaseUser(event);
  const { data, error } = await client.from('public_profile')
    .select('user_id, handle, display_name, avatar_url, bio, created_at')
    .eq('handle', handle)
    .maybeSingle();
  if (error) {
    console.error('Could not load the public profile:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load this profile.' });
  }
  // The owner may read their own row while they have no username; nobody else gets a page then.
  if (!data?.handle || !data.display_name) throw createError({ statusCode: 404, statusMessage: 'Profile not found.' });
  const profile: PublicProfile = {
    handle: data.handle,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    memberSince: data.created_at,
    isOwn: viewer?.sub === data.user_id,
  };
  return { client, viewer, userId: data.user_id, profile };
}
