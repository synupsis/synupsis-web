import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';
import type { OwnPublicProfile } from '~/types/public-profile.types';

// The signed-in viewer's page, as they edit it in their settings.
export default defineEventHandler(async (event): Promise<OwnPublicProfile> => {
  const user = await requireAuthenticatedUser(event);
  const client = await serverSupabaseClient<Database>(event);
  const { data, error } = await client.from('public_profile')
    .select('handle, display_name, bio')
    .eq('user_id', user.sub)
    .maybeSingle();
  if (error) {
    console.error('Could not load the own public profile:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load your profile.' });
  }
  return { handle: data?.handle ?? null, displayName: data?.display_name ?? null, bio: data?.bio ?? null };
});
