import { DomainAuthPolicy } from '@/modules/auth/types'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({
  getSsoConfig: vi.fn(),
  saveSsoConfig: vi.fn(),
  deleteSsoConfig: vi.fn(),
  setSsoEnabled: vi.fn(),
  startSsoTest: vi.fn(),
}))
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('../services', () => ({ teamService: service }))
vi.mock('react-toastify', () => ({ toast: toasts }))

import { SsoConfigSource, type SsoConfig, type TeamDomain } from '../types'
import { SsoPanel } from './SsoPanel'

const DOMAIN: TeamDomain = {
  id: 'dom-1',
  domain: 'fund.com',
  isVerified: true,
  restrictOrgCreation: true,
  joinPolicy: 'INVITE_ONLY' as TeamDomain['joinPolicy'],
  authPolicy: DomainAuthPolicy.ANY,
}

const CONFIG: SsoConfig = {
  domain: 'fund.com',
  authPolicy: DomainAuthPolicy.ANY,
  enabled: false,
  configured: true,
  spEntityId: 'https://api.example.com/api/v1/auth/sso/dom-1',
  acsUrl: 'https://api.example.com/api/v1/auth/sso/dom-1/acs',
  idpEntityId: 'https://idp.example.com/entity',
  idpSsoUrl: 'https://idp.example.com/sso',
  certificateExpiresAt: '2126-01-01T00:00:00Z',
  testedAt: null,
  lastLoginAt: null,
}
const UNCONFIGURED: SsoConfig = {
  ...CONFIG,
  configured: false,
  idpEntityId: null,
  idpSsoUrl: null,
  certificateExpiresAt: null,
}

const onConfigChange = vi.fn()
const onChanged = vi.fn()
const assign = vi.fn()

const renderPanel = async (domain: TeamDomain = DOMAIN) => {
  const view = render(
    <SsoPanel
      domain={domain}
      onConfigChange={onConfigChange}
      onChanged={onChanged}
    />,
  )
  await screen.findByRole('region', { name: /single sign-on for fund.com/i })
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  service.getSsoConfig.mockResolvedValue(CONFIG)
  vi.stubGlobal('location', { ...window.location, assign })
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
})

describe('SsoPanel loading', () => {
  it('shows the status and tells the page whether SSO can be required', async () => {
    service.getSsoConfig.mockResolvedValue({
      ...CONFIG,
      enabled: true,
      testedAt: '2030-01-01T00:00:00Z',
    })

    await renderPanel()

    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(onConfigChange).toHaveBeenLastCalledWith(
      'fund.com',
      expect.objectContaining({ enabled: true }),
    )
  })

  it('renders nothing while SSO is switched off on the server', async () => {
    service.getSsoConfig.mockRejectedValue({
      response: {
        data: { errorCode: 'FORBIDDEN_FEATURE_DISABLED', message: 'off' },
      },
    })

    const { container } = render(
      <SsoPanel
        domain={DOMAIN}
        onConfigChange={onConfigChange}
        onChanged={onChanged}
      />,
    )

    await waitFor(() =>
      expect(onConfigChange).toHaveBeenCalledWith('fund.com', null),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers a retry when loading fails for another reason', async () => {
    service.getSsoConfig.mockRejectedValueOnce(new Error('network'))
    render(
      <SsoPanel
        domain={DOMAIN}
        onConfigChange={onConfigChange}
        onChanged={onChanged}
      />,
    )

    await userEvent.click(
      await screen.findByRole('button', { name: /try again/i }),
    )

    expect(
      await screen.findByRole('region', {
        name: /single sign-on for fund.com/i,
      }),
    ).toBeInTheDocument()
  })
})

describe('values for the identity provider', () => {
  it('shows the ACS URL and Entity ID with copy buttons', async () => {
    await renderPanel()

    expect(screen.getByTestId('value-ACS URL')).toHaveTextContent(CONFIG.acsUrl)
    expect(screen.getByTestId('value-Entity ID')).toHaveTextContent(
      CONFIG.spEntityId,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Copy ACS URL' }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(CONFIG.acsUrl)
    expect(toasts.success).toHaveBeenCalledWith('ACS URL copied')
  })

  it('says so when the clipboard is unavailable', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    await renderPanel()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copy Entity ID' }),
    )

    await waitFor(() => expect(toasts.error).toHaveBeenCalled())
  })

  it('shows the setup steps for the chosen provider', async () => {
    await renderPanel()

    await userEvent.selectOptions(
      screen.getByLabelText('Setup guide for'),
      'google',
    )

    expect(screen.getByText(/custom SAML app/i)).toBeInTheDocument()
  })
})

describe('saving the connection', () => {
  it('saves a metadata URL, then tells the admin to test', async () => {
    service.getSsoConfig.mockResolvedValue(UNCONFIGURED)
    service.saveSsoConfig.mockResolvedValue(CONFIG)
    await renderPanel()
    const save = screen.getByRole('button', { name: 'Save connection' })
    expect(save).toBeDisabled()

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Metadata URL' }),
      'https://idp.example.com/metadata',
    )
    await userEvent.click(save)

    await waitFor(() =>
      expect(service.saveSsoConfig).toHaveBeenCalledWith('fund.com', {
        source: SsoConfigSource.METADATA_URL,
        metadataUrl: 'https://idp.example.com/metadata',
      }),
    )
    expect(toasts.success).toHaveBeenCalledWith(
      'Connection saved. Run a test sign-in, then enable SSO.',
    )
    expect(onConfigChange).toHaveBeenLastCalledWith('fund.com', CONFIG)
  })

  it('does not accept a plain-http metadata URL', async () => {
    service.getSsoConfig.mockResolvedValue(UNCONFIGURED)
    await renderPanel()

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Metadata URL' }),
      'http://idp.example.com/metadata',
    )

    expect(
      screen.getByRole('button', { name: 'Save connection' }),
    ).toBeDisabled()
  })

  it('loads an uploaded metadata file', async () => {
    service.getSsoConfig.mockResolvedValue(UNCONFIGURED)
    service.saveSsoConfig.mockResolvedValue(CONFIG)
    await renderPanel()
    await userEvent.click(screen.getByLabelText('Upload metadata file'))

    await userEvent.upload(
      screen.getByLabelText('Metadata file (XML)'),
      new File(['<md/>'], 'metadata.xml', { type: 'text/xml' }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Save connection' }),
    )

    await waitFor(() =>
      expect(service.saveSsoConfig).toHaveBeenCalledWith('fund.com', {
        source: SsoConfigSource.METADATA_XML,
        metadataXml: '<md/>',
      }),
    )
  })

  it('saves manual settings', async () => {
    service.getSsoConfig.mockResolvedValue(UNCONFIGURED)
    service.saveSsoConfig.mockResolvedValue(CONFIG)
    await renderPanel()
    await userEvent.click(screen.getByLabelText('Enter manually'))

    await userEvent.type(
      screen.getByLabelText('Identity provider Entity ID'),
      'https://idp.example.com/entity',
    )
    await userEvent.type(
      screen.getByLabelText('Sign-in URL (HTTP-Redirect)'),
      'https://idp.example.com/sso',
    )
    await userEvent.type(
      screen.getByLabelText('Signing certificate (PEM)'),
      'CERT',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Save connection' }),
    )

    await waitFor(() =>
      expect(service.saveSsoConfig).toHaveBeenCalledWith('fund.com', {
        source: SsoConfigSource.MANUAL,
        idpEntityId: 'https://idp.example.com/entity',
        idpSsoUrl: 'https://idp.example.com/sso',
        idpCertificate: 'CERT',
      }),
    )
  })

  it('shows the server’s reason when the settings are refused', async () => {
    service.getSsoConfig.mockResolvedValue(UNCONFIGURED)
    service.saveSsoConfig.mockRejectedValue({
      response: { data: { message: 'The IdP certificate is expired' } },
    })
    await renderPanel()
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Metadata URL' }),
      'https://idp.example.com/metadata',
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Save connection' }),
    )

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith(
        'The IdP certificate is expired',
      ),
    )
  })

  it('edits an existing connection and can cancel', async () => {
    await renderPanel()

    await userEvent.click(
      screen.getByRole('button', { name: 'Update connection' }),
    )
    expect(
      screen.getByRole('textbox', { name: 'Metadata URL' }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.queryByRole('textbox', { name: 'Metadata URL' }),
    ).not.toBeInTheDocument()
  })
})

describe('testing and enabling', () => {
  it('sends the browser to the identity provider for a test sign-in', async () => {
    service.startSsoTest.mockResolvedValue({
      redirectUrl: 'https://idp.example.com/sso?SAMLRequest=x',
    })
    await renderPanel()

    await userEvent.click(
      screen.getByRole('button', { name: 'Test SSO connection' }),
    )

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://idp.example.com/sso?SAMLRequest=x',
      ),
    )
  })

  it('refuses a test redirect that is not https', async () => {
    service.startSsoTest.mockResolvedValue({
      redirectUrl: 'javascript:alert(1)',
    })
    await renderPanel()

    await userEvent.click(
      screen.getByRole('button', { name: 'Test SSO connection' }),
    )

    await waitFor(() => expect(toasts.error).toHaveBeenCalled())
    expect(assign).not.toHaveBeenCalled()
  })

  it('cannot enable before a passing test', async () => {
    await renderPanel()

    expect(screen.getByRole('button', { name: 'Enable SSO' })).toBeDisabled()
  })

  it('enables after a passing test', async () => {
    service.getSsoConfig.mockResolvedValue({
      ...CONFIG,
      testedAt: '2030-01-01T00:00:00Z',
    })
    service.setSsoEnabled.mockResolvedValue({
      ...CONFIG,
      enabled: true,
      testedAt: '2030-01-01T00:00:00Z',
    })
    await renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Enable SSO' }))

    await waitFor(() =>
      expect(service.setSsoEnabled).toHaveBeenCalledWith('fund.com', true),
    )
    expect(
      await screen.findByRole('button', { name: 'Disable SSO' }),
    ).toBeInTheDocument()
  })

  it('disables an enabled connection', async () => {
    service.getSsoConfig.mockResolvedValue({
      ...CONFIG,
      enabled: true,
      testedAt: '2030-01-01T00:00:00Z',
    })
    service.setSsoEnabled.mockResolvedValue(CONFIG)
    await renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Disable SSO' }))

    await waitFor(() =>
      expect(service.setSsoEnabled).toHaveBeenCalledWith('fund.com', false),
    )
  })
})

describe('certificate expiry', () => {
  it('warns when the certificate expires soon', async () => {
    service.getSsoConfig.mockResolvedValue({
      ...CONFIG,
      certificateExpiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    })

    await renderPanel()

    expect(screen.getByText(/expires soon/i)).toBeInTheDocument()
  })

  it('flags an expired certificate', async () => {
    service.getSsoConfig.mockResolvedValue({
      ...CONFIG,
      certificateExpiresAt: '2020-01-01T00:00:00Z',
    })

    await renderPanel()

    expect(screen.getByText('Expired')).toBeInTheDocument()
  })
})

describe('removing the connection', () => {
  it('asks first, then removes it and signs out SSO sessions', async () => {
    service.deleteSsoConfig.mockResolvedValue({ revokedSessions: 2 })
    await renderPanel()

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove connection' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(service.deleteSsoConfig).not.toHaveBeenCalled()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove connection' }),
    )

    await waitFor(() =>
      expect(service.deleteSsoConfig).toHaveBeenCalledWith('fund.com'),
    )
    expect(toasts.success).toHaveBeenCalledWith(
      'SSO connection removed. 2 sessions were signed out.',
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('can be cancelled', async () => {
    await renderPanel()
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove connection' }),
    )

    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(service.deleteSsoConfig).not.toHaveBeenCalled()
  })
})

describe('while SSO is required', () => {
  beforeEach(() => {
    service.getSsoConfig.mockResolvedValue({
      ...CONFIG,
      enabled: true,
      testedAt: '2030-01-01T00:00:00Z',
      authPolicy: DomainAuthPolicy.SAML_SSO,
    })
  })

  it('locks changing, disabling and removing the connection', async () => {
    await renderPanel({ ...DOMAIN, authPolicy: DomainAuthPolicy.SAML_SSO })

    expect(screen.getByText('Required for everyone')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Update connection' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Disable SSO' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Remove connection' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Test SSO connection' }),
    ).toBeEnabled()
  })
})
