import { useState, useEffect } from 'react';
import { rbacService } from '../services';
import type { AccessControlUser, Permission, Resource, Role } from '../types';
import { getApiErrorMessage } from '@/shared/utils/apiError';
import { toast } from 'react-toastify';

export const useRBAC = () => {
    const [resources, setResources] = useState<Resource[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [users, setUsers] = useState<AccessControlUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRBACData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [resData, permData, roleData, userData] = await Promise.all([
                rbacService.getResources(),
                rbacService.getPermissions(),
                rbacService.getRoles(),
                rbacService.getUsers()
            ]);
            setResources(resData);
            setPermissions(permData);
            setRoles(roleData);
            setUsers(userData);
        } catch (err) {
            const msg = getApiErrorMessage(err, 'Failed to fetch RBAC data');
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRBACData();
    }, []);

    return {
        resources,
        permissions,
        roles,
        users,
        loading,
        error,
        refresh: fetchRBACData
    };
};
