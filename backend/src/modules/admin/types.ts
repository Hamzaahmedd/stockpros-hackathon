/** Who is performing an admin write, and why — passed into every write service. */
export interface AdminWriteContext {
  adminId: string
  reason: string
  /** Support ticket the request cites; required when `config.admin.requireTicketRef` is on. */
  ticketRef?: string
  ipAddress?: string
}

/** Who is reading customer data through the ops panel. */
export interface AdminReadContext {
  adminId: string
  ipAddress?: string
}
