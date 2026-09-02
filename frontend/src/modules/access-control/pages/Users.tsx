import { useAuth } from "@/modules/auth/hooks/useAuth";
import api from "@/shared/api/axios";
import { Sidebar } from "@/shared/components/Sidebar";
import { useEffect, useState } from "react";
import { FiCheck, FiShield, FiX } from "react-icons/fi";
import { toast } from "react-toastify";
import type { Role, AccessControlUser as User } from "../types";

const Users = () => {
  const { can, user, refreshMe } = useAuth();
  const userRoleList = user?.userRoles?.map((ur: any) => ur.role?.name?.toUpperCase()) || [];
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get("/api/v1/rbac/users"),
        api.get("/api/v1/rbac/roles")
      ]);

      if (usersRes.data?.data) {
        setUsers(usersRes.data.data);
        setNextCursor(usersRes.data.extra?.nextCursor ?? null);
        setHasMore(usersRes.data.extra?.hasMore ?? false);
      } else if (Array.isArray(usersRes.data)) {
        setUsers(usersRes.data);
        setNextCursor(null);
        setHasMore(false);
      }

      if (rolesRes.data?.data) {
        setAllRoles(rolesRes.data.data);
      } else if (Array.isArray(rolesRes.data)) {
        setAllRoles(rolesRes.data);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get("/api/v1/rbac/users", { params: { cursor: nextCursor } });
      if (res.data?.data) {
        setUsers(prev => [...prev, ...res.data.data]);
        setNextCursor(res.data.extra?.nextCursor ?? null);
        setHasMore(res.data.extra?.hasMore ?? false);
      }
    } catch (err) {
      console.error("Error loading more users:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    // Pre-fill checkboxes based on user's current roles by matching IDs or names
    const currentUserRoleIds = user.userRoles?.map((ur: any) => ur.role?.id || ur.roleId || ur.id).filter(Boolean) || [];
    const currentUserRoleNames = user.userRoles?.map((ur: any) => ur.role?.name || ur.name).filter(Boolean) || [];
    
    const matchedRoleIds = allRoles
      .filter((r) => currentUserRoleIds.includes(r.id) || currentUserRoleNames.includes(r.name))
      .map((r) => r.id);
      
    setSelectedRoleIds(matchedRoleIds.length > 0 ? matchedRoleIds : currentUserRoleIds);
  };

  const closeEditModal = () => {
    setSelectedUser(null);
    setSelectedRoleIds([]);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };



  const updateLocalUserState = (userId: string, newRoles: any[]) => {
    setUsers(prevUsers =>
      prevUsers.map(u =>
        u.id === userId
          ? { ...u, userRoles: newRoles.map(r => ({ role: r })) }
          : u
      )
    );
  };

  const handleSaveRoles = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const response = await api.post("/api/v1/rbac/assign-role", {
        userId: selectedUser.id,
        roleIds: selectedRoleIds
      });

      const { roles, userName, assignedBy } = response.data.data || response.data;

      // Update state instantly
      updateLocalUserState(selectedUser.id, roles);

      // Refresh current user permissions and roles globally
      await refreshMe();

      toast.success(`Roles updated for ${selectedUser.displayName || selectedUser.email || "user"}`);
      console.log(`Assigned by: ${assignedBy}`);

      closeEditModal();
    } catch (err: any) {
      console.error("Error saving roles:", err);
      toast.error(err?.response?.data?.message || "Failed to save roles.");
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadges = (roles: any) => {
    if (!roles || roles.length === 0) return <span className="text-muted-foreground italic text-xs">No roles</span>;
    return (
      <div className="flex gap-2 flex-wrap">
        {roles.map((r: any, idx: number) => {
          const roleName = r?.role?.name || r?.name || (typeof r === "string" ? r : "UNKNOWN");
          return (
            <span
              key={idx}
              className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
            >
              {roleName}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground font-inter overflow-hidden">
      <Sidebar />

      <main className="flex-1 p-4 md:p-10 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1200px] mx-auto space-y-10">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">User Management</h1>
              <div className="text-sm text-muted-foreground mt-1 font-medium">
                Manage users and their assigned roles
              </div>
            </div>
          </div>

          {/* ================= USERS TABLE ================= */}
          <div className="rounded-lg border border-border overflow-hidden bg-card shadow-md">
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Table Header */}
                <div className="grid grid-cols-[1.2fr_1.8fr_2fr_1fr] px-8 py-4 text-[10px] font-bold text-muted-foreground border-b border-border bg-muted/30 uppercase tracking-wider">
                  <div>Name</div>
                  <div>Email</div>
                  <div>Roles</div>
                  <div className="text-right">Actions</div>
                </div>

                {loading ? (
                  <div className="py-20 text-center text-muted-foreground animate-pulse">
                    Loading users...
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground">
                    No users found.
                  </div>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.id || user.email}
                      className="grid grid-cols-[1.2fr_1.8fr_2fr_1fr] px-8 py-4 border-b border-border items-center transition-colors duration-200 hover:bg-muted/30"
                    >
                      <div className="font-bold text-sm">
                        {user.displayName}
                      </div>

                      <div className="text-muted-foreground text-sm font-medium">
                        {user.email}
                      </div>

                      <div>
                        {getRoleBadges(user.userRoles)}
                      </div>

                      <div className="text-right">
                        {can('ROLE', 'canWrite') && (
                          <button
                            className="px-4 py-1.5 text-[10px] font-bold border border-border rounded-md bg-secondary hover:bg-secondary/80 transition-all uppercase tracking-wider"
                            onClick={() => openEditModal(user)}
                          >
                            Edit Roles
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center px-8 py-4 border-t border-border bg-muted/10">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 text-[10px] font-bold border border-border rounded-md bg-secondary hover:bg-secondary/80 transition-all uppercase tracking-wider disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ================= EDIT ROLES MODAL ================= */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="border border-border w-full max-w-md rounded-lg p-8 shadow-2xl relative bg-card animate-in zoom-in-95 duration-200">
            <button
              onClick={closeEditModal}
              className="absolute top-6 right-6 text-muted-foreground hover:text-foreground transition-colors"
            >
              <FiX className="text-xl" />
            </button>
            <div className="flex items-center gap-4 mb-8">
              <div className="grid place-items-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                <FiShield className="text-2xl" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Edit Roles</h2>
                <p className="text-sm text-muted-foreground font-medium">{selectedUser.displayName}</p>
              </div>
            </div>

            <div className="space-y-4 mb-8 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
              {allRoles.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 text-center">No roles available.</div>
              ) : (
                <div className="grid gap-2">
                  <label className="block text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-widest">Select Roles</label>
                  {allRoles.map((role) => {
                    const isSelected = selectedRoleIds.includes(role.id);
                    return (
                      <div
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={`flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer group ${isSelected
                          ? "border-primary/50 bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                          }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary" : "bg-muted border-border"
                            }`}>
                            {isSelected && <FiCheck className="text-primary-foreground text-xs font-bold" />}
                          </div>
                          <div>
                            <div className={`text-sm font-bold transition-colors ${isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                              {role.name}
                            </div>
                            {role.description && <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{role.description}</div>}
                          </div>
                        </div>
                        {isSelected && <div className="text-[10px] font-bold text-primary uppercase tracking-tighter bg-primary/10 px-2 py-0.5 rounded">Selected</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-border">
              <button
                className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted rounded-md transition-colors"
                onClick={closeEditModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={`px-6 py-2.5 text-sm font-bold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
                onClick={handleSaveRoles}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
