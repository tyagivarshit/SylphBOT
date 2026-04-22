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

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  businessId?: string | null;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  refreshUser: async () => null,
});

export const AuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hasFetched = useRef(false);

  const fetchUser = useCallback(async (options?: { isInitial?: boolean }) => {
    try {
      const res = await getCurrentUser();

      if (res?.unauthorized || !res?.success) {
        setUser(null);
        return null;
      }

      const nextUser = res?.data?.user ?? null;
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    } finally {
      if (options?.isInitial) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    void fetchUser({
      isInitial: true,
    });
  }, [fetchUser]);

  useEffect(() => {
    const handler = () => void fetchUser();

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
