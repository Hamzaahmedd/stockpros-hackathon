import axios from 'axios'
import { logger } from '../infrastructure/logger'

const STOCKPROS_LOGO_URL =
  'https://weyddqoxrfdtgmbcnzew.supabase.co/storage/v1/object/public/public-assets/stockpros-logo.png'

let cachedLogoDataUri: string | null = null

export async function getStockProsLogoDataUri(): Promise<string | null> {
  if (cachedLogoDataUri) return cachedLogoDataUri
  try {
    const res = await axios.get(STOCKPROS_LOGO_URL, {
      responseType: 'arraybuffer',
      timeout: 5000,
    })
    const base64 = Buffer.from(res.data).toString('base64')
    cachedLogoDataUri = `data:image/png;base64,${base64}`
    return cachedLogoDataUri
  } catch (err) {
    logger.warn(
      `Failed to fetch StockPros logo for PDF: ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}
