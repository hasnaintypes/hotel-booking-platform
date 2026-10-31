const AUTH_SESSION_KEY = "auth_session";
const LEGACY_TOKEN_KEY = "session_id";
const AUTH_CHANGED_EVENT = "auth:changed";

const listeners = new Set<() => void>();

const readSession = () => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTH_SESSION_KEY) === "1";
};

let snapshot = readSession();
let listening = false;

const emit = () => listeners.forEach((listener) => listener());

const sync = () => {
  const next = readSession();
  if (next === snapshot) return;
  snapshot = next;
  emit();
};

const onStorage = (event: StorageEvent) => {
  if (event.key === AUTH_SESSION_KEY || event.key === null) sync();
};

const onAuthChanged = () => sync();

const startListening = () => {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
  listening = true;
};

const stopListening = () => {
  if (!listening || typeof window === "undefined") return;
  window.removeEventListener("storage", onStorage);
  window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
  listening = false;
};

// The legacy bearer token is no longer used; purge it on upgrade.
if (typeof window !== "undefined") {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export const authSession = {
  get: () => snapshot,
  set: () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.setItem(AUTH_SESSION_KEY, "1");
    sync();
  },
  clear: () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    sync();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    startListening();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stopListening();
    };
  },
};
