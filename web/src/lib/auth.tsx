import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  accountLogin,
  accountMe,
  clearOwnerToken,
  clearRaterSession,
  getCachedRaterName,
  ownerMe,
  ownerLogout,
  getRaterToken,
  setRaterToken,
  setCachedRaterName,
} from "./api";
import { copy } from "./copy";

export type RaterInfo = { displayName: string };

type AuthState = {
  owner: boolean;
  rater: RaterInfo | null;
  ready: boolean;
  identityEpoch: number;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  loginRater: (displayName: string, pin: string) => Promise<void>;
  logoutRater: () => void;
};

const Ctx = createContext<AuthState>({
  owner: false,
  rater: null,
  ready: false,
  identityEpoch: 0,
  refresh: async () => {},
  logout: async () => {},
  loginRater: async () => {},
  logoutRater: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState(false);
  const [rater, setRater] = useState<RaterInfo | null>(() => {
    const name = getCachedRaterName();
    return name ? { displayName: name } : null;
  });
  const [ready, setReady] = useState(false);
  const [identityEpoch, setIdentityEpoch] = useState(0);

  const refresh = async () => {
    try {
      if (!getRaterToken()) { setRater(null); return; }
      const res = await accountMe();
      if (res.rater && res.displayName) {
        setRater({displayName:res.displayName});
        setCachedRaterName(res.displayName);
        if (res.token) setRaterToken(res.token);
      } else {
        clearRaterSession();
        setRater(null);
        setIdentityEpoch(n=>n+1);
      }
    } catch {
      // A transport failure is not an authentication failure. Keep the remembered account.
    } finally { setReady(true); }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      owner,
      rater,
      ready,
      identityEpoch,
      refresh,
      logout: async () => {
        try {
          await ownerLogout();
        } finally {
          clearOwnerToken();
          setOwner(false);
        }
      },
      loginRater: async (displayName: string, pin: string) => {
        const res = await accountLogin(displayName, pin);
        setRater({ displayName: res.displayName });
        setIdentityEpoch((n) => n + 1);
      },
      logoutRater: () => {
        if (!window.confirm(copy.account.logoutConfirm)) return;
        clearRaterSession();
        setRater(null);
        setIdentityEpoch((n) => n + 1);
      },
    }),
    [owner, rater, ready, identityEpoch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
