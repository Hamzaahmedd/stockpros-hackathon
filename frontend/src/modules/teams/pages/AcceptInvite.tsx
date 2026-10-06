import { useAuth } from '@/modules/auth/hooks/useAuth'
import { Sidebar } from '@/shared/components/Sidebar'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { clearPendingInviteToken } from '../pendingInvite'
import { teamService } from '../services'
import { apiErrorMessage } from '../utils'

/** Landing page for the emailed invite link: `/teams/invite?token=…`. */
export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { refreshMe } = useAuth()
  const token = searchParams.get('token')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    if (!token || joining) return
    setJoining(true)
    setError(null)
    try {
      await teamService.acceptInvite(token)
      clearPendingInviteToken()
      await refreshMe() // plan becomes TEAM, which reveals the Workspace nav item
      toast.success('Welcome to the team!')
      navigate('/teams')
    } catch (err) {
      setError(apiErrorMessage(err, 'This invite is invalid or has expired'))
      setJoining(false)
    }
  }

  return (
    <div className='flex h-screen overflow-hidden bg-background text-foreground'>
      <Sidebar />
      <main id='main-content' className='flex-1 overflow-y-auto'>
        <div className='mx-auto max-w-[480px] p-4 pt-16 lg:p-8'>
          <Card>
            <CardHeader>
              <CardTitle>Join team workspace</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {token ? (
                <p className='text-sm text-muted-foreground'>
                  Accept the invitation to share watchlists, research and AI
                  credits with your team. You must be signed in with the email
                  address the invite was sent to.
                </p>
              ) : (
                <p className='text-sm text-red-500'>
                  This invite link is missing its token.
                </p>
              )}
              {error && <p className='text-sm text-red-500'>{error}</p>}
              <Button
                type='button'
                className='w-full'
                disabled={!token || joining}
                onClick={handleJoin}
              >
                {joining ? 'Joining…' : 'Join team'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
