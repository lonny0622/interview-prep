import type { ServerResponse } from 'node:http'

export function jsonResponse(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(statusCode === 204 ? undefined : JSON.stringify(payload))
}
