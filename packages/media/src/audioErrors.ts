export class AudioTransferError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable = true) {
    super(message)
    this.name = 'AudioTransferError'
  }
}

export function audioErrorCode(error: unknown): string {
  if (error instanceof AudioTransferError) return error.code
  if (error instanceof Error && error.name === 'NotAllowedError') return 'AUTOPLAY_BLOCKED'
  if (error instanceof Error && error.name === 'NotSupportedError') return 'UNSUPPORTED_AUDIO'
  if (error instanceof Error && error.name === 'AbortError') return 'CANCELLED'
  return 'NETWORK_ERROR'
}
