/**
 * Max prescription image bytes accepted by analyze flow.
 * Keep aligned with `experimental.serverActions.bodySizeLimit` in next.config.mjs.
 * Vercel serverless request bodies are ~4.5MB — uploads near this max may 413 before
 * Server Actions / route handlers run; prefer client-direct-to-storage for large images.
 */
export const MAX_PRESCRIPTION_IMAGE_BYTES = 6 * 1024 * 1024;
