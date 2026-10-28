import type {
  RecapSourceProvider as RecapSourceProviderSnapshot,
  RecapSourceProviderId,
  RecapSourceRightsReport,
} from '~/server/services/recap-source-registry';
import type { StoryClaimVerification, VaguePhrase } from '~/server/services/recap-story-quality';

export type EpisodeSource = {
  number: number;
  title: string;
  overview: string | null;
  image: string | null;
  runtime: number | null;
  rating: number | null;
  traktId: number | null;
  // Number across the series and IMDb id; absent from snapshots taken before they were recorded.
  absoluteNumber?: number | null;
  imdbId?: string | null;
  evidence: RecapEvidence[];
  // TMDB stills of the episode, best first; absent from snapshots taken before format version 10.
  stills?: string[];
};

/** Position of an image's main face or subject, in percent of its width (x) and height (y). */
export type RecapImageFocus = {
  x: number;
  y: number;
};

/** A character's portrait on TVmaze, or its actor's when the character has none. */
export type RecapCharacterPortrait = {
  name: string;
  imageUrl: string;
};

export type RecapEvidence = {
  id: string;
  providerId: RecapSourceProviderId;
  kind:
    | 'episode-synopsis'
    | 'episode-plot'
    | 'season-synopsis'
    | 'season-article'
    | 'structured-metadata'
    | 'official-recap'
    | 'transcript-extract';
  episodeNumber: number | null;
  locale: string;
  text: string;
  sourceUrl: string | null;
  trustTier: 'reference' | 'editorial' | 'official' | 'licensed-transcript';
  licenseId: string;
  retrievedAt: string;
  revisionId: string | null;
};

export type RecapSourceProvider = RecapSourceProviderSnapshot;

export type RecapSourceSnapshot = {
  provider: 'multi-source';
  fetchedAt: string;
  providers: RecapSourceProvider[];
  rights: RecapSourceRightsReport;
  show: {
    id: string;
    traktId: number;
    tmdbId: number | null;
    tvdbId: number | null;
    imdbId: string | null;
    wikidataId: string | null;
    name: string;
    genres: string[];
    overview: string | null;
    image: string | null;
    // TMDB backdrops without text first, then the best rated.
    backdrops?: string[];
  };
  season: {
    id: string;
    number: number;
    firstAired: string | null;
    image: string | null;
    evidence: RecapEvidence[];
  };
  episodes: EpisodeSource[];
  characterPortraits?: RecapCharacterPortrait[];
  // Where each image's main face (or subject) stands, so crops keep it in frame.
  imageFocus?: Record<string, RecapImageFocus>;
};

export type RecapEventImportance = 'supporting' | 'major' | 'critical';

export type RecapSceneQuote = {
  evidenceId: string;
  text: string;
};

/** A scene of a single episode, grounded by a verbatim quote of its source. */
export type RecapEvent = {
  id: string;
  title: string;
  // The concrete action: who does what, to whom, and what it changes.
  description: string;
  episodeNumbers: number[];
  sceneIndex: number;
  location: string | null;
  // Only kept when its own verbatim quote is found in the episode's sources.
  detail: string | null;
  detailQuote: RecapSceneQuote | null;
  sourceQuote: RecapSceneQuote;
  characters: string[];
  arc: string;
  importance: RecapEventImportance;
  evidenceIds: string[];
  causedByEventIds: string[];
  consequenceEventIds: string[];
  contradictionEvidenceIds: string[];
  confidence: number;
};

export type RecapRejectedScene = {
  episodeNumber: number;
  title: string;
  reason: 'invalid_scene' | 'missing_quote' | 'quote_too_short' | 'unknown_evidence' | 'foreign_evidence' | 'quote_not_found';
};

export type RecapEventGraph = {
  locale: string;
  version: string;
  events: RecapEvent[];
  verification: {
    proposedScenes: number;
    verifiedScenes: number;
    rejectedScenes: RecapRejectedScene[];
    verifiedDetails: number;
    // Details removed from otherwise verified scenes.
    rejectedDetails: RecapRejectedScene[];
    failedEpisodes: number[];
  };
  linking: 'pending' | 'linked' | 'failed';
  // Name variants grouped by the season linking pass, e.g. "Ned" for "Eddard Stark".
  characterAliases?: Array<{ name: string; aliases: string[] }>;
  critic?: {
    status: 'pending' | 'completed' | 'failed';
    gaps: RecapCriticGap[];
    recoveredScenes: number;
    // Suggested moments the sources do not support: kept for review, never published.
    unsupportedGaps: RecapCriticGap[];
  };
};

export type RecapCriticGap = {
  episodeNumber: number;
  moment: string;
};

export type RecapEventQualityReport = {
  score: number;
  publishable: boolean;
  referenceValidity: number;
  evidenceCoverage: number;
  episodeCoverage: number;
  documentedEpisodeCoverage: number;
  quoteVerification: number;
  causalIntegrity: number;
  issues: string[];
};

export type RecapSourceReadiness = {
  ready: boolean;
  totalEpisodes: number;
  documentedEpisodes: number;
  documentedRatio: number;
  richness: number;
  issues: string[];
};

export type RecapQualityReport = {
  score: number;
  publishable: boolean;
  sourceCoverage: number;
  episodeCoverage: number;
  referenceValidity: number;
  evidenceCoverage: number;
  sourceRichness: number;
  sourceDiversity: number;
  eventCoverage: number;
  eventReferenceValidity: number;
  eventEvidenceCoverage: number;
  causalIntegrity: number;
  rightsCompliance: number;
  episodeRecapCoverage: number;
  criticalEpisodeCoverage: number;
  // Share of critical and major scenes told in their own episode slides.
  importantEpisodeCoverage: number;
  characterMentionRatio: number;
  vaguePhrases: VaguePhrase[];
  claimVerification: StoryClaimVerification | null;
  issues: string[];
};

export type GeneratedSlide = {
  order: number;
  canvas: Record<string, unknown>;
};
