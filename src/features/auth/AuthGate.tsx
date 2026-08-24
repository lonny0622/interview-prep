import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LogOut, ShieldCheck } from 'lucide-react'
import { AUTH_REQUIRED_EVENT } from '../../api/http'
import './AuthGate.css'

type SessionResponse = {
  authenticated: boolean
  user?: string
  error?: string
  retryAfter?: number
}

type AuthState =
  | { status: 'checking' }
  | { status: 'anonymous'; error: string }
  | { status: 'authenticated'; user: string }

async function authRequest(path: string, init?: RequestInit): Promise<{ response: Response; payload: SessionResponse }> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const payload = await response.json().catch(() => ({})) as SessionResponse
  return { response, payload }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking' })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    void authRequest('/api/auth/session').then(({ response, payload }) => {
      if (!active) return
      if (response.ok && payload.authenticated) setState({ status: 'authenticated', user: payload.user || '' })
      else setState({ status: 'anonymous', error: '' })
    }).catch(() => {
      if (active) setState({ status: 'anonymous', error: '暂时无法连接服务，请稍后重试。' })
    })

    const requireLogin = () => setState({ status: 'anonymous', error: '登录状态已失效，请重新登录。' })
    window.addEventListener(AUTH_REQUIRED_EVENT, requireLogin)
    return () => {
      active = false
      window.removeEventListener(AUTH_REQUIRED_EVENT, requireLogin)
    }
  }, [])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) return
    setSubmitting(true)
    setState({ status: 'anonymous', error: '' })
    try {
      const { response, payload } = await authRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (!response.ok || !payload.authenticated) {
        setPassword('')
        setState({ status: 'anonymous', error: payload.error || '登录失败，请稍后重试。' })
        return
      }
      setPassword('')
      setState({ status: 'authenticated', user: payload.user || username.trim() })
    } catch {
      setState({ status: 'anonymous', error: '暂时无法连接服务，请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  const logout = async () => {
    await authRequest('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined)
    setPassword('')
    setState({ status: 'anonymous', error: '' })
  }

  if (state.status === 'checking') {
    return <main className="auth-screen"><div className="auth-loading" role="status">正在验证登录状态…</div></main>
  }

  if (state.status === 'anonymous') {
    return <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-heading">
        <div className="auth-mark"><ShieldCheck size={23} aria-hidden="true" /></div>
        <p className="auth-eyebrow">PRIVATE WORKSPACE</p>
        <h1 id="login-heading">登录 InterviewPrep</h1>
        <p className="auth-description">这是一个仅供个人使用的面试准备空间。</p>
        <form onSubmit={login}>
          <label>
            <span>用户名</span>
            <input autoComplete="username" autoFocus maxLength={128} name="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            <span>密码</span>
            <input autoComplete="current-password" maxLength={1024} name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {state.error && <p className="auth-error" role="alert">{state.error}</p>}
          <button className="primary-button auth-submit" disabled={submitting || !username.trim() || !password} type="submit">
            {submitting ? '正在验证…' : '登录'}
          </button>
        </form>
      </section>
    </main>
  }

  return <>
    {children}
    <button className="auth-logout" type="button" title={`退出 ${state.user}`} onClick={() => void logout()}>
      <LogOut size={14} aria-hidden="true" />
      <span>退出</span>
    </button>
  </>
}
