import axios, { InternalAxiosRequestConfig } from "axios";
import { authSession } from "./auth-session";

// API origin: copy .env.local.example → .env.local. Canonical local backend port is 5001 (see backend PORT).
const viteEnv = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env;

const getBaseURL = () => {
  if (viteEnv?.VITE_API_BASE_URL) {
    return viteEnv.VITE_API_BASE_URL;
  }

  // Must match hotel-booking-backend PORT (default 5001) when VITE_API_BASE_URL is unset.
  return "http://localhost:5001";
};

export const getApiBaseUrl = getBaseURL;

// Extend axios config to include metadata
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: { retryCount: number };
}

// Create axios instance with consistent configuration
const axiosInstance = axios.create({
  baseURL: getBaseURL(),
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Ensure cookies are sent with requests
  timeout: 30000, // 30 second timeout
});

// Session auth travels in the httpOnly cookie; no bearer token is attached here.
axiosInstance.interceptors.request.use((config: CustomAxiosRequestConfig) => {
  config.metadata = { retryCount: 0 };
  return config;
});

// Response interceptor to handle common errors and retries
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config } = error;

    // Handle 401 errors by clearing the local session hint; components handle redirects.
    if (error.response?.status === 401) {
      authSession.clear();
    }

    // Handle rate limiting (429) with retry logic
    if (error.response?.status === 429 && config) {
      const customConfig = config as CustomAxiosRequestConfig;
      if (customConfig.metadata && customConfig.metadata.retryCount < 3) {
        const customConfig = config as CustomAxiosRequestConfig;
        if (customConfig.metadata) {
          customConfig.metadata.retryCount += 1;

          // Exponential backoff: wait 1s, 2s, 4s
          const delay = Math.pow(2, customConfig.metadata.retryCount - 1) * 1000;

          await new Promise((resolve) => setTimeout(resolve, delay));

          return axiosInstance(config);
        }
      }
    }

    // Handle network errors with retry
    if (!error.response && config) {
      const customConfig = config as CustomAxiosRequestConfig;
      if (customConfig.metadata && customConfig.metadata.retryCount < 2) {
        const customConfig = config as CustomAxiosRequestConfig;
        if (customConfig.metadata) {
          customConfig.metadata.retryCount += 1;

          // Wait 2 seconds before retry
          await new Promise((resolve) => setTimeout(resolve, 2000));

          return axiosInstance(config);
        }
      }
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
