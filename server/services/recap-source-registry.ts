export const RECAP_SOURCE_REGISTRY_VERSION = '2026-07-22';

export type RecapSourceProviderId =
  | 'trakt'
  | 'tmdb'
  | 'tvmaze'
  | 'wikipedia'
  | 'wikidata'
  | 'editorial'
  | 'official'
  | 'transcript';

export type RecapSourcePolicy = {
  id: RecapSourceProviderId;
  label: string;
  licenseId: string;
  licenseName: string;
  licenseUrl: string | null;
  termsUrl: string | null;
  rightsStatus: 'open' | 'provider-terms' | 'contract-required';
  commercialUse: 'allowed' | 'conditional' | 'contract-required';
  attributionRequired: boolean;
  shareAlikeRequired: boolean;
  canStore: boolean;
  canTransform: boolean;
  canDisplaySourceText: boolean;
  notes: string;
};

export type RecapSourceProvider = RecapSourcePolicy & {
  fetchedAt: string;
  sourceUrl: string | null;
};

export type RecapSourceRightsReport = {
  registryVersion: string;
  mode: 'audit' | 'enforce';
  ready: boolean;
  approvedProviderIds: RecapSourceProviderId[];
  warnings: string[];
};

const SOURCE_POLICIES: Record<RecapSourceProviderId, RecapSourcePolicy> = {
  trakt: {
    id: 'trakt',
    label: 'Trakt',
    licenseId: 'trakt-api-terms',
    licenseName: 'Trakt API Terms',
    licenseUrl: 'https://trakt.tv/terms',
    termsUrl: 'https://trakt.tv/terms',
    rightsStatus: 'provider-terms',
    commercialUse: 'conditional',
    attributionRequired: true,
    shareAlikeRequired: false,
    canStore: true,
    canTransform: true,
    canDisplaySourceText: false,
    notes: 'Usage governed by Trakt API terms; production usage must remain within the approved application scope.',
  },
  tmdb: {
    id: 'tmdb',
    label: 'The Movie Database (TMDB)',
    licenseId: 'tmdb-commercial-agreement',
    licenseName: 'TMDB API Terms / commercial agreement',
    licenseUrl: 'https://www.themoviedb.org/api-terms-of-use',
    termsUrl: 'https://www.themoviedb.org/api-terms-of-use',
    rightsStatus: 'contract-required',
    commercialUse: 'contract-required',
    attributionRequired: true,
    shareAlikeRequired: false,
    canStore: true,
    canTransform: true,
    canDisplaySourceText: false,
    notes: 'TMDB requires a commercial agreement for commercial products. Enable strict rights enforcement before launch.',
  },
  tvmaze: {
    id: 'tvmaze',
    label: 'TVmaze',
    licenseId: 'cc-by-sa-4.0',
    licenseName: 'Creative Commons Attribution-ShareAlike 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    termsUrl: 'https://www.tvmaze.com/api#licensing',
    rightsStatus: 'open',
    commercialUse: 'allowed',
    attributionRequired: true,
    shareAlikeRequired: true,
    canStore: true,
    canTransform: true,
    canDisplaySourceText: true,
    notes: 'Free API data is CC BY-SA; a different enterprise license can be negotiated with TVmaze.',
  },
  wikipedia: {
    id: 'wikipedia',
    label: 'Wikipedia',
    licenseId: 'cc-by-sa-4.0',
    licenseName: 'Creative Commons Attribution-ShareAlike 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    termsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
    rightsStatus: 'open',
    commercialUse: 'allowed',
    attributionRequired: true,
    shareAlikeRequired: true,
    canStore: true,
    canTransform: true,
    canDisplaySourceText: true,
    notes: 'Persist the article URL and revision ID. Adapted text must comply with attribution and ShareAlike requirements.',
  },
  wikidata: {
    id: 'wikidata',
    label: 'Wikidata',
    licenseId: 'cc0-1.0',
    licenseName: 'Creative Commons CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    termsUrl: 'https://www.wikidata.org/wiki/Wikidata:Copyright',
    rightsStatus: 'open',
    commercialUse: 'allowed',
    attributionRequired: false,
    shareAlikeRequired: false,
    canStore: true,
    canTransform: true,
    canDisplaySourceText: false,
    notes: 'Structured data in Wikidata main namespaces is published under CC0.',
  },
  editorial: {
    id: 'editorial',
    label: 'Editorial source',
    licenseId: 'adapter-specific-agreement',
    licenseName: 'Adapter-specific editorial agreement',
    licenseUrl: null,
    termsUrl: null,
    rightsStatus: 'contract-required',
    commercialUse: 'contract-required',
    attributionRequired: true,
    shareAlikeRequired: false,
    canStore: false,
    canTransform: false,
    canDisplaySourceText: false,
    notes: 'A source-specific contract must be recorded before this adapter can ingest content.',
  },
  official: {
    id: 'official',
    label: 'Official source',
    licenseId: 'adapter-specific-permission',
    licenseName: 'Source-specific written permission',
    licenseUrl: null,
    termsUrl: null,
    rightsStatus: 'contract-required',
    commercialUse: 'contract-required',
    attributionRequired: true,
    shareAlikeRequired: false,
    canStore: false,
    canTransform: false,
    canDisplaySourceText: false,
    notes: 'Official publication alone is not a reuse license; written permission must be attached to the adapter.',
  },
  transcript: {
    id: 'transcript',
    label: 'Licensed transcript',
    licenseId: 'transcript-license-required',
    licenseName: 'Transcript or timed-text license',
    licenseUrl: null,
    termsUrl: null,
    rightsStatus: 'contract-required',
    commercialUse: 'contract-required',
    attributionRequired: true,
    shareAlikeRequired: false,
    canStore: false,
    canTransform: false,
    canDisplaySourceText: false,
    notes: 'No transcript may be ingested until a contract explicitly permits storage and recap generation.',
  },
};

export function getRecapSourcePolicy(id: RecapSourceProviderId): RecapSourcePolicy {
  const policy = SOURCE_POLICIES[id];
  if (!policy) {
    throw new Error(`Unknown recap source provider: ${id}`);
  }
  return { ...policy };
}

export function createRecapSourceProvider(
  id: RecapSourceProviderId,
  fetchedAt: string,
  sourceUrl: string | null,
): RecapSourceProvider {
  return {
    ...getRecapSourcePolicy(id),
    fetchedAt,
    sourceUrl,
  };
}

export function evaluateRecapSourceRights(
  providers: RecapSourceProvider[],
  mode: 'audit' | 'enforce' = getRecapSourcePolicyMode(),
  approvedProviderIds: RecapSourceProviderId[] = getRecapSourceApprovals(),
): RecapSourceRightsReport {
  const approved = new Set(approvedProviderIds);
  const warnings = providers
    .filter(provider => provider.commercialUse !== 'allowed' && !approved.has(provider.id))
    .map(provider => `${provider.id}:${provider.commercialUse}`);

  return {
    registryVersion: RECAP_SOURCE_REGISTRY_VERSION,
    mode,
    ready: mode === 'audit' || warnings.length === 0,
    approvedProviderIds: Array.from(approved),
    warnings,
  };
}

export function getRecapSourcePolicyMode(): 'audit' | 'enforce' {
  return process.env.RECAP_SOURCE_POLICY_MODE === 'enforce' ? 'enforce' : 'audit';
}

export function getRecapSourceApprovals(): RecapSourceProviderId[] {
  const knownIds = new Set(Object.keys(SOURCE_POLICIES) as RecapSourceProviderId[]);
  return Array.from(new Set((process.env.RECAP_SOURCE_APPROVALS || '')
    .split(',')
    .map(value => value.trim().toLocaleLowerCase())
    .filter((value): value is RecapSourceProviderId => knownIds.has(value as RecapSourceProviderId))));
}
