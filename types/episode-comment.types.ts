export type EpisodeComment = {
  id: string;
  // Replies point to a top-level comment of the same episode.
  parentId: string | null;
  // Hidden until the viewer reveals it: flagged by its author, or reported by viewers.
  isSpoiler: boolean;
  markedSpoilerByAuthor: boolean;
  // Enough viewers reported it as a spoiler; its author cannot take that back.
  reportedAsSpoiler: boolean;
  // The viewer reported it as a spoiler, which they can do once.
  isSpoilerReported: boolean;
  // Null when the author has no username: an email address is never shown.
  authorName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  isOwn: boolean;
  // Reported by the viewer, who can report a comment once.
  isReported: boolean;
  likeCount: number;
  // Whether the viewer liked it.
  isLiked: boolean;
  // Oldest first; always empty on a reply.
  replies: EpisodeComment[];
};

export type ReportedEpisodeComment = {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  reportCount: number;
  lastReportedAt: string;
  show: { name: string; traktId: number | null };
  season: number;
  episode: number;
};

export type ShowCommentSort = 'newest' | 'oldest' | 'most-liked' | 'episode';

/** A comment of the series' feed, with the episode it was written on. */
export type ShowFeedComment = {
  season: number;
  episode: number;
  comment: EpisodeComment;
};
