export interface EventConfig {
  id: string;
  epoch: string;
  title: string;
  exchangeDate: string;
  venue: string;
}

export interface PublicParticipant {
  id: string;
  firstName: string;
  hasGiftHint: boolean;
  isClaimed: boolean;
  hasSpun: boolean;
}

export interface BallotStats {
  totalStaff: number;
  remainingOnWheel: number;
}

export interface PublicStateResponse {
  event: EventConfig;
  stats: BallotStats;
}

export interface MatchDetails {
  firstName: string;
  giftHint: string;
  matchedAt: string;
}

export interface SpinResultResponse {
  targetWedgeIndex: number;
  totalWedges: number;
  match: MatchDetails;
  remainingOnWheel: number;
}

export interface SpinOptionsResponse {
  participant: PublicParticipant;
  eligibleCount: number;
  wedges: string[];
}
