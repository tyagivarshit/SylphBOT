"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { getCurrentUser } from "@/lib/auth";

/* ======================================
🔥 TYPES
====================================== */

type User = {
  id: string;
  email: string;
  role: string;
  businessId: string | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
};

/* ======================================
🔥 CONTEXT
====================================== */

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  refreshUser: async () => {},
});

/* ======================================
🔥 PROVIDER
====================================== */

export const AuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const hasFetched = useRef(false);

  /* ======================================
  🔥 FETCH USER (STRICT + SAFE)
  ====================================== */

  const fetchUser = useCallback(async () => {
    try {
      console.log("🔥 CALLING /api/auth/me");

      const res = await getCurrentUser();

      console.log("✅ /me RESPONSE:", res);

      /* 🔐 UNAUTHORIZED */
      if (res.unauthorized) {
        setUser(null);
        return;
      }

      /* ❌ FAILED */
      if (!res.success) {
        setUser(null);
        return;
      }

      /* ✅ SUCCESS */
      const userData = res.data?.user || null;

      setUser(userData);

    } catch (err) {
      console.error("❌ AUTH ERROR:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ======================================
  🔥 INITIAL LOAD
  ====================================== */

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetchUser();
  }, [fetchUser]);

  /* ======================================
  🔥 GLOBAL REFRESH EVENT
  ====================================== */

  useEffect(() => {
    const handler = () => {
      console.log("🔄 AUTH REFRESH TRIGGERED");
      fetchUser();
    };

    window.addEventListener("auth:refresh", handler);
    return () =>
      window.removeEventListener("auth:refresh", handler);
  }, [fetchUser]);

  /* ======================================
  🔥 VALUE
  ====================================== */

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/* ======================================
🔥 HOOK
====================================== */

export const useAuth = () => useContext(AuthContext);