import type {
  SeasonHubArc,
  SeasonHubCharacter,
  SeasonHubCorrection,
  SeasonHubEpisode,
  SeasonHubEvent,
  SeasonHubImportance,
  SeasonHubResponse,
  SeasonHubSource,
} from '~/types/season-hub.types';

type HubShow = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  summary: string | null;
  genres: string[];
};

type HubSeason = {
  id: string;
  number: number;
  name: string;
  image: string | null;
  firstAired: string | null;
};

type CorrectionRow = {
  id: string;
  target_type: string;
  target_key: string;
  field: string;
  current_value: unknown;
  proposed_value: unknown;
  reason: string;
  source_url: string | null;
  reveal_episode: number;
  created_at: string;
  votes?: Array<{ user_id: string; value: number }>;
};

type OverrideRow = {
  target_type: string;
  target_key: string;
  field: string;
  value: unknown;
  reveal_episode: number;
};

export type BuildSeasonHubInput = {
  show: HubShow;
  season: HubSeason;
  recapId: string | null;
  sourceSnapshot: unknown;
  eventGraph: unknown;
  requestedThroughEpisode: number;
  corrections?: CorrectionRow[];
  overrides?: OverrideRow[];
  userId?: string | null;
};

export function buildSeasonHub(input: BuildSeasonHubInput): SeasonHubResponse {
  const snapshot = asObject(input.sourceSnapshot);
  const graph = asObject(input.eventGraph);
  const rawEpisodes = Array.isArray(snapshot?.episodes) ? snapshot.episodes : [];
  const totalEpisodes = rawEpisodes.reduce((maximum, episode) => {
    return Math.max(maximum, toPositiveInteger(asObject(episode)?.number) ?? 0);
  }, 0);
  const throughEpisode = clampInteger(input.requestedThroughEpisode, 0, totalEpisodes);
  const overrides = (input.overrides ?? []).filter(row => row.reveal_episode <= throughEpisode);
  const providerById = buildProviderIndex(snapshot);
  const evidenceById = buildEvidenceIndex(snapshot);

  const episodes = rawEpisodes
    .map(toEpisode)
    .filter((episode): episode is SeasonHubEpisode => Boolean(episode))
    .filter(episode => episode.number <= throughEpisode)
    .sort((a, b) => a.number - b.number);

  const rawEvents = Array.isArray(graph?.events) ? graph.events : [];
  const baseEvents = rawEvents
    .map(event => toEvent(event, evidenceById, providerById, overrides))
    .filter((event): event is SeasonHubEvent => Boolean(event))
    .filter(event => Math.max(...event.episodeNumbers) <= throughEpisode)
    .sort(compareEvents);
  const events = baseEvents.map(event => ({
    ...event,
    characters: event.characters.map(name => (
      overrideText(overrides, 'character', slugify(name), 'name') ?? name
    )),
    arc: event.arc
      ? overrideText(overrides, 'arc', slugify(event.arc), 'name') ?? event.arc
      : null,
  }));
  const characters = deriveCharacters(baseEvents).map(character => ({
    ...character,
    name: overrideText(overrides, 'character', character.id, 'name') ?? character.name,
    arcs: character.arcs.map(name => overrideText(overrides, 'arc', slugify(name), 'name') ?? name),
  }));
  const arcs = deriveArcs(baseEvents).map(arc => ({
    ...arc,
    name: overrideText(overrides, 'arc', arc.id, 'name') ?? arc.name,
  }));

  const sources = uniqueSources(events.flatMap(event => event.sources));
  const hasKnowledgeBase = rawEpisodes.length > 0 && rawEvents.length > 0;
  const isComplete = totalEpisodes > 0 && throughEpisode >= totalEpisodes;

  return {
    show: {
      ...input.show,
      summary: overrideText(overrides, 'context', 'season', 'summary') ?? input.show.summary,
    },
    season: input.season,
    progress: { throughEpisode, totalEpisodes, isComplete },
    availability: {
      hasKnowledgeBase,
      message: hasKnowledgeBase
        ? null
        : 'Les informations détaillées de cette saison ne sont pas encore disponibles.',
    },
    recap: {
      available: Boolean(input.recapId),
      unlocked: Boolean(input.recapId) && isComplete,
      id: Boolean(input.recapId) && isComplete ? input.recapId : null,
    },
    episodes,
    events,
    characters,
    arcs,
    corrections: normalizeCorrections(input.corrections ?? [], throughEpisode, input.userId),
    sources,
  };
}

export function isEditableCorrectionField(targetType: string, field: string): boolean {
  const allowed: Record<string, string[]> = {
    event: ['title', 'description'],
    character: ['name'],
    arc: ['name'],
    context: ['summary'],
  };
  return allowed[targetType]?.includes(field) ?? false;
}

export function findCorrectionTarget(
  hub: SeasonHubResponse,
  targetType: string,
  targetKey: string,
  field: string,
): unknown {
  if (!isEditableCorrectionField(targetType, field)) return undefined;
  if (targetType === 'event') return hub.events.find(item => item.id === targetKey)?.[field as 'title' | 'description'];
  if (targetType === 'character') return hub.characters.find(item => item.id === targetKey)?.name;
  if (targetType === 'arc') return hub.arcs.find(item => item.id === targetKey)?.name;
  if (targetType === 'context' && targetKey === 'season') return hub.show.summary;
  return undefined;
}

function toEpisode(value: unknown): SeasonHubEpisode | null {
  const episode = asObject(value);
  const number = toPositiveInteger(episode?.number);
  if (!episode || !number) return null;
  return {
    number,
    title: cleanText(episode.title) || `Épisode ${number}`,
    overview: cleanText(episode.overview) || null,
    image: nullableUrl(episode.image),
    runtime: toPositiveInteger(episode.runtime),
    rating: toFiniteNumber(episode.rating),
  };
}

function toEvent(
  value: unknown,
  evidenceById: Map<string, Record<string, unknown>>,
  providerById: Map<string, Record<string, unknown>>,
  overrides: OverrideRow[],
): SeasonHubEvent | null {
  const raw = asObject(value);
  const id = cleanIdentifier(raw?.id);
  const episodeNumbers = uniquePositiveIntegers(raw?.episodeNumbers);
  if (!raw || !id || !episodeNumbers.length) return null;

  const title = overrideText(overrides, 'event', id, 'title') ?? cleanText(raw.title);
  const description = overrideText(overrides, 'event', id, 'description') ?? cleanText(raw.description);
  if (!title || !description) return null;
  const importance = ['supporting', 'major', 'critical'].includes(String(raw.importance))
    ? String(raw.importance) as SeasonHubImportance
    : 'supporting';
  const evidenceIds = uniqueStrings(raw.evidenceIds);

  return {
    id,
    title,
    description,
    episodeNumbers,
    sceneIndex: toPositiveInteger(raw.sceneIndex),
    location: cleanText(raw.location) || null,
    detail: cleanText(raw.detail) || null,
    characters: uniqueStrings(raw.characters),
    arc: cleanText(raw.arc) || null,
    importance,
    confidence: Math.max(0, Math.min(1, toFiniteNumber(raw.confidence) ?? 0)),
    sources: evidenceIds.map(id => {
      const evidence = evidenceById.get(id);
      if (!evidence) return null;
      const provider = providerById.get(String(evidence.providerId || ''));
      return {
        id,
        label: cleanText(provider?.label) || cleanText(evidence.providerId) || 'Source',
        sourceUrl: nullableUrl(evidence.sourceUrl) ?? nullableUrl(provider?.sourceUrl),
        licenseName: cleanText(provider?.licenseName) || cleanText(evidence.licenseId) || null,
      } satisfies SeasonHubSource;
    }).filter((source): source is SeasonHubSource => Boolean(source)),
  };
}

function deriveCharacters(events: SeasonHubEvent[]): SeasonHubCharacter[] {
  const characters = new Map<string, SeasonHubCharacter>();
  events.forEach((event) => {
    const episode = Math.max(...event.episodeNumbers);
    event.characters.forEach((name) => {
      const id = slugify(name);
      if (!id) return;
      const current = characters.get(id) ?? {
        id,
        name,
        eventCount: 0,
        lastSeenEpisode: 0,
        arcs: [],
        keyEvents: [],
      };
      current.eventCount += 1;
      current.lastSeenEpisode = Math.max(current.lastSeenEpisode, episode);
      if (event.arc && !current.arcs.includes(event.arc)) current.arcs.push(event.arc);
      if (event.importance !== 'supporting') {
        current.keyEvents.push({ id: event.id, title: event.title, episode });
      }
      characters.set(id, current);
    });
  });
  return [...characters.values()]
    .map(character => ({ ...character, keyEvents: character.keyEvents.slice(-3).reverse() }))
    .sort((a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name, 'fr'));
}

function deriveArcs(events: SeasonHubEvent[]): SeasonHubArc[] {
  const arcs = new Map<string, SeasonHubArc>();
  events.forEach((event) => {
    if (!event.arc) return;
    const id = slugify(event.arc);
    const episode = Math.max(...event.episodeNumbers);
    const current = arcs.get(id) ?? {
      id,
      name: event.arc,
      eventCount: 0,
      lastEpisode: 0,
      latestDevelopment: '',
      eventIds: [],
    };
    current.eventCount += 1;
    current.eventIds.push(event.id);
    if (episode >= current.lastEpisode) {
      current.lastEpisode = episode;
      current.latestDevelopment = event.description;
    }
    arcs.set(id, current);
  });
  return [...arcs.values()].sort((a, b) => b.lastEpisode - a.lastEpisode || b.eventCount - a.eventCount);
}

function normalizeCorrections(
  rows: CorrectionRow[],
  throughEpisode: number,
  userId?: string | null,
): SeasonHubCorrection[] {
  return rows
    .filter(row => row.reveal_episode <= throughEpisode)
    .map(row => {
      const votes = Array.isArray(row.votes) ? row.votes : [];
      const vote = votes.find(item => item.user_id === userId)?.value ?? 0;
      return {
        id: row.id,
        targetType: row.target_type as SeasonHubCorrection['targetType'],
        targetKey: row.target_key,
        field: row.field,
        currentValue: row.current_value,
        proposedValue: row.proposed_value,
        reason: row.reason,
        sourceUrl: row.source_url,
        revealEpisode: row.reveal_episode,
        score: votes.reduce((sum, item) => sum + Math.sign(item.value), 0),
        userVote: Math.max(-1, Math.min(1, Math.sign(vote))) as -1 | 0 | 1,
        createdAt: row.created_at,
      };
    });
}

function buildProviderIndex(snapshot: Record<string, unknown> | null) {
  const providers = Array.isArray(snapshot?.providers) ? snapshot.providers : [];
  return new Map(providers.map((value) => {
    const provider = asObject(value);
    return [String(provider?.id || ''), provider ?? {}] as const;
  }));
}

function buildEvidenceIndex(snapshot: Record<string, unknown> | null) {
  const evidence = new Map<string, Record<string, unknown>>();
  const addEvidence = (values: unknown) => {
    if (!Array.isArray(values)) return;
    values.forEach((value) => {
      const item = asObject(value);
      if (item?.id) evidence.set(String(item.id), item);
    });
  };
  addEvidence(asObject(snapshot?.season)?.evidence);
  if (Array.isArray(snapshot?.episodes)) {
    snapshot.episodes.forEach(episode => addEvidence(asObject(episode)?.evidence));
  }
  return evidence;
}

function uniqueSources(sources: SeasonHubSource[]): SeasonHubSource[] {
  return [...new Map(sources.map(source => [source.id, source])).values()];
}

function overrideText(
  overrides: OverrideRow[],
  targetType: string,
  targetKey: string,
  field: string,
): string | null {
  const value = overrides.find(row => (
    row.target_type === targetType && row.target_key === targetKey && row.field === field
  ))?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compareEvents(a: SeasonHubEvent, b: SeasonHubEvent) {
  return Math.max(...a.episodeNumbers) - Math.max(...b.episodeNumbers)
    || Math.min(...a.episodeNumbers) - Math.min(...b.episodeNumbers)
    || (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uniquePositiveIntegers(value: unknown): number[] {
  return Array.isArray(value)
    ? [...new Set(value.map(toPositiveInteger).filter((item): item is number => Boolean(item)))].sort((a, b) => a - b)
    : [];
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function toPositiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return minimum;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function cleanIdentifier(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

function nullableUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function slugify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}
