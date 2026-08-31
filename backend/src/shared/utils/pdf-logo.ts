import config from '@/config'
import axios from 'axios'
import fs from 'node:fs'
import path from 'node:path'
import { logger } from '../infrastructure/logger'

const localLogoPath = path.resolve(__dirname, '../assets/stockpros-logo.png')

const readLocalLogoDataUri = (): string | null => {
  try {
    if (fs.existsSync(localLogoPath)) {
      const base64 = fs.readFileSync(localLogoPath).toString('base64')
      return `data:image/png;base64,${base64}`
    }
  } catch {
    // Ignore local read errors; fallback to null
  }
  return null
}

let cachedLogoDataUri: string | null = null

export async function getStockProsLogoDataUri(): Promise<string | null> {
  if (cachedLogoDataUri) return cachedLogoDataUri

  const logoUrl = config.brand.logoUrl

  if (logoUrl) {
    try {
      const res = await axios.get(logoUrl, {
        responseType: 'arraybuffer',
        timeout: 5000,
      })
      const base64 = Buffer.from(res.data).toString('base64')
      cachedLogoDataUri = `data:image/png;base64,${base64}`
      return cachedLogoDataUri
    } catch (err) {
      logger.warn(
        `Failed to fetch StockPros logo for PDF from remote URL, falling back to local asset: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  cachedLogoDataUri = readLocalLogoDataUri()
  return cachedLogoDataUri
}

