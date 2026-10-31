import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import type { UserType } from "@hotel-booking/types";
import {
  DataTable,
  Select,
  SelectContent,
  SelectItem,
  SelectOptionLabel,
  SelectTrigger,
  SelectValue,
} from "@hotel-booking/ui";
import type { LucideIcon } from "lucide-react";
import { Crown, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/shared/lib/api-error";
import { adminKeys } from "@/shared/lib/query-keys";
import { invalidateAdminCatalogs } from "@/shared/lib/query-invalidation";
import { fetchUsers, updateUserRole, type AdminRole } from "../api";

const ROLES: AdminRole[] = ["user", "admin", "hotel_owner"];

const ROLE_ICONS: Record<AdminRole, LucideIcon> = {
  user: User,
  admin: Shield,
  hotel_owner: Crown,
};

const UsersPage = () => {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: adminKeys.users,
    queryFn: fetchUsers,
  });

  const mutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AdminRole }) =>
      updateUserRole(userId, role),
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.users });
      const previous = queryClient.getQueryData<UserType[]>(adminKeys.users);

      queryClient.setQueryData<UserType[]>(adminKeys.users, (users) =>
        users?.map((user) => (user._id === userId ? { ...user, role } : user)),
      );

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(adminKeys.users, context.previous);
      }
      toast.error("Failed to update role", {
        description: getErrorMessage(error, "Please try again in a moment."),
      });
    },
    onSuccess: () => {
      toast.success("Role updated");
    },
    onSettled: async () => {
      await invalidateAdminCatalogs(queryClient);
    },
  });

  const columns = useMemo<LegacyColumnDef<UserType, unknown>[]>(
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
        <DataTable
          columns={columns}
          data={usersQuery.data || []}
          searchPlaceholder="Search users…"
        />
      )}
    </div>
  );
};

export default UsersPage;
