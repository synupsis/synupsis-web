import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database } from '~/types/database.types';
import { toRecapWallet } from '~/lib/recap-keys';
import { isAdminUser } from '~/server/utils/require-admin';

// The viewer's recap keys and, for a show, how many people keep it in their
// library: the audience a recap unlocked there may find.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication is required.' });
  }

  const showId = getQuery(event).showId;
  const service = serverSupabaseServiceRole<Database>(event);
  const [{ data: wallet, error: walletError }, followers, unlimited] = await Promise.all([
    service.from('recap_wallet').select('keys, points, key_progress').eq('user_id', user.sub).maybeSingle(),
    typeof showId === 'string' && showId
      ? service.from('library_entry').select('user_id', { count: 'exact', head: true }).eq('show_id', showId).neq('user_id', user.sub)
      : Promise.resolve(null),
    isAdminUser(event, user.sub),
  ]);
  if (walletError || followers?.error) {
    throw createError({ statusCode: 500, statusMessage: 'Could not read your recap tickets.' });
  }

  return {
    wallet: toRecapWallet(wallet, unlimited),
    // The viewer themself is not an audience.
    followers: followers ? followers.count ?? 0 : null,
  };
});
