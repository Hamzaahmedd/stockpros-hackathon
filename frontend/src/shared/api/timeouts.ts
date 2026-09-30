/**
 * The backend queues compute-heavy requests (see backend
 * `shared/middlewares/priority-queue.ts`) and sheds one with a 503 only after
 * `priorityQueue.maxWaitMs` (20 s). The client must outwait that, otherwise a
 * request that is merely queued during a surge is aborted client-side and the
 * user sees a spurious failure toast. The client timeout is the queue wait
 * plus compute headroom: 40 s - 20 s leaves 20 s to actually compute once a
 * request leaves the queue. Keep the gap when changing either value.
 */
export const BACKEND_QUEUE_MAX_WAIT_MS = 20_000;
/** Time the AI service gets once a request has left the queue. */
export const COMPUTE_HEADROOM_MS = 20_000;
export const QUEUED_COMPUTE_TIMEOUT_MS =
  BACKEND_QUEUE_MAX_WAIT_MS + COMPUTE_HEADROOM_MS;

// Exactly the routes behind the backend priority queue. `/forecast/pdf` and
// other siblings are deliberately not matched: they are not queued.
const QUEUED_COMPUTE_PATHS: readonly RegExp[] = [
  /^\/api\/v1\/forecast\/?$/,
  /^\/api\/v1\/decision-support\/market\/decision\/[^/]+\/?$/,
  /^\/api\/v1\/decision-support\/market\/radar\/?$/,
];

/** True for the routes behind the backend priority queue (GET forecast / market decision / radar). */
export const isQueuedComputeRoute = (
  url: string | undefined,
  method: string | undefined = "get",
): boolean => queuedComputeTimeout(url, method) !== undefined;

/**
 * The timeout to apply to a request URL (absolute or relative, query string
 * allowed), or `undefined` when the request is not a queued compute route.
 */
export const queuedComputeTimeout = (
  url: string | undefined,
  method: string | undefined = "get",
): number | undefined => {
  if (!url || method.toLowerCase() !== "get") return undefined;

  let pathname: string;
  try {
    pathname = new URL(url, "http://placeholder.invalid").pathname;
  } catch {
    return undefined;
  }
  return QUEUED_COMPUTE_PATHS.some((pattern) => pattern.test(pathname))
    ? QUEUED_COMPUTE_TIMEOUT_MS
    : undefined;
};
