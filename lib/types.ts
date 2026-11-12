export const DESTINATION = "NUS Kent Ridge" as const;
export const DESTINATIONS = [
  "NUS Kent Ridge", "NTU", "SMU", "Raffles Place", "Changi Business Park",
  "one-north", "SUTD", "SIT Punggol", "Jurong Lake District", "Changi Airport",
] as const;
export type Destination = (typeof DESTINATIONS)[number];
export const ROOM_TYPE = "common room" as const;
export const CURRENCY = "SGD" as const;
export const PERIOD = "month" as const;

export const PRIORITIES = [
  "balanced",
  "cheaper",
  "shorter_commute",
  "quieter",
] as const;

export type Priority = (typeof PRIORITIES)[number];

export interface Preferences {
  monthlyBudgetSgd: number;
  destination: Destination;
  maxCommuteMinutes: number;
  roomType: typeof ROOM_TYPE;
  priority: Priority;
}

export interface Area {
  area_id: string;
  name: string;
  monthly_rent_sgd: number;
  room_type: typeof ROOM_TYPE;
  currency: typeof CURRENCY;
  period: typeof PERIOD;
  commute_estimates?: Partial<Record<Destination, { minutes: number; range: [number, number] }>>;
  commute_minutes: number;
  commute_range_minutes: [number, number];
  commute_origin: string;
  destination: Destination;
  quiet_score: number;
  amenity_score: number;
  tradeoff: string;
  source: string;
  as_of: string;
  is_demo: boolean;
}

export interface DatasetMetadata {
  version: string;
  as_of: string;
  room_type: typeof ROOM_TYPE;
  currency: typeof CURRENCY;
  period: typeof PERIOD;
  destination: Destination;
  is_demo: boolean;
  source: string;
  disclaimer: string;
}

export interface ScoreDimensions {
  budget_headroom: number;
  commute_headroom: number;
  quiet: number;
  amenity: number;
}

export interface ScoreWeights {
  budget_headroom: number;
  commute_headroom: number;
  quiet: number;
  amenity: number;
}

export interface AreaEvaluation {
  area: Area;
  matches: boolean;
  score: number;
  dimensions: ScoreDimensions;
  weighted: ScoreDimensions;
  reasons: string[];
}

export interface RecommendationResult {
  preferences: Preferences;
  candidates: AreaEvaluation[];
  matchesCount: number;
  totalCount: number;
  evaluations: AreaEvaluation[];
}
