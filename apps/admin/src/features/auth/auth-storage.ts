const TOKEN_KEY = "session_id";
const listeners = new Set<() => void>();

const readToken = () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY));

let cachedToken = readToken();

const emit = () => listeners.forEach((listener) => listener());

export const authToken = {
  get: () => cachedToken,
  set: (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    cachedToken = token;
    emit();
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_image");
    cachedToken = null;
    emit();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const getUserDetails = () => ({
  email: localStorage.getItem("user_email") || "",
  name: localStorage.getItem("user_name") || "",
});
