import { Input } from '@/shared/components/ui/input'
import { toast } from 'react-toastify'
import {
  parseSsoSource,
  readMetadataFile,
  SSO_SOURCE_LABELS,
  SSO_SOURCES,
  type SsoFormValues,
} from '../ssoUtils'
import { SsoConfigSource } from '../types'
import { apiErrorMessage } from '../utils'

interface SsoSetupFormProps {
  /** Distinguishes the field ids of several domains on one page. */
  idPrefix: string
  value: SsoFormValues
  disabled: boolean
  onChange: (next: SsoFormValues) => void
}

const AREA_CLASS =
  'min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs'

/** The three ways to give the identity provider's settings: metadata URL, metadata file, or by hand. */
export function SsoSetupForm({
  idPrefix,
  value,
  disabled,
  onChange,
}: Readonly<SsoSetupFormProps>) {
  const patch = (partial: Partial<SsoFormValues>) =>
    onChange({ ...value, ...partial })

  const loadFile = async (file: File | undefined) => {
    if (!file) return
    try {
      patch({ metadataXml: await readMetadataFile(file) })
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not read that file'))
    }
  }

  return (
    <div className='space-y-3'>
      <fieldset className='flex flex-wrap gap-4' disabled={disabled}>
        <legend className='sr-only'>
          How to provide your identity provider
        </legend>
        {SSO_SOURCES.map((source) => (
          <label key={source} className='flex items-center gap-2 text-sm'>
            <input
              type='radio'
              name={`${idPrefix}-source`}
              checked={value.source === source}
              onChange={(e) => {
                const next = parseSsoSource(e.target.value)
                if (next) patch({ source: next })
              }}
              value={source}
            />
            {SSO_SOURCE_LABELS[source]}
          </label>
        ))}
      </fieldset>

      {value.source === SsoConfigSource.METADATA_URL && (
        <div>
          <label
            htmlFor={`${idPrefix}-metadata-url`}
            className='mb-1 block text-sm font-medium'
          >
            Metadata URL
          </label>
          <Input
            id={`${idPrefix}-metadata-url`}
            value={value.metadataUrl}
            disabled={disabled}
            placeholder='https://idp.example.com/metadata'
            autoComplete='off'
            onChange={(e) => patch({ metadataUrl: e.target.value })}
          />
          <p className='mt-1 text-xs text-muted-foreground'>
            Fetched once over https from a public address; changes at the
            provider later are not picked up until you save again.
          </p>
        </div>
      )}

      {value.source === SsoConfigSource.METADATA_XML && (
        <div>
          <label
            htmlFor={`${idPrefix}-metadata-file`}
            className='mb-1 block text-sm font-medium'
          >
            Metadata file (XML)
          </label>
          <Input
            id={`${idPrefix}-metadata-file`}
            type='file'
            accept='.xml,text/xml,application/xml'
            disabled={disabled}
            onChange={(e) => void loadFile(e.target.files?.[0])}
          />
          {value.metadataXml && (
            <p className='mt-1 text-xs text-muted-foreground'>
              Metadata loaded ({value.metadataXml.length.toLocaleString()}{' '}
              characters).
            </p>
          )}
        </div>
      )}

      {value.source === SsoConfigSource.MANUAL && (
        <div className='space-y-3'>
          <div>
            <label
              htmlFor={`${idPrefix}-entity-id`}
              className='mb-1 block text-sm font-medium'
            >
              Identity provider Entity ID
            </label>
            <Input
              id={`${idPrefix}-entity-id`}
              value={value.idpEntityId}
              disabled={disabled}
              autoComplete='off'
              onChange={(e) => patch({ idpEntityId: e.target.value })}
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}-sso-url`}
              className='mb-1 block text-sm font-medium'
            >
              Sign-in URL (HTTP-Redirect)
            </label>
            <Input
              id={`${idPrefix}-sso-url`}
              value={value.idpSsoUrl}
              disabled={disabled}
              placeholder='https://idp.example.com/sso'
              autoComplete='off'
              onChange={(e) => patch({ idpSsoUrl: e.target.value })}
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}-certificate`}
              className='mb-1 block text-sm font-medium'
            >
              Signing certificate (PEM)
            </label>
            <textarea
              id={`${idPrefix}-certificate`}
              className={AREA_CLASS}
              value={value.idpCertificate}
              disabled={disabled}
              spellCheck={false}
              onChange={(e) => patch({ idpCertificate: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
