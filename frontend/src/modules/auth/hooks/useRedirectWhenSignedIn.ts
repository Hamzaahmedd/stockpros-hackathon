import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

/**
 * Sends a signed-in user to their home screen (admins with no app access go to
 * access control). Pass `paused` while another destination, such as phone
 * verification, is about to take over.
 */
export const useRedirectWhenSignedIn = (paused = false): void => {
  const navigate = useNavigate()
  const { user, can } = useAuth()

  useEffect(() => {
    if (!user || paused) return
    const isAdminOnly =
      !can('CORE_APP', 'canRead') && can('ACCESS_CONTROL', 'canRead')
    navigate(isAdminOnly ? '/access-control/users' : '/dashboard', {
      replace: true,
    })
  }, [user, can, navigate, paused])
}
