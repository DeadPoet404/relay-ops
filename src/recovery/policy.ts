export const MAX_SUBMISSIONS = 3;
export const MAX_LOOKUPS = 3;
export const STALE_ACTION_MS = 30_000;
export const LOOKUP_DELAY_MS = 3_000;

// Fixed bounded policy for the LOCAL simulator, not a universal vendor policy.
export function retryDelayMs(
  completedAttempts: number,
  random = Math.random(),
) {
  return (
    Math.min(10_000, 2_000 * 2 ** Math.max(0, completedAttempts - 1)) +
    Math.floor(Math.max(0, Math.min(random, 1)) * 500)
  );
}
export function canRetrySubmission(result: string, attempts: number) {
  return result === "unavailable" && attempts < MAX_SUBMISSIONS;
}
