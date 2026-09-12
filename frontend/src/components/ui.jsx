export function Icon({ name }) {
  const paths = {
    spark: <><path d="m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
    external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
    back: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    wand: <><path d="m15 4 5 5" /><path d="m13 6 5 5" /><path d="m4 20 10-10" /><path d="m6 18-2-2" /><path d="m18 6 2-2" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    bookmark: <path d="M18 21 12 17l-6 4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 1.9" /></>,
    user: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    logout: <><path d="M15 12H4" /><path d="m8 8-4 4 4 4" /><path d="M10 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
    lock: <><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
    eye: <><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
    'eye-off': <><path d="M10.6 6.1A8.8 8.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6" /><path d="M6.4 7.6A16.6 16.6 0 0 0 2.5 12S6 18 12 18a9 9 0 0 0 3.6-.7" /><path d="m4 4 16 16" /></>,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    trash: <><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" /><path d="M10 11v6M14 11v6" /></>,
    shield: <><path d="M12 3l7 3v5.5c0 4.2-2.9 7.7-7 9.5-4.1-1.8-7-5.3-7-9.5V6Z" /><path d="m9 12 2 2 4-4" /></>,
  };
  return <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>;
}

export function ErrorMessage({ text }) {
  return <div className="error-message" role="alert">{text}</div>;
}

/** Shared empty / gated state used by the saved jobs and history pages. */
export function EmptyState({ icon = 'spark', title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} /></div>
      <h4>{title}</h4>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
