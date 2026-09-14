import { useState } from 'react';
import { ErrorMessage, Icon } from './ui';
import { changeKey, REVERTIBLE_KINDS } from '../lib/resumeReview';

const TYPE_LABELS = { modified: 'Reworded', added: 'New', removed: 'Removed' };

function Diff({ segments }) {
  return (
    <p className="change-diff">
      {segments.map((segment, index) => (
        <span key={index} className={`diff-${segment.op}`}>
          {segment.op === 'removed' ? <del>{segment.text}</del> : segment.op === 'added' ? <ins>{segment.text}</ins> : segment.text}{' '}
        </span>
      ))}
    </p>
  );
}

function ChangeCard({ item, onFix, onDismiss, onEdit }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.original);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className={`change-card change-${item.type}${item.new_terms?.length ? ' has-flags' : ''}`}>
      <div className="change-top">
        <span className={`change-badge change-badge-${item.type}`}>{TYPE_LABELS[item.type]}</span>
        {item.section && <span className="change-section">{item.section}</span>}
      </div>

      <Diff segments={item.diff} />

      {item.new_terms?.length > 0 && (
        <p className="change-flag" role="note">
          <Icon name="shield" />
          <span><strong>Not in your original resume:</strong> {item.new_terms.join(', ')}. Make sure this is true before you apply.</span>
        </p>
      )}
      {item.type === 'removed' && (
        <p className="change-hint">This was in your original resume but is not in the tailored version.</p>
      )}

      <div className="change-actions">
        {item.type === 'modified' && REVERTIBLE_KINDS.has(item.kind) && (
          <button type="button" className="change-button" onClick={() => onFix(item, 'revert')}>
            <Icon name="back" /> Revert to original
          </button>
        )}
        {item.type === 'modified' && !REVERTIBLE_KINDS.has(item.kind) && (
          <button type="button" className="change-button" onClick={onEdit}>
            <Icon name="wand" /> Fix in editor
          </button>
        )}
        {item.type === 'added' && (
          <button type="button" className="change-button change-button-danger" onClick={() => onFix(item, 'remove')}>
            <Icon name="trash" /> Remove this line
          </button>
        )}
        {item.type === 'removed' && (
          <button type="button" className="change-button" onClick={copy}>
            <Icon name="document" /> {copied ? 'Copied' : 'Copy original text'}
          </button>
        )}
        <button type="button" className="link-button" onClick={() => onDismiss(item)}>
          {item.type === 'removed' ? 'Leave it out' : 'Looks right'}
        </button>
      </div>
    </article>
  );
}

/**
 * What changed between the uploaded resume and the tailored one, with fixes. The
 * comparison is done word by word against the original text, not written by AI.
 */
export default function ResumeReview({ changes, checking, error, canCheck, onCheck, onFix, onDismiss, onEdit }) {
  if (!changes) {
    return (
      <div className="review-empty">
        <div className="workspace-empty-icon"><Icon name="shield" /></div>
        <h4>Check what was changed</h4>
        <p>Compare this tailored resume with your original, line by line, before you send it.</p>
        {error && <ErrorMessage text={error} />}
        <button type="button" className="secondary-button" onClick={onCheck} disabled={checking || !canCheck}>
          {checking ? <><span className="spinner" /> Comparing...</> : <>Review changes <Icon name="arrow" /></>}
        </button>
        {!canCheck && <p className="review-note">Attach the resume you tailored from, above, to compare.</p>}
      </div>
    );
  }

  const { summary, items } = changes;
  const flagged = items.filter((item) => item.new_terms?.length).length;
  const ordered = [...items].sort((a, b) => Number(Boolean(b.new_terms?.length)) - Number(Boolean(a.new_terms?.length)));

  return (
    <div className="review-panel">
      <div className="review-summary">
        <div className="review-chips">
          <span className="review-chip">{summary.unchanged} unchanged</span>
          <span className="review-chip chip-modified">{items.filter((item) => item.type === 'modified').length} reworded</span>
          <span className="review-chip chip-added">{items.filter((item) => item.type === 'added').length} new</span>
          <span className="review-chip chip-removed">{items.filter((item) => item.type === 'removed').length} removed</span>
          {flagged > 0 && <span className="review-chip chip-flagged"><Icon name="shield" /> {flagged} to verify</span>}
        </div>
        <div className="review-tools">
          <button type="button" className="link-button" onClick={onCheck} disabled={checking || !canCheck} title={canCheck ? 'Compare again' : 'Attach your resume to compare again'}>
            {checking ? 'Comparing...' : 'Compare again'}
          </button>
          <button type="button" className="change-button" onClick={onEdit}><Icon name="wand" /> Edit resume</button>
        </div>
      </div>
      {error && <ErrorMessage text={error} />}
      <p className="review-intro">
        Compared word by word with the resume you uploaded. Lines that bring in names or numbers your original doesn't mention are listed first.
      </p>
      {ordered.length === 0 ? (
        <div className="review-done"><Icon name="check" /> Nothing left to review.</div>
      ) : (
        <div className="change-list">
          {ordered.map((item) => (
            <ChangeCard key={changeKey(item)} item={item} onFix={onFix} onDismiss={onDismiss} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Plain-text editor for the tailored resume's markdown. */
export function ResumeEditor({ value, saving, onSave, onCancel }) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="resume-editor">
      <p className="review-intro">
        Edit the resume directly. Lines starting with <code>##</code> are section headings, <code>###</code> are entries (with <code>|</code> before dates), and <code>-</code> are bullet points.
      </p>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={24} spellCheck="true" aria-label="Tailored resume" />
      <div className="resume-editor-actions">
        <button type="button" className="link-button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="button" className="secondary-button" onClick={() => onSave(draft)} disabled={saving || draft === value}>
          {saving ? <><span className="spinner" /> Saving...</> : <>Save changes <Icon name="check" /></>}
        </button>
      </div>
    </div>
  );
}
