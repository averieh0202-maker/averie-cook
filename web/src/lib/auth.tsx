import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearOwnerToken, ownerMe, ownerLogout } from "./api";

type AuthState = {
  owner: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  owner: false,
  ready: false,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = async () => {
    try {
      const me = await ownerMe();
      setOwner(me.owner);
      if (!me.owner) clearOwnerToken();
    } catch {
      setOwner(false);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      owner,
      ready,
      refresh,
      logout: async () => {
        try {
          await ownerLogout();
        } finally {
          clearOwnerToken();
          setOwner(false);
        }
      },
    }),
    [owner, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
