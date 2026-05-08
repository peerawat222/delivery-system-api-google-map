"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, setAuthToken } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem("token") || "";
    let savedUser = null;

    try {
      const raw = localStorage.getItem("user");
      savedUser = raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem("user");
    }

    setToken(savedToken);
    setUser(savedUser);
    setAuthToken(savedToken);
    setInitialized(true);
  }, []);

  const saveAuth = (nextToken, nextUser) => {
    const safeToken = nextToken || "";

    setToken(safeToken);
    setUser(nextUser || null);
    setAuthToken(safeToken);

    if (safeToken) {
      localStorage.setItem("token", safeToken);
    } else {
      localStorage.removeItem("token");
    }

    if (nextUser) {
      localStorage.setItem("user", JSON.stringify(nextUser));
    } else {
      localStorage.removeItem("user");
    }
  };

  const login = async (email, password) => {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    saveAuth(data.token, data.user);
    return data;
  };

  const register = async (payload) => {
    await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return login(payload.email, payload.password);
  };

  const logout = () => saveAuth("", null);

  const value = useMemo(
    () => ({
      token,
      user,
      initialized,
      isLoggedIn: Boolean(token),
      login,
      logout,
      register,
      setAuth: saveAuth,
    }),
    [token, user, initialized]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}