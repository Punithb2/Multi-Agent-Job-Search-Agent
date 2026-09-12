import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Free hosting tiers stop the backend after a period of inactivity, and the
 * next request has to wait for it to start again. A search also waits on
 * JSearch (up to 45s server-side) and Gemini, so the ceiling is generous.
 */
export const REQUEST_TIMEOUT_MS = 90_000;

export const api = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

/** Turn an axios failure into something worth showing a person. */
export function describeRequestError(error, fallback) {
  if (error.code === 'ECONNABORTED') {
    return 'That took longer than expected. The free server may be starting up — please try again in a moment.';
  }
  if (!error.response) {
    return 'We could not reach the CareerAtlas server. Check your connection and try again.';
  }
  return error.response?.data?.detail || fallback;
}

/**
 * Ping the backend so a sleeping free-tier instance starts waking while the
 * user is still filling in the form. Failures are irrelevant: this is a nudge,
 * not a dependency.
 *
 * Resolves to true when the server answered quickly (already awake).
 */
export async function wakeBackend() {
  try {
    await axios.get(`${API_URL}/health`, { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}
