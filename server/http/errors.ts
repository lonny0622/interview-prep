export function errorMessage(error: unknown, fallback = '请求处理失败。'): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}
