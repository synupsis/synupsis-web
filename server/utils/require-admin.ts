import type { JwtPayload } from '@supabase/supabase-js';
import type { H3Event } from 'h3';
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';
import type { Database } from '~/types/database.types';

export async function requireAuthenticatedUser(event: H3Event): Promise<JwtPayload> {
  const user = await serverSupabaseUser(event);

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  return user;
}

export async function requireAdminUser(event: H3Event): Promise<JwtPayload> {
  const user = await requireAuthenticatedUser(event);
  const client = await serverSupabaseClient<Database>(event);

  const { data, error } = await client
    .from('profile')
    .select('role')
    .eq('user_id', user.sub)
    .maybeSingle();

  if (error) {
    console.error('Failed to verify admin role:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not verify user role' });
  }

  if (data?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
  }

  return user;
}
