import type { RateLimitRule } from '../config';

/** Route config for @fastify/rate-limit. Counted per client IP address (the socket's, see app.ts). */
export function rateLimit(rule: RateLimitRule) {
  return { rateLimit: { max: rule.max, timeWindow: rule.windowMs } };
}
