import { DomainAuthPolicy, type PlatformRole } from '@/modules/auth/types'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useState } from 'react'
import { toast } from 'react-toastify'
import { adminService } from '../services'
import type { AdminTeam } from '../types'
import { apiErrorMessage, formatPaisa, hasPlatformRole } from '../utils'
import { CustomerIdentity } from './CustomerIdentity'
import { ReasonModal } from './ReasonModal'
import { SearchBar } from './SearchBar'
import { SsoDetailsModal } from './SsoDetailsModal'

type TeamAction =
  | { kind: 'capacity'; team: AdminTeam }
  | { kind: 'domain'; domainId: string; domain: string }
  | { kind: 'authReset'; domain: string }
  | { kind: 'sso'; domain: string }
  | { kind: 'ssoDisable'; domain: string }
  | { kind: 'ssoReset'; domain: string }
  | { kind: 'member'; userId: string; email: string }

/** Workspace lookup (SUPPORT_AGENT+) with capacity, domain and member overrides (PLATFORM_ADMIN+). */
export function TeamsTab({ role }: Readonly<{ role: PlatformRole }>) {
  const [teams, setTeams] = useState<AdminTeam[] | null>(null)
  const [lastQuery, setLastQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<TeamAction | null>(null)
  const [capacity, setCapacity] = useState('')
  const canWrite = hasPlatformRole(role, 'PLATFORM_ADMIN')

  const search = async (query: string) => {
    setBusy(true)
    setLastQuery(query)
    try {
      setTeams(await adminService.searchTeams(query))
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Team search failed'))
    } finally {
      setBusy(false)
    }
  }

  const capacityValue = Number(capacity)
  const capacityValid = Number.isInteger(capacityValue) && capacityValue >= 2

  return (
    <div className='space-y-4'>
      <SearchBar
        label='Search teams'
        placeholder='Team name, team ID or owner email'
        busy={busy}
        onSearch={(query) => void search(query)}
      />

      {teams && teams.length === 0 && (
        <p className='text-sm text-muted-foreground'>
          No workspaces match “{lastQuery}”.
        </p>
      )}

      {teams?.map((team) => (
        <section
          key={team.id}
          aria-label={`Team ${team.name}`}
          className='space-y-3 rounded-lg border border-border p-4'
        >
          <header className='flex flex-wrap items-center gap-2'>
            <h3 className='text-base font-semibold'>{team.name}</h3>
            <Badge variant='secondary'>{team.status}</Badge>
            <Badge>{team.seatUtilization} seats</Badge>
            <span className='font-mono text-[10px] text-muted-foreground'>
              {team.id}
            </span>
            {canWrite && (
              <Button
                size='sm'
                variant='outline'
                className='ml-auto'
                onClick={() => {
                  setCapacity(String(team.seatCapacity))
                  setAction({ kind: 'capacity', team })
                }}
              >
                Override capacity
              </Button>
            )}
          </header>

          <dl className='grid gap-2 text-sm sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground'>Owner</dt>
              <dd>
                <CustomerIdentity
                  userId={team.owner.id}
                  displayName={team.owner.displayName}
                  email={team.owner.email}
                  masked={team.piiMasked}
                />
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>Credit pool</dt>
              <dd>{formatPaisa(team.creditBalanceInPaisa)}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>Capacity</dt>
              <dd>
                {team.seatCapacity}
                {team.scheduledSeatCapacity !== null &&
                  ` (reduces to ${team.scheduledSeatCapacity} at renewal)`}
              </dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-muted-foreground'>Org instructions</dt>
              <dd className='whitespace-pre-wrap'>
                {team.orgInstructions ?? '—'}
              </dd>
            </div>
          </dl>

          <div>
            <h4 className='mb-1 text-sm font-medium'>Domains</h4>
            {team.domains.length === 0 && (
              <p className='text-sm text-muted-foreground'>None</p>
            )}
            <ul className='space-y-1'>
              {team.domains.map((domain) => (
                <li key={domain.id} className='flex items-center gap-2 text-sm'>
                  <span>{domain.domain}</span>
                  <Badge variant={domain.isVerified ? 'default' : 'secondary'}>
                    {domain.isVerified ? 'Verified' : 'Unverified'}
                  </Badge>
                  {domain.samlEnabled && <Badge>SSO on</Badge>}
                  {domain.isVerified && (
                    <Button
                      size='sm'
                      variant='outline'
                      aria-label={`View SSO for ${domain.domain}`}
                      onClick={() =>
                        setAction({ kind: 'sso', domain: domain.domain })
                      }
                    >
                      View SSO
                    </Button>
                  )}
                  {canWrite && !domain.isVerified && (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() =>
                        setAction({
                          kind: 'domain',
                          domainId: domain.id,
                          domain: domain.domain,
                        })
                      }
                    >
                      Force verify
                    </Button>
                  )}
                  {canWrite &&
                    domain.isVerified &&
                    domain.authPolicy !== DomainAuthPolicy.ANY && (
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() =>
                          setAction({
                            kind: 'authReset',
                            domain: domain.domain,
                          })
                        }
                      >
                        Reset auth policy to ANY
                      </Button>
                    )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className='mb-1 text-sm font-medium'>
              Members ({team.members.length})
            </h4>
            <ul className='space-y-1'>
              {team.members.map((member) => (
                <li
                  key={member.user.id}
                  className='flex items-center gap-2 text-sm'
                >
                  <CustomerIdentity
                    userId={member.user.id}
                    displayName={member.user.displayName}
                    email={member.user.email}
                    masked={team.piiMasked}
                  />
                  <Badge variant='secondary'>{member.role}</Badge>
                  {canWrite && member.role !== 'OWNER' && (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() =>
                        setAction({
                          kind: 'member',
                          userId: member.user.id,
                          email: member.user.email,
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {action?.kind === 'capacity' && (
        <ReasonModal
          title='Override seat capacity'
          description={`Custom ceiling for ${action.team.name} (beyond the 150-seat self-serve cap). Clears any scheduled seat reduction.`}
          confirmLabel='Set capacity'
          successMessage='Seat capacity updated'
          canSubmit={capacityValid}
          onSubmit={(reason, ticketRef) =>
            adminService.setSeatCapacity(
              action.team.id,
              capacityValue,
              reason,
              ticketRef,
            )
          }
          onClose={() => setAction(null)}
          onDone={() => void search(lastQuery)}
        >
          <label htmlFor='admin-capacity' className='block text-sm font-medium'>
            Seat capacity
          </label>
          <Input
            id='admin-capacity'
            inputMode='numeric'
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </ReasonModal>
      )}

      {action?.kind === 'domain' && (
        <ReasonModal
          title='Force-verify domain'
          description={`Marks ${action.domain} verified without a DNS TXT check.`}
          confirmLabel='Force verify'
          successMessage='Domain verified'
          onSubmit={(reason, ticketRef) =>
            adminService.verifyDomain(action.domainId, reason, ticketRef)
          }
          onClose={() => setAction(null)}
          onDone={() => void search(lastQuery)}
        />
      )}

      {action?.kind === 'authReset' && (
        <ReasonModal
          title='Reset auth policy'
          description={`Lets users on ${action.domain} sign in by any method again (the owner-set Google requirement is removed).`}
          confirmLabel='Reset to ANY'
          successMessage='Auth policy reset to ANY'
          onSubmit={(reason, ticketRef) =>
            adminService.resetDomainAuthPolicy(action.domain, reason, ticketRef)
          }
          onClose={() => setAction(null)}
          onDone={() => void search(lastQuery)}
        />
      )}

      {action?.kind === 'sso' && (
        <SsoDetailsModal
          domain={action.domain}
          canWrite={canWrite}
          onDisable={() =>
            setAction({ kind: 'ssoDisable', domain: action.domain })
          }
          onReset={() => setAction({ kind: 'ssoReset', domain: action.domain })}
          onClose={() => setAction(null)}
        />
      )}

      {action?.kind === 'ssoDisable' && (
        <ReasonModal
          title='Disable SSO'
          description={`Turns SSO off for ${action.domain} and signs out everyone who signed in through it. If SSO was required, the domain goes back to accepting any sign-in method so people are not locked out.`}
          confirmLabel='Disable SSO'
          successMessage='SSO disabled'
          onSubmit={(reason, ticketRef) =>
            adminService.disableTeamSso(action.domain, reason, ticketRef)
          }
          onClose={() => setAction({ kind: 'sso', domain: action.domain })}
          onDone={() => void search(lastQuery)}
        />
      )}

      {action?.kind === 'ssoReset' && (
        <ReasonModal
          title='Reset SSO setup'
          description={`Removes ${action.domain}'s SSO connection entirely so the customer can configure it again, and signs out its SSO sessions. If SSO was required, the domain goes back to accepting any sign-in method.`}
          confirmLabel='Reset SSO'
          successMessage='SSO setup reset'
          destructive
          onSubmit={(reason, ticketRef) =>
            adminService.resetTeamSso(action.domain, reason, ticketRef)
          }
          onClose={() => setAction({ kind: 'sso', domain: action.domain })}
          onDone={() => void search(lastQuery)}
        />
      )}

      {action?.kind === 'member' && (
        <ReasonModal
          title='Remove member'
          description={`Hard-removes ${action.email} and frees their seat immediately.`}
          confirmLabel='Remove member'
          successMessage='Member removed'
          destructive
          onSubmit={(reason, ticketRef) =>
            adminService.removeMember(action.userId, reason, ticketRef)
          }
          onClose={() => setAction(null)}
          onDone={() => void search(lastQuery)}
        />
      )}
    </div>
  )
}
