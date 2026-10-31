import type { QueryClient } from "@tanstack/react-query";
import { adminKeys } from "./query-keys";

const invalidateKeys = (queryClient: QueryClient, keys: readonly (readonly unknown[])[]) =>
  Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

export const invalidateAdminCatalogs = (queryClient: QueryClient) =>
  invalidateKeys(queryClient, [adminKeys.users, adminKeys.hotels, adminKeys.currentUser]);

export const invalidateAdminBookings = (queryClient: QueryClient) =>
  invalidateKeys(queryClient, [adminKeys.bookings, adminKeys.insights, adminKeys.rollups]);

export const invalidateAdminReviews = (queryClient: QueryClient) =>
  invalidateKeys(queryClient, [adminKeys.reviews, adminKeys.insights]);

export const invalidateAdminInsights = (queryClient: QueryClient) =>
  invalidateKeys(queryClient, [adminKeys.insights, adminKeys.rollups]);
