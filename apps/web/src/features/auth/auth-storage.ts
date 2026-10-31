const AUTH_CHANGED_EVENT = "auth:changed";

const notifyAuthChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
};

export const getSessionToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("session_id");
};

export const setSessionToken = (token: string) => {
  localStorage.setItem("session_id", token);
  notifyAuthChanged();
};

export const clearSessionToken = () => {
  localStorage.removeItem("session_id");
  notifyAuthChanged();
};

export const subscribeToAuth = (onChange: () => void) => {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(AUTH_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};
