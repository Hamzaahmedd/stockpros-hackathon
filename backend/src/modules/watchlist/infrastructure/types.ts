export interface JobDefinition {
  name: string
  handler: () => Promise<void>
  pattern: string
  timeZone?: string
}
