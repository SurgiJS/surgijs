/**
 * Development warnings. Call sites wrap `warn` in `if (process.env.NODE_ENV !== 'production')`, which bundlers
 * replace with a constant, so the messages and this function drop out of production builds.
 */
export function warn(message: string): void {
  console.warn(`[surgijs] ${message}`);
}
