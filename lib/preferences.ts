import {
  DESTINATION,
  DESTINATIONS,
  PRIORITIES,
  ROOM_TYPE,
  type Preferences,
  type Priority,
} from "./types";
import { normalizeDestination } from "./destinations";

export const DEFAULT_PREFERENCES: Preferences = {
  monthlyBudgetSgd: 1400,
  destination: DESTINATION,
  maxCommuteMinutes: 45,
  roomType: ROOM_TYPE,
  priority: "balanced",
};

export const LIMITS = {
  monthlyBudgetSgd: { min: 300, max: 20000 },
  maxCommuteMinutes: { min: 5, max: 120 },
} as const;

export const PRIORITY_LABELS: Record<Priority, string> = {
  balanced: "Balanced",
  cheaper: "Lower rent",
  shorter_commute: "Shorter commute",
  quieter: "Quieter area",
};

export const PRIORITY_HELP: Record<Priority, string> = {
  balanced: "Equal emphasis on rent, commute, quiet and amenities.",
  cheaper: "Prioritises leftover budget.",
  shorter_commute: "Prioritises travel time under your limit.",
  quieter: "Prioritises the demo quiet rating.",
};

export const PREFERENCE_FIELDS = [
  "monthly_budget_sgd",
  "max_commute_minutes",
  "room_type",
  "priority",
  "destination",
] as const;

export type PreferenceField = (typeof PREFERENCE_FIELDS)[number];

export interface FieldIssue {
  field: string;
  message: string;
}

export type PreferencesValidation =
  | { ok: true; value: Preferences }
  | { ok: false; errors: FieldIssue[] };

export type PatchValidation =
  | { ok: true; value: Partial<Preferences> }
  | { ok: false; errors: FieldIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

export function validatePreferences(input: unknown): PreferencesValidation {
  if (!isRecord(input)) {
    return { ok: false, errors: [{ field: "form", message: "Preferences must be an object." }] };
  }

  const errors: FieldIssue[] = [];

  if (!isIntegerInRange(input.monthlyBudgetSgd, LIMITS.monthlyBudgetSgd.min, LIMITS.monthlyBudgetSgd.max)) {
    errors.push({
      field: "monthlyBudgetSgd",
      message: `Budget must be a whole number from S$${LIMITS.monthlyBudgetSgd.min} to S$${LIMITS.monthlyBudgetSgd.max}.`,
    });
  }

  if (!isIntegerInRange(input.maxCommuteMinutes, LIMITS.maxCommuteMinutes.min, LIMITS.maxCommuteMinutes.max)) {
    errors.push({
      field: "maxCommuteMinutes",
      message: `Commute limit must be a whole number from ${LIMITS.maxCommuteMinutes.min} to ${LIMITS.maxCommuteMinutes.max} minutes.`,
    });
  }

  if (!(DESTINATIONS as readonly unknown[]).includes(input.destination)) {
    errors.push({ field: "destination", message: "Choose a supported destination." });
  }

  if (input.roomType !== ROOM_TYPE) {
    errors.push({ field: "roomType", message: `Only ${ROOM_TYPE} is supported.` });
  }

  if (!isPriority(input.priority)) {
    errors.push({ field: "priority", message: "Choose one of the listed priorities." });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      monthlyBudgetSgd: input.monthlyBudgetSgd as number,
      destination: input.destination as Preferences["destination"],
      maxCommuteMinutes: input.maxCommuteMinutes as number,
      roomType: ROOM_TYPE,
      priority: input.priority as Priority,
    },
  };
}

export interface PatchSanitization {
  patch: Partial<Preferences>;
  acceptedFields: PreferenceField[];
  rejected: FieldIssue[];
  ignoredFields: string[];
}

/**
 * Converts untrusted model output into a strict, whitelisted preference patch.
 * Unknown fields are ignored; invalid known fields are rejected with a readable reason.
 */
export function sanitizePreferencePatch(input: unknown): PatchSanitization {
  const patch: Partial<Preferences> = {};
  const acceptedFields: PreferenceField[] = [];
  const rejected: FieldIssue[] = [];
  const ignoredFields: string[] = [];

  if (!isRecord(input)) {
    return {
      patch,
      acceptedFields,
      rejected: [{ field: "response", message: "The model did not return a JSON object." }],
      ignoredFields,
    };
  }

  for (const key of Object.keys(input)) {
    if (!(PREFERENCE_FIELDS as readonly string[]).includes(key)) {
      ignoredFields.push(key);
    }
  }

  const budget = input.monthly_budget_sgd;
  if (budget !== undefined && budget !== null) {
    if (isIntegerInRange(budget, LIMITS.monthlyBudgetSgd.min, LIMITS.monthlyBudgetSgd.max)) {
      patch.monthlyBudgetSgd = budget;
      acceptedFields.push("monthly_budget_sgd");
    } else {
      rejected.push({
        field: "monthly_budget_sgd",
        message: `Budget must be a whole number from S$${LIMITS.monthlyBudgetSgd.min} to S$${LIMITS.monthlyBudgetSgd.max}.`,
      });
    }
  }

  const commute = input.max_commute_minutes;
  if (commute !== undefined && commute !== null) {
    if (isIntegerInRange(commute, LIMITS.maxCommuteMinutes.min, LIMITS.maxCommuteMinutes.max)) {
      patch.maxCommuteMinutes = commute;
      acceptedFields.push("max_commute_minutes");
    } else {
      rejected.push({
        field: "max_commute_minutes",
        message: `Commute limit must be a whole number from ${LIMITS.maxCommuteMinutes.min} to ${LIMITS.maxCommuteMinutes.max} minutes.`,
      });
    }
  }

  const roomType = input.room_type;
  if (roomType !== undefined && roomType !== null) {
    if (typeof roomType === "string" && roomType.trim().toLowerCase() === ROOM_TYPE) {
      patch.roomType = ROOM_TYPE;
      acceptedFields.push("room_type");
    } else {
      rejected.push({
        field: "room_type",
        message: `Only "${ROOM_TYPE}" is supported in this version.`,
      });
    }
  }

  const destination = input.destination;
  if (destination !== undefined && destination !== null) {
    const normalizedDestination = normalizeDestination(destination);
    if (normalizedDestination) {
      patch.destination = normalizedDestination;
      acceptedFields.push("destination");
    } else {
      rejected.push({
        field: "destination",
        message: `Choose one of: ${DESTINATIONS.join(", ")}.`,
      });
    }
  }

  const priority = input.priority;
  if (priority !== undefined && priority !== null) {
    if (isPriority(priority)) {
      patch.priority = priority;
      acceptedFields.push("priority");
    } else {
      rejected.push({
        field: "priority",
        message: "Priority must be balanced, cheaper, shorter_commute or quieter.",
      });
    }
  }

  return { patch, acceptedFields, rejected, ignoredFields };
}

const PATCH_KEYS = [
  "monthlyBudgetSgd",
  "maxCommuteMinutes",
  "roomType",
  "destination",
  "priority",
] as const;

/** Re-validates the JSON patch returned by our own API before the UI applies it. */
export function validatePreferencesPatch(input: unknown): PatchValidation {
  if (!isRecord(input)) {
    return { ok: false, errors: [{ field: "response", message: "Invalid preference patch." }] };
  }

  const errors: FieldIssue[] = [];
  const value: Partial<Preferences> = {};

  for (const key of Object.keys(input)) {
    if (!(PATCH_KEYS as readonly string[]).includes(key)) {
      errors.push({ field: key, message: "Unexpected field was not applied." });
    }
  }

  if (input.monthlyBudgetSgd !== undefined) {
    if (isIntegerInRange(input.monthlyBudgetSgd, LIMITS.monthlyBudgetSgd.min, LIMITS.monthlyBudgetSgd.max)) {
      value.monthlyBudgetSgd = input.monthlyBudgetSgd;
    } else {
      errors.push({ field: "monthlyBudgetSgd", message: "Budget is outside the allowed range." });
    }
  }

  if (input.maxCommuteMinutes !== undefined) {
    if (isIntegerInRange(input.maxCommuteMinutes, LIMITS.maxCommuteMinutes.min, LIMITS.maxCommuteMinutes.max)) {
      value.maxCommuteMinutes = input.maxCommuteMinutes;
    } else {
      errors.push({ field: "maxCommuteMinutes", message: "Commute limit is outside the allowed range." });
    }
  }

  if (input.roomType !== undefined) {
    if (input.roomType === ROOM_TYPE) value.roomType = ROOM_TYPE;
    else errors.push({ field: "roomType", message: `Only ${ROOM_TYPE} is supported.` });
  }

  if (input.destination !== undefined) {
    // Accept common names ("NUS", "one north") for a supported destination; the planner sometimes shortens them.
    const destination = normalizeDestination(input.destination);
    if (destination) value.destination = destination;
    else errors.push({ field: "destination", message: "Choose a supported destination." });
  }

  if (input.priority !== undefined) {
    if (isPriority(input.priority)) value.priority = input.priority;
    else errors.push({ field: "priority", message: "Unknown priority." });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** Extracts the first JSON object from a model reply, tolerating markdown fences. */
export function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
