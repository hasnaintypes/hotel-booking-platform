import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import type { AdminUserListItem, CursorPage } from "@hotel-booking/contracts";
import {
  DataTable,
  LoadMore,
  Select,
  SelectContent,
  SelectItem,
  SelectOptionLabel,
  SelectTrigger,
  SelectValue,
} from "@hotel-booking/ui";
import type { LucideIcon } from "lucide-react";
import { Shield, User } from "lucide-react";
import { toast } from "sonner";
import { apiErrorMessage } from "@hotel-booking/api-client";
import { adminKeys } from "@/shared/lib/query-keys";
import { invalidateAdminCatalogs } from "@/shared/lib/query-invalidation";
import { flattenPages, mapInfiniteRows, nextCursorPageParam } from "@/shared/lib/infinite-pages";
import { fetchUsers, updateUserRole, type AdminRole } from "../api";

const ROLES: AdminRole[] = ["user", "admin"];

const ROLE_ICONS: Record<AdminRole, LucideIcon> = {
  user: User,
  admin: Shield,
};

type UsersCache = InfiniteData<CursorPage<AdminUserListItem>>;

const UsersPage = () => {
  const queryClient = useQueryClient();
  const usersQuery = useInfiniteQuery({
    queryKey: adminKeys.users,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchUsers({ limit: 100, cursor: pageParam }),
    getNextPageParam: nextCursorPageParam,
  });
  const users = flattenPages(usersQuery.data);

  const mutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AdminRole }) =>
      updateUserRole(userId, role),
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.users });
      const previous = queryClient.getQueryData<UsersCache>(adminKeys.users);

      queryClient.setQueryData<UsersCache>(adminKeys.users, (data) =>
        mapInfiniteRows(data, (user) => (user._id === userId ? { ...user, role } : user)),
      );

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(adminKeys.users, context.previous);
      }
      toast.error("Failed to update role", {
        description: apiErrorMessage(error, "Please try again in a moment."),
      });
    },
    onSuccess: () => {
      toast.success("Role updated");
    },
    onSettled: async () => {
      await invalidateAdminCatalogs(queryClient);
    },
  });

  const columns = useMemo<LegacyColumnDef<AdminUserListItem, unknown>[]>(
    () => [
      {
        accessorKey: "firstName",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.firstName} {row.original.lastName}
          </span>
        ),
      },
      { accessorKey: "email", header: "Email" },
      {
        id: "role",
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => {
          const user = row.original;
          return (
            <Select
              value={user.role || "user"}
              disabled={mutation.isPending}
              onValueChange={(role) =>
                mutation.mutate({
                  userId: user._id,
                  role: role as AdminRole,
                })
              }
            >
              <SelectTrigger className="h-8 w-[140px]" aria-label={`Role for ${user.email}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    <SelectOptionLabel icon={ROLE_ICONS[role]}>{role}</SelectOptionLabel>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: "totalBookings",
        header: "Bookings",
        cell: ({ row }) => row.original.totalBookings ?? 0,
      },
      {
        id: "active",
        accessorFn: (user) => (user.isActive === false ? "No" : "Yes"),
        header: "Active",
      },
    ],
    [mutation],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium text-gray-700 md:text-2xl">Users</h1>
        <p className="text-sm text-gray-500">Registered accounts</p>
      </div>

      {usersQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : usersQuery.isError ? (
        <p className="text-sm text-red-600">Could not load users.</p>
      ) : (
        <>
          <DataTable columns={columns} data={users} searchPlaceholder="Search users…" />
          <LoadMore
            hasMore={usersQuery.hasNextPage}
            isFetching={usersQuery.isFetchingNextPage}
            onClick={() => void usersQuery.fetchNextPage()}
          />
        </>
      )}
    </div>
  );
};

export default UsersPage;
