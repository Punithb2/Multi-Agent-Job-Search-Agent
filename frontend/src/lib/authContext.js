import { createContext, useContext } from 'react';

/**
 * Shared auth state for CareerAtlas. Kept in its own module so the provider file
 * only exports a component (Vite fast-refresh requirement).
 */
export const AuthContext = createContext({
  session: null,
  user: null,
  loadingSession: true,
  accountsEnabled: false,
  signUp: async () => ({ error: 'Accounts are unavailable.' }),
  signIn: async () => ({ error: 'Accounts are unavailable.' }),
  signOut: async () => ({ error: 'Accounts are unavailable.' }),
});

export function useAuth() {
  return useContext(AuthContext);
}
