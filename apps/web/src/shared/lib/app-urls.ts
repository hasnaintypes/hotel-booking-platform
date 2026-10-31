/** Cross-app links; override in deployments where admin is on another origin. */
export const getAdminUrl = () => import.meta.env.VITE_ADMIN_URL || "http://localhost:5175";
