import { useAuth } from "@/modules/auth/hooks/useAuth";
import api from "@/shared/api/axios";
import { Sidebar } from "@/shared/components/Sidebar";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { useTheme } from "@/shared/hooks/useTheme";
import { SECONDARY_ACTION_BTN } from "@/shared/utils/buttonStyles";
import { useEffect, useState } from "react";
import { FiPlus, FiShield, FiX } from "react-icons/fi";
import { toast } from "react-toastify";
import type { Resource, Role, RolePermission } from "../types";

const Roles = () => {
    const { theme } = useTheme();
    const { can } = useAuth();
    const [roles, setRoles] = useState<Role[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals state
    const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);

    // Add Role state
    const [newRoleName, setNewRoleName] = useState("");
    const [newRoleDesc, setNewRoleDesc] = useState("");
    const [addingRole, setAddingRole] = useState(false);

    // Edit Permissions state
    const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({}); // resourceName -> array of actions
    const [allSystemPermissions, setAllSystemPermissions] = useState<any[]>([]);
    const [savingPermissions, setSavingPermissions] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [rolesRes, resourcesRes, permsRes] = await Promise.all([
                api.get("/api/v1/rbac/roles"),
                api.get("/api/v1/rbac/resources"),
                api.get("/api/v1/rbac/permissions")
            ]);

            if (rolesRes.data?.success || rolesRes.data?.data) {
                setRoles(rolesRes.data.data || rolesRes.data);
            } else if (Array.isArray(rolesRes.data)) {
                setRoles(rolesRes.data);
            }

            if (resourcesRes.data?.success || resourcesRes.data?.data) {
                setResources(resourcesRes.data.data || resourcesRes.data);
            } else if (Array.isArray(resourcesRes.data)) {
                setResources(resourcesRes.data);
            }

            if (permsRes.data?.success || permsRes.data?.data) {
                const fetchedPerms = permsRes.data.data || permsRes.data;
                setAllSystemPermissions(Array.isArray(fetchedPerms) ? fetchedPerms : []);
            } else if (Array.isArray(permsRes.data)) {
                setAllSystemPermissions(permsRes.data);
            }
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ====== ADD ROLE ======
    const handleAddRole = async () => {
        setAddingRole(true);
        try {
            const response = await api.post("/api/v1/rbac/add-role", {
                name: newRoleName.toUpperCase(), // Must be ALL_CAPS_SNAKE_CASE
                description: newRoleDesc
            });

            const newRole = response.data.data || response.data;

            // Update state instantly so it appears in the table
            setRoles(prev => [...prev, newRole]);

            setIsAddRoleModalOpen(false);
            setNewRoleName("");
            setNewRoleDesc("");
            toast.success(`Role "${newRole.name}" created successfully!`);
        } catch (error: any) {
            console.error("Failed to add role", error);
            toast.error(error?.response?.data?.message || "Failed to create role.");
        } finally {
            setAddingRole(false);
        }
    };

    // ====== EDIT PERMISSIONS ======
    const openPermissionsModal = async (role: Role) => {
        setSelectedRole(role);
        setRolePermissions({});

        try {
            // Fetch all permissions to build the matrix AND current assignments
            const permsRes = await api.get("/api/v1/rbac/permissions");
            let allPerms = permsRes.data?.data || permsRes.data;

            // Update all system permissions in case they changed
            setAllSystemPermissions(allPerms);

            // Parse assignments into the local state
            const currentRolePerms: Record<string, string[]> = {};
            
            if (role.rolePermissions && Array.isArray(role.rolePermissions)) {
                role.rolePermissions.forEach((rp: any) => {
                    if (rp.permission?.resource?.name && rp.permission?.action) {
                        const resName = rp.permission.resource.name;
                        if (!currentRolePerms[resName]) currentRolePerms[resName] = [];
                        if (!currentRolePerms[resName].includes(rp.permission.action)) {
                            currentRolePerms[resName].push(rp.permission.action);
                        }
                    }
                });
            } else if (Array.isArray(allPerms)) { // Fallback, just in case
                allPerms.forEach((p: any) => {
                    // Check if this permission is assigned to the current role
                    // Note: p.roleId would be present if the API joined with role_permissions
                    if (p.roleId === role.id && p.resource?.name && p.action) {
                        const resName = p.resource.name;
                        if (!currentRolePerms[resName]) currentRolePerms[resName] = [];
                        if (!currentRolePerms[resName].includes(p.action)) {
                            currentRolePerms[resName].push(p.action);
                        }
                    }
                });
            }
            setRolePermissions(currentRolePerms);
        } catch (err) {
            console.error("Error fetching permissions mapping", err);
        }
    };

    const closePermissionsModal = () => {
        setSelectedRole(null);
        setRolePermissions({});
    };

    const togglePermissionAction = (resourceName: string, action: string) => {
        setRolePermissions(prev => {
            const currentActions = prev[resourceName] || [];
            const isChecked = currentActions.includes(action);
            let newActions = [...currentActions];

            if (isChecked) {
                // Unchecking
                newActions = newActions.filter(a => a !== action);

            } else {
                // Checking
                newActions.push(action);

            }

            return {
                ...prev,
                [resourceName]: newActions
            };
        });
    };

    const handleSavePermissions = async () => {
        if (!selectedRole) return;
        setSavingPermissions(true);

        // Format into what API expects
        const permissionsPayload: RolePermission[] = Object.keys(rolePermissions)
            .filter(resName => rolePermissions[resName].length > 0)
            .map(resName => ({
                resourceName: resName,
                actions: rolePermissions[resName]
            }));

        if (permissionsPayload.length === 0) {
            toast.warning("Please select at least one permission or use revoke role endpoint instead.");
            setSavingPermissions(false);
            return;
        }

        try {
            await api.post("/api/v1/rbac/assign-permissions", {
                roleId: selectedRole.id,
                permissions: permissionsPayload
            });
            fetchData();
            closePermissionsModal();
            toast.success("Permissions updated successfully!");
        } catch (err: any) {
            console.error("Error saving permissions:", err);
            toast.error(err?.response?.data?.message || "Failed to assign permissions.");
        } finally {
            setSavingPermissions(false);
        }
    };

    return (
        <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground font-inter overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 md:p-10 overflow-y-auto overflow-x-hidden">
                <div className="max-w-[1200px] mx-auto space-y-10">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">Role Management</h1>
                            <div className="text-sm text-muted-foreground mt-1 font-medium">
                                Manage roles and their resource permissions
                            </div>
                        </div>

                        {can('ROLE', 'canCreate') && (
                            <Button
                                onClick={() => setIsAddRoleModalOpen(true)}
                                className="flex items-center gap-2 font-bold uppercase tracking-wider text-[10px]"
                            >
                                <FiPlus className="text-sm" />
                                Add Role
                            </Button>
                        )}
                    </div>

                    {/* ================= ROLES TABLE ================= */}
                    <Card className="border border-border rounded-lg overflow-hidden bg-card shadow-md">
                        <div className="overflow-x-auto">
                            <div className="min-w-[800px]">
                                {/* Table Header */}
                                <div className="grid grid-cols-[1.5fr_2.5fr_1fr_1fr] px-8 py-4 text-[10px] font-bold text-muted-foreground border-b border-border bg-muted/30 uppercase tracking-wider">
                                    <div>Name</div>
                                    <div>Description</div>
                                    <div>Created Date</div>
                                    <div className="text-right">Actions</div>
                                </div>

                                {loading ? (
                                    <div className="py-20 text-center text-muted-foreground animate-pulse">
                                        Loading roles...
                                    </div>
                                ) : roles.length === 0 ? (
                                    <div className="py-20 text-center text-muted-foreground">
                                        No roles found.
                                    </div>
                                ) : (
                                    roles.map((role) => (
                                        <div
                                            key={role.id}
                                            className="grid grid-cols-[1.5fr_2.5fr_1fr_1fr] px-8 py-4 border-b border-border items-center transition-colors duration-200 hover:bg-muted/30"
                                        >
                                            {/* Name */}
                                            <div className="font-bold text-primary flex items-center gap-2 text-sm">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                {role.name}
                                            </div>

                                            {/* Description */}
                                            <div className="text-muted-foreground text-xs font-medium truncate pr-4">
                                                {role.description || "No description provided."}
                                            </div>

                                            {/* Created Date */}
                                            <div className="text-muted-foreground text-[11px] font-medium">
                                                {role.createdAt ? new Date(role.createdAt).toLocaleDateString(undefined, {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric"
                                                }) : "N/A"}
                                            </div>

                                            {/* Actions */}
                                            <div className="text-right flex justify-end gap-2">
                                                {can('ROLE', 'canUpdate') && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className={`text-[10px] font-bold uppercase tracking-wider ${SECONDARY_ACTION_BTN}`}
                                                        onClick={() => openPermissionsModal(role)}
                                                    >
                                                        Permissions
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </Card>
                </div>
            </main>

            {/* ================= ADD ROLE MODAL ================= */}
            {isAddRoleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="border border-border w-full max-w-md rounded-lg p-8 shadow-2xl relative bg-card animate-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setIsAddRoleModalOpen(false)}
                            className="absolute top-6 right-6 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <FiX className="text-xl" />
                        </button>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="grid place-items-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                                <FiPlus className="text-2xl" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">Add New Role</h2>
                                <p className="text-sm text-muted-foreground font-medium">Create a role to assign to users</p>
                            </div>
                        </div>

                        <div className="space-y-4 mb-8">
                            <div>
                                <label className="block text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-widest">Role Name</label>
                                <input
                                    type="text"
                                    value={newRoleName}
                                    onChange={e => setNewRoleName(e.target.value)}
                                    placeholder="e.g. PORTFOLIO_MANAGER"
                                    className="w-full bg-muted border border-border rounded-md px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all uppercase text-sm font-bold"
                                />
                                <p className="text-[10px] text-muted-foreground mt-2 font-medium italic">Format: ALL_CAPS_SNAKE_CASE</p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-widest">Description</label>
                                <textarea
                                    value={newRoleDesc}
                                    onChange={e => setNewRoleDesc(e.target.value)}
                                    placeholder="Role description..."
                                    rows={3}
                                    className="w-full bg-muted border border-border rounded-md px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all resize-none text-sm font-medium"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end pt-4 border-t border-border">
                            <button
                                className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted rounded-md transition-colors"
                                onClick={() => setIsAddRoleModalOpen(false)}
                                disabled={addingRole}
                            >
                                Cancel
                            </button>
                            <button
                                className={`px-6 py-2.5 text-sm font-bold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors ${addingRole || !newRoleName ? "opacity-50 cursor-not-allowed" : ""}`}
                                onClick={handleAddRole}
                                disabled={addingRole || !newRoleName}
                            >
                                {addingRole ? "Adding..." : "Add Role"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= EDIT PERMISSIONS MODAL ================= */}
            {selectedRole && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="border border-border w-full max-w-2xl rounded-lg p-8 shadow-2xl relative flex flex-col max-h-[90vh] bg-card animate-in zoom-in-95 duration-200">
                        <button
                            onClick={closePermissionsModal}
                            className="absolute top-6 right-6 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <FiX className="text-xl" />
                        </button>
                        <div className="flex items-center gap-4 mb-8 shrink-0">
                            <div className="grid place-items-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                                <FiShield className="text-2xl" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">Edit Permissions</h2>
                                <p className="text-sm text-muted-foreground font-medium">Assign specific resource actions to <strong className="text-primary">{selectedRole.name}</strong></p>
                            </div>
                        </div>

                        <div className="space-y-4 mb-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                            {resources.length === 0 ? (
                                <div className="text-sm text-gray-500 p-4 text-center bg-[#111111] rounded-2xl">
                                    No resources found in the system schema.
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {/* Matrix Header Labels */}
                                    <div className="grid grid-cols-[1fr_auto] px-5 py-2">
                                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Resource Module</div>
                                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2">Available Operations</div>
                                    </div>

                                    {resources.map((resource) => {
                                        const availableActions = allSystemPermissions
                                            .filter(p => p.resourceId === resource.id || p.resource?.name === resource.name)
                                            .map(p => p.action);

                                        return (
                                            <div key={resource.id} className="border border-border rounded-lg p-5 flex items-center justify-between group transition-all duration-300 bg-muted/20 hover:border-primary/30">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary/10 transition-colors">
                                                        <FiShield className="text-sm" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest">{resource.name}</h3>
                                                        {resource.description && <p className="text-[10px] text-muted-foreground font-medium line-clamp-1 italic">{resource.description}</p>}
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 flex-wrap justify-end max-w-[320px]">
                                                    {availableActions.length === 0 ? (
                                                        <span className="text-[10px] text-gray-600 font-bold uppercase italic tracking-widest">
                                                            No actions defined
                                                        </span>
                                                    ) : (
                                                        availableActions.map(action => {
                                                            const isChecked = (rolePermissions[resource.name] || []).includes(action);
                                                            return (
                                                                <button
                                                                    key={action}
                                                                    onClick={() => togglePermissionAction(resource.name, action)}
                                                                    className={`px-3 py-1.5 rounded-md border flex items-center gap-2 transition-all ${isChecked
                                                                        ? "bg-primary/10 border-primary/50 text-primary shadow-sm"
                                                                        : "bg-background border-border text-muted-foreground hover:border-border/80"
                                                                        }`}
                                                                    title={action.toUpperCase()}
                                                                >
                                                                    <div className={`w-1 h-1 rounded-full ${isChecked ? "bg-primary" : "bg-muted"}`} />
                                                                    <span className="text-[10px] font-bold uppercase tracking-tight">{action}</span>
                                                                </button>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 justify-end pt-5 border-t border-border shrink-0">
                            <button
                                className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted rounded-md transition-colors"
                                onClick={closePermissionsModal}
                                disabled={savingPermissions}
                            >
                                Cancel
                            </button>
                            <button
                                className={`px-6 py-2.5 text-sm font-bold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors ${savingPermissions ? "opacity-50 cursor-not-allowed" : ""}`}
                                onClick={handleSavePermissions}
                                disabled={savingPermissions}
                            >
                                {savingPermissions ? "Saving..." : "Save Matrix"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Roles;
