import { useState } from 'react';
import { useAuth } from '../lib/authContext';
import { ErrorMessage, Icon } from '../components/ui';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

const COPY = {
  login: {
    kicker: 'Welcome back',
    title: <>Pick up where you <em>left off.</em></>,
    intro: 'Sign in to reach your saved jobs and every search you have run.',
    submit: 'Sign in',
    busy: 'Signing in...',
    switchText: 'New to CareerAtlas?',
    switchAction: 'Create an account',
  },
  signup: {
    kicker: 'Create your account',
    title: <>Keep every match <em>within reach.</em></>,
    intro: 'Save the roles worth returning to and keep a history of your searches.',
    submit: 'Create account',
    busy: 'Creating account...',
    switchText: 'Already have an account?',
    switchAction: 'Sign in',
  },
};

export default function AuthPage({ mode, onChangeMode, onAuthenticated, onGuest, reason }) {
  const { signIn, signUp } = useAuth();
  const isSignup = mode === 'signup';
  const copy = COPY[isSignup ? 'signup' : 'login'];

  const [values, setValues] = useState({ email: '', password: '', confirm: '', displayName: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState('');

  const update = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
    setFormError('');
  };

  const validate = () => {
    const errors = {};
    if (!values.email.trim()) errors.email = 'Enter your email address.';
    else if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Enter a valid email address.';
    if (!values.password) errors.password = 'Enter your password.';
    else if (isSignup && values.password.length < MIN_PASSWORD) errors.password = 'Use at least ' + MIN_PASSWORD + ' characters.';
    if (isSignup && values.password !== values.confirm) errors.confirm = 'Both passwords need to match.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    setFormError('');
    const result = isSignup
      ? await signUp(values.email, values.password, values.displayName)
      : await signIn(values.email, values.password);
    setBusy(false);
    if (result.error) return setFormError(result.error);
    if (result.needsEmailConfirmation) return setConfirmationSent(values.email.trim());
    onAuthenticated();
  };

  if (confirmationSent) {
    return (
      <section className="auth-page auth-page-solo">
        <div className="auth-card">
          <div className="auth-confirm">
            <div className="empty-icon"><Icon name="mail" /></div>
            <h1>Confirm your email</h1>
            <p>We sent a verification link to <strong>{confirmationSent}</strong>. Open it to activate your account, then come back and sign in.</p>
            <button className="primary-button" onClick={() => { setConfirmationSent(''); onChangeMode('login'); }}>
              Back to sign in <Icon name="arrow" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <aside className="auth-aside">
        <span className="section-kicker"><span className="live-dot" /> CareerAtlas account</span>
        <h2>Your search, saved for later.</h2>
        <p>One free account keeps your shortlist and your search history in one place, on any device.</p>
        <ul className="auth-benefits">
          <li>
            <span className="auth-benefit-icon"><Icon name="bookmark" /></span>
            <div><strong>Save the good ones</strong><span>Bookmark roles and come back when you are ready to apply.</span></div>
          </li>
          <li>
            <span className="auth-benefit-icon"><Icon name="clock" /></span>
            <div><strong>Revisit past searches</strong><span>Reopen the exact results a previous search returned.</span></div>
          </li>
          <li>
            <span className="auth-benefit-icon"><Icon name="shield" /></span>
            <div><strong>Your resume stays yours</strong><span>We never store your resume file or the text inside it.</span></div>
          </li>
        </ul>
      </aside>

      <div className="auth-card">
        <span className="section-kicker">{copy.kicker}</span>
        <h1 className="auth-title">{copy.title}</h1>
        <p className="auth-intro">{copy.intro}</p>
        {reason && <div className="auth-reason" role="status"><Icon name="spark" /> {reason}</div>}

        <form onSubmit={submit} noValidate>
          {isSignup && (
            <label className="field-label">
              <span>Display name <small className="field-hint">Optional</small></span>
              <input
                type="text"
                value={values.displayName}
                onChange={(event) => update('displayName', event.target.value)}
                placeholder="How should we greet you?"
                autoComplete="name"
                disabled={busy}
              />
            </label>
          )}

          <label className="field-label">
            <span>Email</span>
            <input
              // The sign-in form is the whole point of this screen, so focusing it is expected.
              autoFocus
              type="email"
              value={values.email}
              onChange={(event) => update('email', event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              disabled={busy}
            />
            {fieldErrors.email && <small className="field-error" id="email-error">{fieldErrors.email}</small>}
          </label>

          <label className="field-label">
            <span>Password {isSignup && <small className="field-hint">At least {MIN_PASSWORD} characters</small>}</span>
            <span className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={values.password}
                onChange={(event) => update('password', event.target.value)}
                placeholder={isSignup ? 'Create a password' : 'Your password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                disabled={busy}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={busy}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} />
              </button>
            </span>
            {fieldErrors.password && <small className="field-error" id="password-error">{fieldErrors.password}</small>}
          </label>

          {isSignup && (
            <label className="field-label">
              <span>Confirm password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={values.confirm}
                onChange={(event) => update('confirm', event.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.confirm)}
                aria-describedby={fieldErrors.confirm ? 'confirm-error' : undefined}
                disabled={busy}
              />
              {fieldErrors.confirm && <small className="field-error" id="confirm-error">{fieldErrors.confirm}</small>}
            </label>
          )}

          {formError && <ErrorMessage text={formError} />}

          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? <><span className="spinner" /> {copy.busy}</> : <>{copy.submit} <Icon name="arrow" /></>}
          </button>
        </form>

        <div className="auth-switch">
          <span>{copy.switchText}</span>
          <button type="button" className="link-button" onClick={() => onChangeMode(isSignup ? 'login' : 'signup')} disabled={busy}>
            {copy.switchAction}
          </button>
        </div>
        <button type="button" className="auth-guest link-button" onClick={onGuest} disabled={busy}>
          Continue without an account <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
}
