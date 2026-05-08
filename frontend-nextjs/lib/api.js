const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
const API_PREFIX = "/api";

function buildUrl(path) {
  if (path.startsWith("http")) return path;
  if (path.startsWith(API_PREFIX)) return `${BASE_URL}${path}`;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_URL}${API_PREFIX}${cleanPath}`;
}

function getToken() {
  try {
    return typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
  } catch {
    return "";
  }
}

export async function apiFetch(path, options = {}) {
  const url = buildUrl(path);
  const token = getToken();

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!res.ok) {
    const msg =
      (data && data.message) ||
      (typeof data === "string" ? data : "") ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

export function setAuthToken(token) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
}
