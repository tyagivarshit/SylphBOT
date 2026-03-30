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

type User = {
  id: string;
  email: string;
  role: string;
  businessId?: string | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  refreshUser: async () => {},
});

export const AuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const hasFetched = useRef(false);

  const fetchUser = useCallback(async () => {
    try {
      console.log("🔥 CALLING /api/auth/me");

      const res = await getCurrentUser();

      console.log("✅ /me RESPONSE:", res);

      if (res?.unauthorized) {
        setUser(null);
        return;
      }

      if (!res?.success) {
        setUser(null);
        return;
      }

      const userData = res?.data?.user ?? null;

      console.log("👤 USER SET:", userData);

      setUser(userData);
    } catch (err) {
      console.error("❌ AUTH ERROR:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const handler = () => {
      console.log("🔄 AUTH REFRESH TRIGGERED");
      fetchUser();
    };

    window.addEventListener("auth:refresh", handler);
    return () =>
      window.removeEventListener("auth:refresh", handler);
  }, [fetchUser]);

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

export const useAuth = () => useContext(AuthContext);