import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import useAppContext from "./useAppContext";

type LoadingQueryOptions<TData, TError> = Omit<
  UseQueryOptions<TData, TError>,
  "queryKey" | "queryFn"
> & {
  loadingMessage?: string;
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
  onSettled?: (data: TData | undefined, error: TError | null) => void;
};

// Custom hook for queries with global loading
export const useQueryWithLoading = <TData, TError = Error>(
  queryKey: QueryKey | string,
  queryFn: () => Promise<TData>,
  options?: LoadingQueryOptions<TData, TError>,
) => {
  const { hideGlobalLoading } = useAppContext();
  const {
    loadingMessage: _loadingMessage,
    onSuccess,
    onError,
    onSettled,
    ...queryOptions
  } = options ?? {};

  const normalizedKey: QueryKey = Array.isArray(queryKey) ? queryKey : [queryKey];
  const query = useQuery<TData, TError>({ queryKey: normalizedKey, queryFn, ...queryOptions });
  const { status, data, error } = query;

  useEffect(() => {
    if (status === "success") {
      hideGlobalLoading();
      onSuccess?.(data);
      onSettled?.(data, null);
    } else if (status === "error") {
      hideGlobalLoading();
      onError?.(error);
      onSettled?.(undefined, error);
    }
  }, [status, data, error]);

  return query;
};

// Custom hook for mutations with global loading
export const useMutationWithLoading = <TData, TError, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Omit<
    UseMutationOptions<TData, TError, TVariables, unknown>,
    "mutationFn"
  > & { loadingMessage?: string },
) => {
  const { showGlobalLoading, hideGlobalLoading } = useAppContext();
  const {
    loadingMessage,
    onMutate,
    onSuccess,
    onError,
    onSettled,
    ...mutationOptions
  } = options ?? {};

  return useMutation<TData, TError, TVariables, unknown>({
    mutationFn,
    ...mutationOptions,
    onMutate: async (variables, context) => {
      if (loadingMessage) {
        showGlobalLoading(loadingMessage);
      } else {
        showGlobalLoading();
      }
      return onMutate?.(variables, context);
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      hideGlobalLoading();
      onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      hideGlobalLoading();
      onError?.(error, variables, onMutateResult, context);
    },
    onSettled: (data, error, variables, onMutateResult, context) => {
      hideGlobalLoading();
      onSettled?.(data, error, variables, onMutateResult, context);
    },
  });
};
