/**
 * Max prescription image bytes accepted by analyze flow.
 * Keep aligned with `experimental.serverActions.bodySizeLimit` in next.config.mjs
 * and your hosting provider request body limits (Vercel may cap below this on some plans).
 */
export const MAX_PRESCRIPTION_IMAGE_BYTES = 6 * 1024 * 1024;
