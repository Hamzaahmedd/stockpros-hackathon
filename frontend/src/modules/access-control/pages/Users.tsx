import { useAuth } from '@/modules/auth/hooks/useAuth'
import api from '@/shared/api/axios'
import { Sidebar } from '@/shared/components/Sidebar'
import { useEffect, useState } from 'react'
import { FiCheck, FiShield, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import type { Role, AccessControlUser as User } from '../types'

const formatJoinedAt = (isoDate: string) => {
  const date = new Date(isoDate)
  const datePart = date.toLocaleDateString('en-US', { dateStyle: 'medium' })
  const timePart = date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
  return `${datePart} ${timePart}`
}

const Users = () => {
  const { can, user, refreshMe } = useAuth()
  const userRoleList =
    user?.userRoles?.map((ur: any) => ur.role?.name?.toUpperCase()) || []
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get('/api/v1/rbac/users'),
        api.get('/api/v1/rbac/roles'),
      ])

      if (usersRes.data?.data) {
        setUsers(usersRes.data.data)
        setNextCursor(usersRes.data.extra?.nextCursor ?? null)
        setHasMore(usersRes.data.extra?.hasMore ?? false)
      } else if (Array.isArray(usersRes.data)) {
        setUsers(usersRes.data)
        setNextCursor(null)
        setHasMore(false)
      }

      if (rolesRes.data?.data) {
        setAllRoles(rolesRes.data.data)
      } else if (Array.isArray(rolesRes.data)) {
        setAllRoles(rolesRes.data)
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await api.get('/api/v1/rbac/users', {
        params: { cursor: nextCursor },
      })
      if (res.data?.data) {
        setUsers((prev) => [...prev, ...res.data.data])
        setNextCursor(res.data.extra?.nextCursor ?? null)
        setHasMore(res.data.extra?.hasMore ?? false)
      }
    } catch (err) {
      console.error('Error loading more users:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const openEditModal = (user: User) => {
    setSelectedUser(user)
    // Pre-fill checkboxes based on user's current roles by matching IDs or names
    const currentUserRoleIds =
      user.userRoles
        ?.map((ur: any) => ur.role?.id || ur.roleId || ur.id)
        .filter(Boolean) || []
    const currentUserRoleNames =
      user.userRoles
        ?.map((ur: any) => ur.role?.name || ur.name)
        .filter(Boolean) || []

    const matchedRoleIds = allRoles
      .filter(
        (r) =>
          currentUserRoleIds.includes(r.id) ||
          currentUserRoleNames.includes(r.name),
      )
      .map((r) => r.id)

    setSelectedRoleIds(
      matchedRoleIds.length > 0 ? matchedRoleIds : currentUserRoleIds,
    )
  }

  const closeEditModal = () => {
    setSelectedUser(null)
    setSelectedRoleIds([])
  }

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId],
    )
  }

  const updateLocalUserState = (userId: string, newRoles: any[]) => {
    setUsers((prevUsers) =>
      prevUsers.map((u) =>
        u.id === userId
          ? { ...u, userRoles: newRoles.map((r) => ({ role: r })) }
          : u,
      ),
    )
  }

  const handleSaveRoles = async () => {
    if (!selectedUser) return
    setSaving(true)
    try {
      const response = await api.post('/api/v1/rbac/assign-role', {
        userId: selectedUser.id,
        roleIds: selectedRoleIds,
      })

      const { roles, userName, assignedBy } =
        response.data.data || response.data

      // Update state instantly
      updateLocalUserState(selectedUser.id, roles)

      // Refresh current user permissions and roles globally
      await refreshMe()

      toast.success(
        `Roles updated for ${selectedUser.displayName || selectedUser.email || 'user'}`,
      )
      console.log(`Assigned by: ${assignedBy}`)

      closeEditModal()
    } catch (err: any) {
      console.error('Error saving roles:', err)
      toast.error(err?.response?.data?.message || 'Failed to save roles.')
    } finally {
      setSaving(false)
    }
  }

  const getRoleBadges = (roles: any) => {
    if (!roles || roles.length === 0)
      return (
        <span className='text-xs italic text-muted-foreground'>No roles</span>
      )
    return (
      <div className='flex flex-wrap gap-2'>
        {roles.map((r: any, idx: number) => {
          const roleName =
            r?.role?.name || r?.name || (typeof r === 'string' ? r : 'UNKNOWN')
          return (
            <span
              key={idx}
              className='rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary'
            >
              {roleName}
            </span>
          )
        })}
      </div>
    )
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
                User Management
              </h1>
              <div className='mt-1 text-sm font-medium text-muted-foreground'>
                Manage users and their assigned roles
              </div>
            </div>
          </div>

          {/* ================= USERS TABLE ================= */}
          <div className='overflow-hidden rounded-lg border border-border bg-card shadow-md'>
            <div className='overflow-x-auto'>
              <div className='min-w-[800px]'>
                {/* Table Header */}
                <div className='grid grid-cols-[1.2fr_1.8fr_1.6fr_1.2fr_1fr] border-b border-border bg-muted/30 px-8 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                  <div>Name</div>
                  <div>Email</div>
                  <div>Roles</div>
                  <div>Joined</div>
                  <div className='text-right'>Actions</div>
                </div>

                {loading ? (
                  <div className='animate-pulse py-20 text-center text-muted-foreground'>
                    Loading users...
                  </div>
                ) : users.length === 0 ? (
                  <div className='py-20 text-center text-muted-foreground'>
                    No users found.
                  </div>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.id || user.email}
                      className='grid grid-cols-[1.2fr_1.8fr_1.6fr_1.2fr_1fr] items-center border-b border-border px-8 py-4 transition-colors duration-200 hover:bg-muted/30'
                    >
                      <div className='text-sm font-bold'>
                        {user.displayName}
                      </div>

                      <div className='text-sm font-medium text-muted-foreground'>
                        {user.email}
                      </div>

                      <div>{getRoleBadges(user.userRoles)}</div>

                      <div className='text-xs font-medium text-muted-foreground'>
                        {user.createdAt ? formatJoinedAt(user.createdAt) : '—'}
                      </div>

                      <div className='text-right'>
                        {can('ROLE', 'canWrite') && (
                          <button
                            className='rounded-md border border-border bg-secondary px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all hover:bg-secondary/80'
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
              <div className='flex justify-center border-t border-border bg-muted/10 px-8 py-4'>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className='rounded-md border border-border bg-secondary px-6 py-2 text-[10px] font-bold uppercase tracking-wider transition-all hover:bg-secondary/80 disabled:opacity-50'
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
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm'>
          <div className='relative w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-2xl duration-200 animate-in zoom-in-95'>
            <button
              onClick={closeEditModal}
              className='absolute right-6 top-6 text-muted-foreground transition-colors hover:text-foreground'
            >
              <FiX className='text-xl' />
            </button>
            <div className='mb-8 flex items-center gap-4'>
              <div className='grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary'>
                <FiShield className='text-2xl' />
              </div>
              <div>
                <h2 className='text-xl font-bold'>Edit Roles</h2>
                <p className='text-sm font-medium text-muted-foreground'>
                  {selectedUser.displayName}
                </p>
              </div>
            </div>

            <div className='custom-scrollbar mb-8 max-h-80 space-y-4 overflow-y-auto pr-2'>
              {allRoles.length === 0 ? (
                <div className='p-4 text-center text-sm text-muted-foreground'>
                  No roles available.
                </div>
              ) : (
                <div className='grid gap-2'>
                  <label className='mb-2 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>
                    Select Roles
                  </label>
                  {allRoles.map((role) => {
                    const isSelected = selectedRoleIds.includes(role.id)
                    return (
                      <button
                        type='button'
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        aria-pressed={isSelected}
                        className={`group flex w-full cursor-pointer items-center justify-between rounded-lg border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          isSelected
                            ? 'border-primary/50 bg-primary/5 shadow-sm'
                            : 'border-border bg-card hover:border-border/80 hover:bg-muted/30'
                        }`}
                      >
                        <div className='flex items-center gap-4'>
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                              isSelected
                                ? 'border-primary bg-primary'
                                : 'border-border bg-muted'
                            }`}
                          >
                            {isSelected && (
                              <FiCheck className='text-xs font-bold text-primary-foreground' />
                            )}
                          </div>
                          <div>
                            <div
                              className={`text-sm font-bold transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}
                            >
                              {role.name}
                            </div>
                            {role.description && (
                              <div className='mt-0.5 line-clamp-1 text-[10px] text-muted-foreground'>
                                {role.description}
                              </div>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div className='rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter text-primary'>
                            Selected
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className='flex justify-end gap-3 border-t border-border pt-4'>
              <button
                className='rounded-md px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted'
                onClick={closeEditModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={`rounded-md bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 ${saving ? 'cursor-not-allowed opacity-50' : ''}`}
                onClick={handleSaveRoles}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Users
