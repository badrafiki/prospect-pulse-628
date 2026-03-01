import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  display_name: string | null;
  role: "admin" | "user";
  companies_count: number;
  emails_count: number;
  people_count: number;
}

export interface AdminStats {
  total_users: number;
  total_companies: number;
  total_emails: number;
  total_people: number;
}

export function useAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: isAdmin, isLoading: isAdminLoading } = useQuery({
    queryKey: ["admin-check", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("user_roles" as any)
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();
      return !!data;
    },
    enabled: !!user,
  });

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-get-users");
      if (error) throw error;
      return data as { users: AdminUser[]; stats: AdminStats };
    },
    enabled: !!isAdmin,
  });

  const setRoleMutation = useMutation({
    mutationFn: async ({ targetUserId, role }: { targetUserId: string; role: "admin" | "user" }) => {
      const { data, error } = await supabase.functions.invoke("admin-set-role", {
        body: { target_user_id: targetUserId, role },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { target_user_id: targetUserId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const toggleBanMutation = useMutation({
    mutationFn: async ({ targetUserId, ban }: { targetUserId: string; ban: boolean }) => {
      const { data, error } = await supabase.functions.invoke("admin-toggle-ban", {
        body: { target_user_id: targetUserId, ban },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  return {
    isAdmin: !!isAdmin,
    isAdminLoading,
    users: usersData?.users ?? [],
    stats: usersData?.stats ?? null,
    usersLoading,
    refetchUsers,
    setRole: setRoleMutation.mutateAsync,
    deleteUser: deleteUserMutation.mutateAsync,
    toggleBan: toggleBanMutation.mutateAsync,
    isSettingRole: setRoleMutation.isPending,
    isDeletingUser: deleteUserMutation.isPending,
    isTogglingBan: toggleBanMutation.isPending,
  };
}
