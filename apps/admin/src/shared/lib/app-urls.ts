/** Public storefront origin; override when the web app is deployed elsewhere. */
export const getWebUrl = () => import.meta.env.VITE_WEB_URL || "http://localhost:5174";

export const getHotelUrl = (hotelId: string) => `${getWebUrl()}/detail/${hotelId}`;
