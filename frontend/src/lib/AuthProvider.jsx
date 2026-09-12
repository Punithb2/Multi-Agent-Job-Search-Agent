import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { AuthContext } from './authContext';

/** Turn Supabase's raw auth errors into copy a student demo user can act on. */
function friendlyAuthError(message) {
  const text = (message || '').toLowerCase();
  if (text.includes('invalid login credentials')) return 'That email and password combination does not match an account.';
  if (text.includes('email not confirmed')) return 'Confirm your email address from the Supabase verification link, then sign in.';
  if (text.includes('already registered') || text.includes('already been registered')) return 'An account already exists for this email. Try signing in instead.';
  if (text.includes('password should be') || text.includes('weak password')) return 'Choose a password with at least 8 characters.';
  if (text.includes('rate limit') || text.includes('too many')) return 'Too many attempts. Wait a moment and try again.';
  if (text.includes('failed to fetch') || text.includes('network')) return 'We could not reach the accounts service. Check your connection and try again.';
  return message || 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoadingSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoadingSession(false);
    });

    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  const signUp = useCallback(async (email, password, displayName) => {
    if (!supabase) return { error: 'Accounts are unavailable until Supabase is configured.' };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName?.trim() || null } },
    });
    if (error) return { error: friendlyAuthError(error.message) };
    // With email confirmation enabled Supabase returns a user but no session.
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) return { error: 'Accounts are unavailable until Supabase is configured.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: friendlyAuthError(error.message) };
    return {};
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return { error: 'Accounts are unavailable until Supabase is configured.' };
    const { error } = await supabase.auth.signOut();
    if (error) return { error: friendlyAuthError(error.message) };
    return {};
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loadingSession,
    accountsEnabled: isSupabaseConfigured,
    signUp,
    signIn,
    signOut,
  }), [session, loadingSession, signUp, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
