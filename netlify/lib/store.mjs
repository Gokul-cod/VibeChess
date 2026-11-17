/**
 * Netlify Blobs access for the VibeChess API.
 *
 * Blobs is Netlify's built-in key/value store, so accounts need no extra
 * database or account with a third party. The store is opened with strong
 * consistency because a session written by one function invocation is read by
 * the next request (login → /me).
 */
import { getStore } from '@netlify/blobs';

export const STORE_NAME = 'vibechess';

let opened = null;
let failed = false;

/** The site-wide store, or null when the function is not running on Netlify. */
export function openStore() {
  if (opened || failed) return opened;
  try {
    opened = getStore({ name: STORE_NAME, consistency: 'strong' });
  } catch (error) {
    failed = true;
    console.error('[store] Netlify Blobs is not available:', error?.message ?? error);
  }
  return opened;
}
