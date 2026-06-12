import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api, setToken } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

export type User = {
  id: string;
  username: string;
  email: string;
  verified: boolean;
  country: string | null;
  role: string;
  created_at: string;
  profile_image_base64?: string | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (
    email: string,
    username: string,
    password: string,
    acceptedTerms: boolean,
  ) => Promise<User>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "monochat_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (token) {
        setToken(token);
        try {
          const me = await api<User>("/auth/me");
          setUser(me);
        } catch {
          setToken(null);
          await storage.secureRemove(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (token: string, u: User) => {
    setToken(token);
    await storage.secureSet(TOKEN_KEY, token);
    setUser(u);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      await persist(res.token, res.user);
      return res.user;
    },
    [persist],
  );

  const signUp = useCallback(
    async (
      email: string,
      username: string,
      password: string,
      acceptedTerms: boolean,
    ) => {
      const res = await api<{ token: string; user: User }>("/auth/signup", {
        method: "POST",
        body: { email, username, password, accepted_terms: acceptedTerms },
      });
      await persist(res.token, res.user);
      return res.user;
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    setToken(null);
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, signOut, refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
