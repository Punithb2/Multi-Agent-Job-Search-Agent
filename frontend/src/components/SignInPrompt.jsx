import { useEffect, useRef } from 'react';
import { Icon } from './ui';

/**
 * Polished dialog shown when a guest reaches a feature that needs an account
 * (saving a job, opening saved jobs, opening search history).
 */
export default function SignInPrompt({ title, message, onSignIn, onSignUp, onClose }) {
  const dialog = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    dialog.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-prompt-title"
        tabIndex={-1}
        ref={dialog}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <div className="empty-icon"><Icon name="bookmark" /></div>
        <h3 id="signin-prompt-title">{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onSignUp}>
            Create free account <Icon name="arrow" />
          </button>
          <button type="button" className="secondary-button modal-secondary" onClick={onSignIn}>
            I already have one
          </button>
        </div>
        <button type="button" className="link-button modal-dismiss" onClick={onClose}>
          Keep browsing as a guest
        </button>
      </div>
    </div>
  );
}
