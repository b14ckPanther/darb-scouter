// Talks to the FastAPI backend. The token, when the server asks for one, lives only in this browser.
const TOKEN_KEY = 'scouter.token'

export class AuthError extends Error {
  constructor() {
    super('The server wants an access token. Add it in Settings.')
  }
}

export class HttpError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown) {
    super(`Request failed (${status})`)
    this.status = status
    this.body = body
  }
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* storage blocked: the token can't persist */
  }
}

export async function request<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('X-Scouter-Token', token)
  if (init.body) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${base}${path}`, { ...init, headers })
  if (res.status === 401) throw new AuthError()
  const body: unknown = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text()
  if (!res.ok) throw new HttpError(res.status, body)
  return body as T
}
