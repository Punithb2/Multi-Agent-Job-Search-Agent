import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

/** Initial shown in the avatar bubble, derived from the display name or email. */
function initialFor(user) {
  const source = user?.user_metadata?.display_name || user?.email || '';
  return source.trim().charAt(0).toUpperCase() || '?';
}

export default function AccountMenu({ user, onSignOut, onGoToSaved, onGoToHistory, busy }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => { if (!wrapper.current?.contains(event.target)) setOpen(false); };
    const onKeyDown = (event) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('mousedown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  const run = (action) => { setOpen(false); action(); };
  const displayName = user?.user_metadata?.display_name?.trim();

  return (
    <div className="account-menu" ref={wrapper}>
      <button
        ref={trigger}
        type="button"
        className={`account-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.email}`}
      >
        <span className="account-avatar" aria-hidden="true">{initialFor(user)}</span>
        <span className="account-label">{displayName || user.email}</span>
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-identity">
            <span className="account-avatar account-avatar-lg" aria-hidden="true">{initialFor(user)}</span>
            <div>
              <strong>{displayName || 'Signed in'}</strong>
              <small>{user.email}</small>
            </div>
          </div>
          <button type="button" className="account-item" role="menuitem" onClick={() => run(onGoToSaved)}>
            <Icon name="bookmark" /> Saved jobs
          </button>
          <button type="button" className="account-item" role="menuitem" onClick={() => run(onGoToHistory)}>
            <Icon name="clock" /> Search history
          </button>
          <button type="button" className="account-item account-item-danger" role="menuitem" onClick={() => run(onSignOut)} disabled={busy}>
            <Icon name="logout" /> {busy ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
