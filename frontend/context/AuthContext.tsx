"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth";

type AuthContextType = {
  user: any;
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      console.log("🔥 CALLING /api/auth/me");

      const res = await getCurrentUser();

      console.log("✅ /me RESPONSE:", res);

      if (res?.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("❌ AUTH ERROR:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchUser();
  }, []);

  // 🔥 GLOBAL REFRESH LISTENER
  useEffect(() => {
    const handler = () => {
      console.log("🔄 AUTH REFRESH TRIGGERED");
      fetchUser();
    };

    window.addEventListener("auth:refresh", handler);
    return () => window.removeEventListener("auth:refresh", handler);
  }, []);

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