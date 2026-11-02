import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { PROFILE_BIO_MAX_LENGTH, PROFILE_NAME_MAX_LENGTH } from '~/lib/public-profile';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';
import type { OwnPublicProfile } from '~/types/public-profile.types';

// The username lives in the Auth metadata, which a trigger copies to the page;
// the owner writes the bio, under row security. The address never changes.
export default defineEventHandler(async (event): Promise<OwnPublicProfile> => {
  const user = await requireAuthenticatedUser(event);
  const body = await readBody<Record<string, unknown>>(event);
  if (!body || typeof body !== 'object') throw createError({ statusCode: 400, statusMessage: 'Invalid profile.' });
  const { displayName: rawName, bio: rawBio } = body;
  if (typeof rawName !== 'string' || typeof rawBio !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile.' });
  }
  const displayName = rawName.trim();
  const bio = rawBio.trim();
  if (!displayName || displayName.length > PROFILE_NAME_MAX_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a username of 80 characters or fewer.' });
  }
  if (bio.length > PROFILE_BIO_MAX_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'Keep your bio to 160 characters.' });
  }

  const client = await serverSupabaseClient<Database>(event);

  // Compared with the saved page, not the session: its token may predate the last save.
  const { data: current, error: currentError } = await client.from('public_profile')
    .select('display_name')
    .eq('user_id', user.sub)
    .maybeSingle();
  if (currentError) fail(currentError);
  if (displayName !== current?.display_name) {
    const { error } = await client.auth.updateUser({ data: { username: displayName } });
    if (error) fail(error);
  }

  // The first username also gives the page its address, through the trigger.
  const { data, error } = await client.from('public_profile')
    .update({ bio: bio || null })
    .eq('user_id', user.sub)
    .select('handle, display_name, bio')
    .maybeSingle();
  if (error) fail(error);
  if (!data) throw createError({ statusCode: 500, statusMessage: 'Could not save your profile.' });
  return { handle: data.handle, displayName: data.display_name, bio: data.bio };
});

function fail(error: unknown): never {
  console.error('Could not save the public profile:', error);
  throw createError({ statusCode: 500, statusMessage: 'Could not save your profile.' });
}
