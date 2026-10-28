import type { RecapStorySlideContent } from '~/types/recap-story.types';
import type { RecapSlideContext } from '~/types/recap-slide-suggestion.types';

const SUMMARY_LENGTH = 160;

// The texts a viewer may correct, slide kind by slide kind: only what the
// recap generation wrote. Catalog data (show and episode titles, character
// names, episode numbers) and the slides' fixed labels are not open to it.
const EDITABLE_PATHS: Record<RecapStorySlideContent['kind'], RegExp[]> = {
  cover: [/^subtitle$/, /^logline$/],
  beat: [/^headline$/, /^narration$/],
  episode: [/^headline$/, /^moments\.\d{1,3}$/],
  chapter: [/^headline$/],
  moment: [/^text$/, /^detail$/, /^location$/],
  'moment-group': [/^items\.\d{1,3}\.(text|location)$/],
  changes: [/^(deaths|situations)\.\d{1,3}\.text$/, /^questions\.\d{1,3}$/],
  'ending-status': [/^characters\.\d{1,3}\.text$/],
  'ending-deaths': [],
  'ending-questions': [/^questions\.\d{1,3}\.text$/],
};

/**
 * The text at a path of a slide's content ("headline", "items.1.text",
 * "questions.0"), or null when there is none or it is not open to corrections.
 */
export function editableSlideText(content: RecapStorySlideContent | null | undefined, path: string): string | null {
  if (!content || !EDITABLE_PATHS[content.kind]?.some(pattern => pattern.test(path))) return null;
  let value: unknown = content;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return null;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'string' && value.trim() ? value : null;
}

/** What a slide is about, in one short line: its kind, episode and first text. */
export function recapSlideContext(content: RecapStorySlideContent | null | undefined): RecapSlideContext {
  if (!content) return { kind: null, episodeNumber: null, summary: '' };
  const episodeNumber = 'episodeNumber' in content && typeof content.episodeNumber === 'number'
    ? content.episodeNumber
    : null;
  return { kind: content.kind, episodeNumber, summary: clip(firstText(content)) };
}

function firstText(content: RecapStorySlideContent): string {
  switch (content.kind) {
    case 'cover': return content.title || content.logline;
    case 'beat': return content.headline;
    case 'episode': return content.headline;
    case 'chapter': return content.episodeTitle || content.headline;
    case 'moment': return content.text;
    case 'moment-group': return content.heading || content.items[0]?.text || '';
    case 'changes': return content.situations[0]?.text || content.deaths[0]?.text || content.questions[0] || '';
    case 'ending-status': return content.characters[0]?.text || '';
    case 'ending-deaths': return content.deaths.map(death => death.character.name).join(', ');
    case 'ending-questions': return content.questions[0]?.text || '';
    default: return '';
  }
}

function clip(text: string) {
  const value = text.replace(/\s+/g, ' ').trim();
  return value.length > SUMMARY_LENGTH ? `${value.slice(0, SUMMARY_LENGTH - 1).trimEnd()}…` : value;
}
