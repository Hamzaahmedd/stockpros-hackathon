import React from 'react';
import { Sidebar } from '@/shared/components/Sidebar';
import { useRBAC } from '../hooks/useRBAC';
import { FiLayout, FiActivity, FiSearch, FiRefreshCcw, FiShield, FiUsers, FiAward } from 'react-icons/fi';
import { useTheme } from '@/shared/hooks/useTheme';
import { Skeleton } from '@/shared/components/ui/skeleton';

const SystemOverview = () => {
    const { theme } = useTheme();
    let { resources, permissions, roles, users, loading, refresh } = useRBAC();

    // Filter permissions to only include CREATE and READ globally for this page
    permissions = permissions.filter(p =>
        ['CREATE', 'READ'].includes(p.action.toUpperCase())
    );

    // Group permissions by resource
    const getResourceActions = (resourceId: string) => {
        return permissions
            .filter(p => p.resourceId === resourceId)
            .map(p => p.action.toUpperCase())
            .filter(action => ['CREATE', 'READ'].includes(action));
    };

    return (
        <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground font-inter overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 md:p-10 overflow-y-auto overflow-x-hidden">
                <div className="max-w-[1200px] mx-auto space-y-10">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-3">
                                <FiActivity className="text-primary" />
                                System Overview
                            </h1>
                            <div className="text-sm text-muted-foreground mt-1 font-medium">
                                A full matrix of system resources and available actions
                            </div>
                        </div>

                        <button
                            onClick={refresh}
                            disabled={loading}
                            className={`flex items-center gap-2 px-4 py-2 border rounded-md text-sm transition-all ${theme === 'dark' ? 'bg-secondary hover:bg-secondary/80 border-border' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700 shadow-sm'}`}
                        >
                            <FiRefreshCcw className={`text-lg ${loading ? 'animate-spin' : ''}`} />
                            Sync Schema
                        </button>
                    </div>

                    {/* Statistics Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="border border-border rounded-lg p-6 flex items-center gap-4 bg-card shadow-sm">
                            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                                <FiLayout className="text-xl" />
                            </div>
                            <div className="space-y-1">
                                {loading ? <Skeleton className="h-8 w-12 rounded" /> : <div className="text-2xl font-bold">{resources.length}</div>}
                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Resources</div>
                            </div>
                        </div>

                        <div className="border border-border rounded-lg p-6 flex items-center gap-4 bg-card shadow-sm">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <FiShield className="text-xl" />
                            </div>
                            <div className="space-y-1">
                                {loading ? <Skeleton className="h-8 w-12 rounded" /> : <div className="text-2xl font-bold">{permissions.length}</div>}
                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Permissions</div>
                            </div>
                        </div>

                        <div className="border border-border rounded-lg p-6 flex items-center gap-4 bg-card shadow-sm">
                            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                                <FiAward className="text-xl" />
                            </div>
                            <div className="space-y-1">
                                {loading ? <Skeleton className="h-8 w-12 rounded" /> : <div className="text-2xl font-bold">{roles.length}</div>}
                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Roles</div>
                            </div>
                        </div>

                        <div className="border border-border rounded-lg p-6 flex items-center gap-4 bg-card shadow-sm">
                            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                                <FiUsers className="text-xl" />
                            </div>
                            <div className="space-y-1">
                                {loading ? <Skeleton className="h-8 w-12 rounded" /> : <div className="text-2xl font-bold">{users.length}</div>}
                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Users</div>
                            </div>
                        </div>
                    </div>

                    {/* Permissions Matrix */}
                    <div className="border border-border rounded-lg overflow-hidden bg-card shadow-md">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border bg-muted/30">
                                        <th className="px-8 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-[30%]">Resource Module</th>
                                        <th className="px-8 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Available Operations</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {loading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="hover:bg-muted/20">
                                                <td className="px-8 py-4 space-y-2">
                                                    <Skeleton className="h-4 w-36 rounded" />
                                                    <Skeleton className="h-3 w-48 rounded" />
                                                </td>
                                                <td className="px-8 py-4">
                                                    <div className="flex gap-2">
                                                        <Skeleton className="h-6 w-16 rounded" />
                                                        <Skeleton className="h-6 w-16 rounded" />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : resources.length === 0 ? (
                                        <tr>
                                            <td colSpan={2} className="px-8 py-20 text-center text-gray-500 italic">
                                                No resources discovered in the current environment.
                                            </td>
                                        </tr>
                                    ) : (
                                        resources.map((resource) => {
                                            const actions = getResourceActions(resource.id);
                                            return (
                                                <tr key={resource.id} className="hover:bg-muted/30 transition-colors group">
                                                    <td className="px-8 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-1 h-1 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            <div>
                                                                <div className="font-bold tracking-tight uppercase text-xs">
                                                                    {resource.name}
                                                                </div>
                                                                {resource.description && (
                                                                    <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{resource.description}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-4">
                                                        <div className="flex gap-2 flex-wrap">
                                                            {actions.map(action => (
                                                                <span
                                                                    key={action}
                                                                    className={`
                                                                        px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border
                                                                        ${action === 'READ' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'}
                                                                    `}
                                                                >
                                                                    {action}
                                                                </span>
                                                            ))}
                                                            {actions.length === 0 && (
                                                                <span className="text-[10px] text-muted-foreground font-bold uppercase italic tracking-widest opacity-40">
                                                                    No actions discovered
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SystemOverview;
