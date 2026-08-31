// ─── Shared OpenAPI / TSOA response shapes ─────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data?: T
}

export interface ApiErrorResponse {
  success: false
  message: string
  errors?: Array<{ field: string; message: string }>
}

export interface PaginatedResponse<T> {
  success: boolean
  message: string
  data: {
    items: T[]
    total: number
    page: number
    limit: number
  }
}
