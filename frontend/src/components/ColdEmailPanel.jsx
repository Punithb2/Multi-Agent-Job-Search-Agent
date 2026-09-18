import { useState } from 'react';
import { Icon } from './ui';
import { gmailComposeUrl, looksLikeEmail, parseColdEmail } from '../lib/coldEmail';

/**
 * The cold email draft, with the recruiter's address and a one-click handover to
 * Gmail. CareerAtlas never sends anything itself: the user presses Send in Gmail,
 * so the message goes from their own account and they can attach their resume.
 */
export default function ColdEmailPanel({ draft, recipient, onChangeRecipient, resumeName }) {
  const { subject, body } = parseColdEmail(draft);
  const [copied, setCopied] = useState('');
  const [touched, setTouched] = useState(false);

  const copy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  };

  const address = (recipient || '').trim();
  const invalid = touched && address && !looksLikeEmail(address);
  const openGmail = () => {
    setTouched(true);
    if (address && !looksLikeEmail(address)) return;
    window.open(gmailComposeUrl({ to: address, subject, body }), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="cold-email">
      <div className="cold-email-head">
        <label className="field-label cold-email-to">
          <span>Send to</span>
          <input
            type="email"
            inputMode="email"
            value={recipient}
            onChange={(event) => onChangeRecipient(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="recruiter@company.com"
            aria-invalid={invalid}
            aria-describedby="cold-email-to-hint"
          />
          <small className={`field-hint${invalid ? ' field-error' : ''}`} id="cold-email-to-hint">
            {invalid
              ? 'That does not look like an email address.'
              : address
                ? 'Check this is the right person before you send.'
                : 'We only fill this in when the posting prints an address. Otherwise look on the company careers page or the LinkedIn post.'}
          </small>
        </label>
        <div className="cold-email-actions">
          <button type="button" className="download-button" onClick={() => copy('email', `${subject ? `Subject: ${subject}\n\n` : ''}${body}`)}>
            <Icon name="document" /> {copied === 'email' ? 'Copied' : 'Copy email'}
          </button>
          <button type="button" className="secondary-button" onClick={openGmail}>
            <Icon name="mail" /> Open in Gmail
          </button>
        </div>
      </div>

      <article className="cold-email-sheet">
        {subject && (
          <p className="cold-email-subject">
            <span>Subject</span>
            <strong>{subject}</strong>
          </p>
        )}
        <pre className="cold-email-body">{body}</pre>
      </article>

      <p className="cold-email-note">
        <Icon name="shield" />
        <span>
          Gmail opens in a new tab with this message ready, and you press Send there, so it comes from your own address.
          {resumeName ? ` Attach ${resumeName} in Gmail before sending.` : ' Attach your resume in Gmail before sending.'}
        </span>
      </p>
    </div>
  );
}
