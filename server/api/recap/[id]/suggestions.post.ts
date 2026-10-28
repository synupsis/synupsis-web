import { serverSupabaseServiceRole } from '#supabase/server';
import type { RecapStoryPayload } from '~/composables/useStoryViewer';
import { editableSlideText, recapSlideContext } from '~/lib/recap-slide-text';
import type { Database, Json } from '~/types/database.types';
import type { RecapSlideSuggestionInput } from '~/types/recap-slide-suggestion.types';
import { SUGGESTION_COLUMNS, toRecapSlideSuggestion } from '~/server/utils/recap-slide-suggestion';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

const TEXT_MAX_LENGTH = 3000;
const MESSAGE_MAX_LENGTH = 2000;

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const recapId = event.context.params?.id ?? '';
  const body = await readBody<RecapSlideSuggestionInput>(event);
  if (!body || !['text', 'change', 'add'].includes(body.kind) || !Number.isInteger(body.slideOrder)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid suggestion.' });
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length > MESSAGE_MAX_LENGTH || (body.kind !== 'text' && message.length < 10)) {
    throw createError({ statusCode: 400, statusMessage: 'The explanation must be between 10 and 2000 characters.' });
  }

  // The slides as this viewer reads them: the same plan, and the same access rules.
  const story = await event.$fetch<RecapStoryPayload>(`/api/recap/${recapId}`).catch(() => null);
  const slide = story?.slides[body.slideOrder - 1];
  if (!story || !slide) throw createError({ statusCode: 404, statusMessage: 'This slide no longer exists.' });

  let text: { fieldPath: string; currentValue: string; proposedValue: string } | null = null;
  if (body.kind === 'text') {
    const fieldPath = String(body.fieldPath ?? '');
    const currentValue = editableSlideText(slide.content, fieldPath);
    if (currentValue === null) throw createError({ statusCode: 400, statusMessage: 'This text cannot be corrected.' });
    if (currentValue !== body.currentValue) {
      throw createError({ statusCode: 409, statusMessage: 'This text changed in the meantime.' });
    }
    const proposedValue = typeof body.proposedValue === 'string' ? body.proposedValue.trim() : '';
    if (!proposedValue || proposedValue.length > TEXT_MAX_LENGTH) {
      throw createError({ statusCode: 400, statusMessage: 'The corrected text is empty or too long.' });
    }
    if (proposedValue === currentValue.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'The correction is identical to the current text.' });
    }
    text = { fieldPath, currentValue, proposedValue };
  }

  const service = serverSupabaseServiceRole<Database>(event);
  // The same correction already exists: the viewer supports it instead of repeating it.
  if (text) {
    const { data: existing } = await service.from('recap_slide_suggestion')
      .select('id, created_by')
      .eq('recap_id', story.id)
      .eq('slide_order', body.slideOrder)
      .eq('field_path', text.fieldPath)
      .eq('proposed_value', text.proposedValue)
      .neq('status', 'rejected')
      .limit(1)
      .maybeSingle();
    if (existing) {
      if (existing.created_by !== user.sub) {
        await service.from('recap_slide_suggestion_like')
          .upsert({ suggestion_id: existing.id, user_id: user.sub }, { ignoreDuplicates: true });
      }
      const { data: row } = await service.from('recap_slide_suggestion').select(SUGGESTION_COLUMNS).eq('id', existing.id).single();
      if (row) return { suggestion: toRecapSlideSuggestion(row, user.sub), duplicate: true };
    }
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const username = typeof metadata.username === 'string' ? metadata.username.trim().slice(0, 80) : '';
  const { data, error } = await service.from('recap_slide_suggestion').insert({
    recap_id: story.id,
    kind: body.kind,
    slide_order: body.slideOrder,
    slide_context: recapSlideContext(slide.content) as unknown as Json,
    field_path: text?.fieldPath ?? null,
    current_value: text?.currentValue ?? null,
    proposed_value: text?.proposedValue ?? null,
    message: message || null,
    created_by: user.sub,
    author_name: username || null,
  }).select(SUGGESTION_COLUMNS).single();
  if (error || !data) {
    console.error('Could not create slide suggestion:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not send this suggestion.' });
  }
  setResponseStatus(event, 201);
  return { suggestion: toRecapSlideSuggestion(data, user.sub), duplicate: false };
});
