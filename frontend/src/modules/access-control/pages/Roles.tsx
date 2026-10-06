import { useAuth } from '@/modules/auth/hooks/useAuth'
import api from '@/shared/api/axios'
import { Sidebar } from '@/shared/components/Sidebar'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { useTheme } from '@/shared/hooks/useTheme'
import { SECONDARY_ACTION_BTN } from '@/shared/utils/buttonStyles'
import { useEffect, useState } from 'react'
import { FiPlus, FiShield, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import type { Resource, Role, RolePermission } from '../types'

const ACTION_DESCRIPTIONS: Record<string, Record<string, string>> = {
  core_app: {
    read: 'View the main app: Dashboard, Markets, Forecast, News, Watchlist, and Settings.',
    write:
      'Make changes within the main app, e.g. adding to a watchlist or updating settings.',
  },
  portfolio: {
    read: 'View portfolio holdings and the Portfolio Health analysis/reports.',
    write:
      'Upload portfolios and generate new Portfolio Health analysis/reports.',
  },
  access_control: {
    read: 'View the Users and Roles admin screens.',
  },
  role: {
    read: 'View existing roles and which permissions are assigned to each.',
    write: 'Create roles and edit which permissions a role has.',
    delete: 'Remove a role from the system.',
  },
}

const formatCreatedAt = (isoDate: string) => {
  const date = new Date(isoDate)
  const datePart = date.toLocaleDateString('en-US', { dateStyle: 'medium' })
  const timePart = date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
  return `${datePart} ${timePart}`
}

const Roles = () => {
  const { theme } = useTheme()
  const { can } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)

  // Modals state
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)

  // Add Role state
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')
  const [addingRole, setAddingRole] = useState(false)

  // Edit Permissions state
  const [rolePermissions, setRolePermissions] = useState<
    Record<string, string[]>
  >({}) // resourceName -> array of actions
  const [allSystemPermissions, setAllSystemPermissions] = useState<any[]>([])
  const [savingPermissions, setSavingPermissions] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [rolesRes, resourcesRes, permsRes] = await Promise.all([
        api.get('/api/v1/rbac/roles'),
        api.get('/api/v1/rbac/resources'),
        api.get('/api/v1/rbac/permissions'),
      ])

      if (rolesRes.data?.success || rolesRes.data?.data) {
        setRoles(rolesRes.data.data || rolesRes.data)
      } else if (Array.isArray(rolesRes.data)) {
        setRoles(rolesRes.data)
      }

      if (resourcesRes.data?.success || resourcesRes.data?.data) {
        setResources(resourcesRes.data.data || resourcesRes.data)
      } else if (Array.isArray(resourcesRes.data)) {
        setResources(resourcesRes.data)
      }

      if (permsRes.data?.success || permsRes.data?.data) {
        const fetchedPerms = permsRes.data.data || permsRes.data
        setAllSystemPermissions(Array.isArray(fetchedPerms) ? fetchedPerms : [])
      } else if (Array.isArray(permsRes.data)) {
        setAllSystemPermissions(permsRes.data)
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // ====== ADD ROLE ======
  const handleAddRole = async () => {
    setAddingRole(true)
    try {
      const response = await api.post('/api/v1/rbac/add-role', {
        name: newRoleName.toUpperCase(), // Must be ALL_CAPS_SNAKE_CASE
        description: newRoleDesc,
      })

      const newRole = response.data.data || response.data

      // Update state instantly so it appears in the table
      setRoles((prev) => [...prev, newRole])

      setIsAddRoleModalOpen(false)
      setNewRoleName('')
      setNewRoleDesc('')
      toast.success(`Role "${newRole.name}" created successfully!`)
    } catch (error: any) {
      console.error('Failed to add role', error)
      toast.error(error?.response?.data?.message || 'Failed to create role.')
    } finally {
      setAddingRole(false)
    }
  }

  // ====== EDIT PERMISSIONS ======
  const openPermissionsModal = async (role: Role) => {
    setSelectedRole(role)
    setRolePermissions({})

    try {
      // Fetch all permissions to build the matrix AND current assignments
      const permsRes = await api.get('/api/v1/rbac/permissions')
      const allPerms = permsRes.data?.data || permsRes.data

      // Update all system permissions in case they changed
      setAllSystemPermissions(allPerms)

      // Parse assignments into the local state
      const currentRolePerms: Record<string, string[]> = {}

      if (role.rolePermissions && Array.isArray(role.rolePermissions)) {
        role.rolePermissions.forEach((rp: any) => {
          if (rp.permission?.resource?.name && rp.permission?.action) {
            const resName = rp.permission.resource.name
            if (!currentRolePerms[resName]) currentRolePerms[resName] = []
            if (!currentRolePerms[resName].includes(rp.permission.action)) {
              currentRolePerms[resName].push(rp.permission.action)
            }
          }
        })
      } else if (Array.isArray(allPerms)) {
        // Fallback, just in case
        allPerms.forEach((p: any) => {
          // Check if this permission is assigned to the current role
          // Note: p.roleId would be present if the API joined with role_permissions
          if (p.roleId === role.id && p.resource?.name && p.action) {
            const resName = p.resource.name
            if (!currentRolePerms[resName]) currentRolePerms[resName] = []
            if (!currentRolePerms[resName].includes(p.action)) {
              currentRolePerms[resName].push(p.action)
            }
          }
        })
      }
      setRolePermissions(currentRolePerms)
    } catch (err) {
      console.error('Error fetching permissions mapping', err)
    }
  }

  const closePermissionsModal = () => {
    setSelectedRole(null)
    setRolePermissions({})
  }

  const togglePermissionAction = (resourceName: string, action: string) => {
    setRolePermissions((prev) => {
      const currentActions = prev[resourceName] || []
      const isChecked = currentActions.includes(action)
      let newActions = [...currentActions]

      if (isChecked) {
        // Unchecking
        newActions = newActions.filter((a) => a !== action)
      } else {
        // Checking
        newActions.push(action)
      }

      return {
        ...prev,
        [resourceName]: newActions,
      }
    })
  }

  const handleSavePermissions = async () => {
    if (!selectedRole) return
    setSavingPermissions(true)

    // Format into what API expects
    const permissionsPayload: RolePermission[] = Object.keys(rolePermissions)
      .filter((resName) => rolePermissions[resName].length > 0)
      .map((resName) => ({
        resourceName: resName,
        actions: rolePermissions[resName],
      }))

    if (permissionsPayload.length === 0) {
      toast.warning(
        'Please select at least one permission or use revoke role endpoint instead.',
      )
      setSavingPermissions(false)
      return
    }

    try {
      await api.post('/api/v1/rbac/assign-permissions', {
        roleId: selectedRole.id,
        permissions: permissionsPayload,
      })
      fetchData()
      closePermissionsModal()
      toast.success('Permissions updated successfully!')
    } catch (err: any) {
      console.error('Error saving permissions:', err)
      toast.error(
        err?.response?.data?.message || 'Failed to assign permissions.',
      )
    } finally {
      setSavingPermissions(false)
    }
  }

  return (
    <div className='font-inter flex h-screen flex-col overflow-hidden bg-background text-foreground lg:flex-row'>
      <Sidebar />

      <main
        id='main-content'
        className='flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-10'
      >
        <div className='mx-auto max-w-[1200px] space-y-10'>
          {/* Header */}
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
                Role Management
              </h1>
              <div className='mt-1 text-sm font-medium text-muted-foreground'>
                Manage roles and their resource permissions
              </div>
            </div>

            {can('ROLE', 'canWrite') && (
              <Button
                onClick={() => setIsAddRoleModalOpen(true)}
                className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider'
              >
                <FiPlus className='text-sm' />
                Add Role
              </Button>
            )}
          </div>

          {/* ================= ROLES TABLE ================= */}
          <Card className='overflow-hidden rounded-lg border border-border bg-card shadow-md'>
            <div className='overflow-x-auto'>
              <div className='min-w-[800px]'>
                {/* Table Header */}
                <div className='grid grid-cols-[1.5fr_2.5fr_1fr_1fr] border-b border-border bg-muted/30 px-8 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                  <div>Name</div>
                  <div>Description</div>
                  <div>Created Date</div>
                  <div className='text-right'>Actions</div>
                </div>

                {loading ? (
                  <div className='animate-pulse py-20 text-center text-muted-foreground'>
                    Loading roles...
                  </div>
                ) : roles.length === 0 ? (
                  <div className='py-20 text-center text-muted-foreground'>
                    No roles found.
                  </div>
                ) : (
                  roles.map((role) => (
                    <div
                      key={role.id}
                      className='grid grid-cols-[1.5fr_2.5fr_1fr_1fr] items-center border-b border-border px-8 py-4 transition-colors duration-200 hover:bg-muted/30'
                    >
                      {/* Name */}
                      <div className='flex items-center gap-2 text-sm font-bold text-primary'>
                        <div className='h-1.5 w-1.5 rounded-full bg-primary' />
                        {role.name}
                      </div>

                      {/* Description */}
                      <div className='truncate pr-4 text-xs font-medium text-muted-foreground'>
                        {role.description || 'No description provided.'}
                      </div>

                      {/* Created Date */}
                      <div className='text-[11px] font-medium text-muted-foreground'>
                        {role.createdAt
                          ? formatCreatedAt(role.createdAt)
                          : 'N/A'}
                      </div>

                      {/* Actions */}
                      <div className='flex justify-end gap-2 text-right'>
                        {can('ROLE', 'canWrite') && (
                          <Button
                            variant='secondary'
                            size='sm'
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
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm'>
          <div className='relative w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-2xl duration-200 animate-in zoom-in-95'>
            <button
              onClick={() => setIsAddRoleModalOpen(false)}
              className='absolute right-6 top-6 text-muted-foreground transition-colors hover:text-foreground'
            >
              <FiX className='text-xl' />
            </button>
            <div className='mb-8 flex items-center gap-4'>
              <div className='grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary'>
                <FiPlus className='text-2xl' />
              </div>
              <div>
                <h2 className='text-xl font-bold'>Add New Role</h2>
                <p className='text-sm font-medium text-muted-foreground'>
                  Create a role to assign to users
                </p>
              </div>
            </div>

            <div className='mb-8 space-y-4'>
              <div>
                <label className='mb-2 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>
                  Role Name
                </label>
                <input
                  type='text'
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder='e.g. PORTFOLIO_MANAGER'
                  className='w-full rounded-md border border-border bg-muted px-4 py-3 text-sm font-bold uppercase text-foreground placeholder-muted-foreground transition-all focus:outline-none focus:ring-1 focus:ring-primary/50'
                />
                <p className='mt-2 text-[10px] font-medium italic text-muted-foreground'>
                  Format: ALL_CAPS_SNAKE_CASE
                </p>
              </div>
              <div>
                <label className='mb-2 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>
                  Description
                </label>
                <textarea
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder='Role description...'
                  rows={3}
                  className='w-full resize-none rounded-md border border-border bg-muted px-4 py-3 text-sm font-medium text-foreground placeholder-muted-foreground transition-all focus:outline-none focus:ring-1 focus:ring-primary/50'
                />
              </div>
            </div>

            <div className='flex justify-end gap-3 border-t border-border pt-4'>
              <button
                className='rounded-md px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted'
                onClick={() => setIsAddRoleModalOpen(false)}
                disabled={addingRole}
              >
                Cancel
              </button>
              <button
                className={`rounded-md bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 ${addingRole || !newRoleName ? 'cursor-not-allowed opacity-50' : ''}`}
                onClick={handleAddRole}
                disabled={addingRole || !newRoleName}
              >
                {addingRole ? 'Adding...' : 'Add Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT PERMISSIONS MODAL ================= */}
      {selectedRole && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm'>
          <div className='relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card p-8 shadow-2xl duration-200 animate-in zoom-in-95'>
            <button
              onClick={closePermissionsModal}
              className='absolute right-6 top-6 text-muted-foreground transition-colors hover:text-foreground'
            >
              <FiX className='text-xl' />
            </button>
            <div className='mb-8 flex shrink-0 items-center gap-4'>
              <div className='grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary'>
                <FiShield className='text-2xl' />
              </div>
              <div>
                <h2 className='text-xl font-bold'>Edit Permissions</h2>
                <p className='text-sm font-medium text-muted-foreground'>
                  Assign specific resource actions to{' '}
                  <strong className='text-primary'>{selectedRole.name}</strong>
                </p>
              </div>
            </div>

            <div className='custom-scrollbar mb-4 flex-1 space-y-4 overflow-y-auto pr-2'>
              {resources.length === 0 ? (
                <div className='rounded-2xl bg-[#111111] p-4 text-center text-sm text-gray-500'>
                  No resources found in the system schema.
                </div>
              ) : (
                <div className='grid gap-4'>
                  {/* Matrix Header Labels */}
                  <div className='grid grid-cols-[1fr_auto] px-5 py-2'>
                    <div className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>
                      Resource Module
                    </div>
                    <div className='px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>
                      Available Operations
                    </div>
                  </div>

                  {resources.map((resource) => {
                    const availableActions = allSystemPermissions
                      .filter(
                        (p) =>
                          p.resourceId === resource.id ||
                          p.resource?.name === resource.name,
                      )
                      .map((p) => p.action)

                    return (
                      <div
                        key={resource.id}
                        className='group flex items-center justify-between rounded-lg border border-border bg-muted/20 p-5 transition-all duration-300 hover:border-primary/30'
                      >
                        <div className='flex items-center gap-3'>
                          <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-primary/5 text-primary transition-colors group-hover:bg-primary/10'>
                            <FiShield className='text-sm' />
                          </div>
                          <div>
                            <h3 className='text-[10px] font-bold uppercase tracking-widest text-foreground'>
                              {resource.name}
                            </h3>
                            {resource.description && (
                              <p className='text-xs font-medium text-muted-foreground'>
                                {resource.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className='flex max-w-[320px] flex-wrap justify-end gap-2'>
                          {availableActions.length === 0 ? (
                            <span className='text-[10px] font-bold uppercase italic tracking-widest text-gray-600'>
                              No actions defined
                            </span>
                          ) : (
                            availableActions.map((action) => {
                              const isChecked = (
                                rolePermissions[resource.name] || []
                              ).includes(action)
                              return (
                                <button
                                  key={action}
                                  onClick={() =>
                                    togglePermissionAction(
                                      resource.name,
                                      action,
                                    )
                                  }
                                  className={`flex items-center gap-2 rounded-md border px-3 py-1.5 transition-all ${
                                    isChecked
                                      ? 'border-primary/50 bg-primary/10 text-primary shadow-sm'
                                      : 'border-border bg-background text-muted-foreground hover:border-border/80'
                                  }`}
                                  title={
                                    ACTION_DESCRIPTIONS[
                                      resource.name.toLowerCase()
                                    ]?.[action.toLowerCase()] ??
                                    action.toUpperCase()
                                  }
                                >
                                  <div
                                    className={`h-1 w-1 rounded-full ${isChecked ? 'bg-primary' : 'bg-muted'}`}
                                  />
                                  <span className='text-[10px] font-bold uppercase tracking-tight'>
                                    {action}
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className='flex shrink-0 justify-end gap-3 border-t border-border pt-5'>
              <button
                className='rounded-md px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted'
                onClick={closePermissionsModal}
                disabled={savingPermissions}
              >
                Cancel
              </button>
              <button
                className={`rounded-md bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 ${savingPermissions ? 'cursor-not-allowed opacity-50' : ''}`}
                onClick={handleSavePermissions}
                disabled={savingPermissions}
              >
                {savingPermissions ? 'Saving...' : 'Save Matrix'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Roles
