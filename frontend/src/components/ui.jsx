export function Icon({ name }) {
  const icons = { spark: '*', arrow: '->', upload: 'up', document: 'doc', external: 'open', back: '<-' };
  return <span className="inline-icon" aria-hidden="true">{icons[name]}</span>;
}

export function ErrorMessage({ text }) {
  return <div className="error-message" role="alert">{text}</div>;
}
