import type { H3Event } from 'h3';
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type {
  RecapSlideContext,
  RecapSlideSuggestion,
  RecapSlideSuggestionKind,
  RecapSlideSuggestionStatus,
} from '~/types/recap-slide-suggestion.types';

export { compareSuggestions } from '~/lib/recap-suggestion-order';

export const SUGGESTION_COLUMNS = `id, recap_id, kind, slide_order, slide_context, field_path, current_value,
  proposed_value, message, status, created_by, author_name, created_at,
  likes:recap_slide_suggestion_like(user_id)`;

type SuggestionRow = Pick<Database['public']['Tables']['recap_slide_suggestion']['Row'],
  'id' | 'kind' | 'slide_order' | 'slide_context' | 'field_path' | 'current_value' | 'proposed_value'
  | 'message' | 'status' | 'created_by' | 'author_name' | 'created_at'> & {
  likes?: Array<{ user_id: string }>;
};

export function toRecapSlideSuggestion(row: SuggestionRow, viewerId: string | null): RecapSlideSuggestion {
  const context = row.slide_context && typeof row.slide_context === 'object' && !Array.isArray(row.slide_context)
    ? row.slide_context as Partial<RecapSlideContext>
    : {};
  const likes = row.likes ?? [];
  return {
    id: row.id,
    kind: row.kind as RecapSlideSuggestionKind,
    slideOrder: row.slide_order,
    slideContext: {
      kind: typeof context.kind === 'string' ? context.kind : null,
      episodeNumber: typeof context.episodeNumber === 'number' ? context.episodeNumber : null,
      summary: typeof context.summary === 'string' ? context.summary : '',
    },
    fieldPath: row.field_path,
    currentValue: row.current_value,
    proposedValue: row.proposed_value,
    message: row.message,
    status: row.status as RecapSlideSuggestionStatus,
    createdAt: row.created_at,
    authorName: row.author_name,
    likeCount: likes.length,
    liked: Boolean(viewerId) && likes.some(like => like.user_id === viewerId),
    isMine: Boolean(viewerId) && row.created_by === viewerId,
  };
}

export async function optionalViewerId(event: H3Event): Promise<string | null> {
  try {
    return (await serverSupabaseUser(event))?.sub ?? null;
  } catch {
    return null;
  }
}

/** Suggestions follow their recap: only a viewer who can read it reaches them. */
export async function requireReadableRecap(event: H3Event, recapId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(recapId)) throw createError({ statusCode: 400, statusMessage: 'Invalid recap.' });
  const client = await serverSupabaseClient<Database>(event);
  const { data, error } = await client.from('recap').select('id').eq('id', recapId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load this recap.' });
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Recap not found.' });
}
