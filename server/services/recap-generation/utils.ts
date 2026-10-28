import { MIN_DOCUMENTED_EPISODE_CHARS } from '~/server/services/recap-generation/config';
import type { EpisodeSource, RecapEvent, RecapEvidence, RecapSourceSnapshot } from '~/server/services/recap-generation/types';
import type { RecapStoryChange, RecapStoryEpisode } from '~/types/recap-story.types';

const MAX_EVENTS_PER_EPISODE = 10;

export function evidencePriority(evidence: RecapEvidence): number {
  // A plot summary always outranks promotional synopses, whatever its language.
  const kindScore = evidence.kind === 'episode-plot' ? 1_000 : 0;
  const trustScore = {
    official: 400,
    'licensed-transcript': 350,
    editorial: 300,
    reference: 200,
  }[evidence.trustTier];
  const localeScore = evidence.locale === 'fr' ? 80 : evidence.locale === 'en' ? 40 : 0;
  return kindScore + trustScore + localeScore + Math.min(evidence.text.length, 6_000) / 100;
}

export function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Length of the most detailed source: translations and provider copies of one teaser do not add up. */
export function measureEpisodeSourceLength(episode: EpisodeSource): number {
  return episode.evidence.reduce((longest, evidence) => Math.max(longest, evidence.text.length), 0);
}

export function normalizeCharacterKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function listEpisodeChanges(episode: RecapStoryEpisode): RecapStoryChange[] {
  return episode.changes
    ? [...episode.changes.deaths, ...episode.changes.situations, ...episode.changes.questions]
    : [];
}

export function sanitizeText(text?: unknown): string {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
}

export function clampText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text.trim();
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

// The number of scenes worth extracting grows with the plot text available
// for the episode; a teaser supports at most one scene.
export function getEpisodeEventRange(episode: EpisodeSource): { min: number; max: number } {
  const length = measureEpisodeSourceLength(episode);
  if (length === 0) return { min: 0, max: 0 };
  if (length < MIN_DOCUMENTED_EPISODE_CHARS) return { min: 0, max: 1 };
  const max = Math.min(MAX_EVENTS_PER_EPISODE, Math.max(2, Math.round(length / 300)));
  return { min: Math.max(2, max - 2), max };
}

export function getAllEvidence(snapshot: RecapSourceSnapshot): RecapEvidence[] {
  return [...snapshot.season.evidence, ...snapshot.episodes.flatMap(episode => episode.evidence)];
}

export function uniqueIdentifiers(value: unknown, limit: number): string[] {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map(item => sanitizeIdentifier(item))
    .filter(Boolean)))
    .slice(0, limit) as string[];
}

export function sanitizeIdentifier(value: unknown): string {
  return sanitizeText(value)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function minimumEpisode(event: RecapEvent): number {
  return Math.min(...event.episodeNumbers);
}

export function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
