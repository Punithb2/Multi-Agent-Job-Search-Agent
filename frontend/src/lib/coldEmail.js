/** Split a cold email draft into its subject line and the rest of the message. */
export function parseColdEmail(draft) {
  const lines = (draft || '').trim().split('\n');
  const first = lines[0]?.trim() || '';
  if (/^subject\s*:/i.test(first)) {
    return { subject: first.replace(/^subject\s*:/i, '').trim(), body: lines.slice(1).join('\n').trim() };
  }
  return { subject: '', body: (draft || '').trim() };
}

/** A Gmail compose window with the address, subject, and message already filled in. */
export function gmailComposeUrl({ to, subject, body }) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: to || '', su: subject || '', body: body || '' });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((value || '').trim());
}
