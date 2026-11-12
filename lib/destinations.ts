import { DESTINATIONS, type Destination } from "./types";

const ALIASES: Array<[Destination, RegExp]> = [
  ["NUS Kent Ridge", /\b(?:nus|kent ridge|national university of singapore)\b/i],
  ["NTU", /\b(?:ntu|nanyang(?: technological university)?)\b/i],
  ["SMU", /\b(?:smu|singapore management university)\b/i],
  ["Raffles Place", /\b(?:raffles place|cbd|central business district)\b/i],
  ["Changi Business Park", /\b(?:changi business park|cbp)\b/i],
  ["one-north", /\b(?:one[- ]?north|fusionopolis|biopolis|mediapolis)\b/i],
  ["SUTD", /\b(?:sutd|singapore university of technology and design)\b/i],
  // Case-sensitive "SIT": lower-case "sit" is an ordinary English word.
  ["SIT Punggol", /\bSIT\b|\b(?:[Ss]ingapore [Ii]nstitute of [Tt]echnology|[Pp]unggol [Dd]igital [Dd]istrict)\b/],
  ["Jurong Lake District", /\b(?:jurong lake district|jurong east|jld)\b/i],
  ["Changi Airport", /\b(?:changi airport|airport)\b/i],
];

export function findDestination(text: string): Destination | undefined {
  return ALIASES.find(([, pattern]) => pattern.test(text))?.[0];
}
export function normalizeDestination(value: unknown): Destination | undefined {
  if (typeof value !== "string") return undefined;
  return DESTINATIONS.find((item) => item.toLowerCase() === value.trim().toLowerCase())
    ?? ALIASES.find(([, pattern]) => pattern.test(value))?.[0];
}
