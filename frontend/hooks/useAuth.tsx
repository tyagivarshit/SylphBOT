"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

/* 🔥 SINGLE SOURCE OF TRUTH */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      if (!API) throw new Error("API not configured");

      const res = await fetch(`${API}/api/auth/me`, {
        credentials: "include",
      });

      if (!res.ok) {
        setUser(null);
        return;
      }

      const data = await res.json();
      setUser(data.user || null);

    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  /* 🔥 INITIAL LOAD (ONLY ONCE) */
  useEffect(() => {
    fetchUser();
  }, []);

  /* 🔥 REFRESH (MANUAL SYNC) */
  const refresh = async () => {
    setLoading(true);
    await fetchUser();
  };

  /* 🔥 LOGOUT (GLOBAL SYNC) */
  const logout = async () => {
    try {
      await fetch(`${API}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}

    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/* 🔥 USE AUTH HOOK */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}