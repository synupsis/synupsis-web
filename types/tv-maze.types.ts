export enum Weekday {
  Monday = 'Monday',
  Tuesday = 'Tuesday',
  Wednesday = 'Wednesday',
  Thursday = 'Thursday',
  Friday = 'Friday',
  Saturday = 'Saturday',
  Sunday = 'Sunday'
}

export interface TvMazeSchedule {
  time: string;
  days: Weekday[];
}

export interface TvMazeRating {
  average: number;
}

export interface TvMazeCountry {
  name: string;
  code: string;
  timezone: string;
}

export interface TvMazeNetwork {
  id: number;
  names: string;
  country: TvMazeCountry;
}

export interface TvMazeExternals {
  tvrage: number;
  thetvdb: number;
  imdb: string;
}

export interface TvMazeImage {
  medium: string;
  original: string;
}

export interface TvMazeSelf {
  href: string;
}

export interface TvMazePreviousEpisode extends TvMazeSelf {
}

export interface TvMazeShowLink extends TvMazeSelf {
}

export interface TvMazeCharacterLink extends TvMazeSelf {
}

export interface TvMazeLinks {
  self?: TvMazeSelf;
  previousepisode?: TvMazePreviousEpisode;
  show?: TvMazeShowLink;
  character?: TvMazeCharacterLink;
}

export interface TvMazeEmbedded {
  show?: TvMazeShow;
  seasons?: TvMazeSeason[];
  episodes?: TvMazeEpisode[];
  cast?: TvMazeCast[];
  castcredits?: TvMazeCastCredits[];
  crew?: TvMazeCrew[];
  crewcredits?: TvMazeCrewCredits[];
  akas?: TvMazeAka[];
}

export interface TvMazeAka {
  name: string;
  country: TvMazeCountry;
}

export interface TvMazeCrewCredits {
  type: string;
  _links: TvMazeLinks;
}

export interface TvMazeCastCredits {
  _links: TvMazeLinks;
}

export interface TvMazeEpisode {
  id: number;
  url: string;
  name: string;
  season: number;
  number: number;
  airdate: string;
  airtime: string;
  airstamp: string;
  runtime: number;
  image: TvMazeImage;
  summary: string;
  _links: TvMazeLinks;
}

export interface TvMazeSeason {
  id: number;
  url: string;
  number: number;
  name: string;
  episodeOrder: number;
  premiereDate: string;
  endDate: string;
  network: TvMazeNetwork;
  webChannel: string | null;
  image: TvMazeImage;
  summary: string;
  _links: TvMazeLinks;
}

export interface TvMazeUpdates {
  [key: number]: number;
}

export interface TvMazePerson {
  id: number;
  url: string;
  country: TvMazeCountry;
  birthday: string;
  deathday: string | null;
  image: TvMazeImage;
  _links: TvMazeLinks;
}

export interface TvMazeCharacter {
  id: number;
  url: string;
  name: string;
  image: TvMazeImage;
  _links: TvMazeLinks;
}

export interface TvMazeCast {
  person: TvMazePerson;
  character: TvMazeCharacter;
  self: boolean;
  voice: boolean;
}

export interface TvMazeCrew {
  type: string;
  person: TvMazePerson;
}

export interface TvMazeShow {
  id: number;
  url: string;
  name: string;
  type: string;
  language: string;
  genres: string[];
  status: string;
  runtime: number;
  averageRuntime: number;
  premiered: string;
  ended: string;
  officialSite: string;
  schedule: TvMazeSchedule;
  rating: TvMazeRating;
  weight: number;
  network: TvMazeNetwork;
  webChannel: string | null;
  dvdCountry: string | null;
  externals: TvMazeExternals;
  image: TvMazeImage;
  summary: string;
  updated: number;
  _links: TvMazeLinks;
  _embedded: TvMazeEmbedded;
}

export interface TvMazeShowSearch {
  score: number;
  show: TvMazeShow;
}

export {};
