export type SeasonHubImportance = 'supporting' | 'major' | 'critical';

export type SeasonHubSource = {
  id: string;
  label: string;
  sourceUrl: string | null;
  licenseName: string | null;
};

export type SeasonHubEpisode = {
  number: number;
  title: string;
  overview: string | null;
  image: string | null;
  runtime: number | null;
  rating: number | null;
};

export type SeasonHubEvent = {
  id: string;
  title: string;
  description: string;
  episodeNumbers: number[];
  sceneIndex: number | null;
  location: string | null;
  detail: string | null;
  characters: string[];
  arc: string | null;
  importance: SeasonHubImportance;
  confidence: number;
  sources: SeasonHubSource[];
};

export type SeasonHubCharacter = {
  id: string;
  name: string;
  eventCount: number;
  lastSeenEpisode: number;
  arcs: string[];
  keyEvents: Array<{ id: string; title: string; episode: number }>;
};

export type SeasonHubArc = {
  id: string;
  name: string;
  eventCount: number;
  lastEpisode: number;
  latestDevelopment: string;
  eventIds: string[];
};

export type SeasonHubCorrectionTarget = 'event' | 'character' | 'arc' | 'context';

export type SeasonHubCorrection = {
  id: string;
  targetType: SeasonHubCorrectionTarget;
  targetKey: string;
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
  sourceUrl: string | null;
  revealEpisode: number;
  score: number;
  userVote: -1 | 0 | 1;
  createdAt: string;
};

export type SeasonHubResponse = {
  show: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    summary: string | null;
    genres: string[];
  };
  season: {
    id: string;
    number: number;
    name: string;
    image: string | null;
    firstAired: string | null;
  };
  progress: {
    throughEpisode: number;
    totalEpisodes: number;
    isComplete: boolean;
  };
  availability: {
    hasKnowledgeBase: boolean;
    message: string | null;
  };
  recap: {
    available: boolean;
    unlocked: boolean;
    id: string | null;
  };
  episodes: SeasonHubEpisode[];
  events: SeasonHubEvent[];
  characters: SeasonHubCharacter[];
  arcs: SeasonHubArc[];
  corrections: SeasonHubCorrection[];
  sources: SeasonHubSource[];
};

export type SeasonHubCorrectionInput = {
  targetType: SeasonHubCorrectionTarget;
  targetKey: string;
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
  sourceUrl?: string | null;
  revealEpisode: number;
  throughEpisode: number;
};
