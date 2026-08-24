import api from '@/shared/api/axios';
import type { Permission, Resource } from './types';

export type { Permission, Resource } from './types';

export const rbacService = {
    getResources: async (): Promise<Resource[]> => {
        const response = await api.get('/api/v1/rbac/resources');
        return response.data.data || response.data;
    },

    getPermissions: async (): Promise<Permission[]> => {
        const response = await api.get('/api/v1/rbac/permissions');
        return response.data.data || response.data;
    },

    getRoles: async () => {
        const response = await api.get('/api/v1/rbac/roles');
        return response.data.data || response.data;
    },

    getUsers: async () => {
        const response = await api.get('/api/v1/rbac/users');
        return response.data.data || response.data;
    }
};
