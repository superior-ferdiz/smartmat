/** Current time. Passed in as a dependency so tests can move time forward (lockout, session expiry). */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
