import { spawn } from 'node:child_process'

type CommandOptions = {
  input?: Buffer
  timeoutMs: number
  maxOutputBytes: number
  maxErrorBytes?: number
}

type CommandResult = {
  stdout: Buffer
  stderr: Buffer
}

/** Run a media helper without a shell and keep CPU time and captured output bounded. */
export function runBoundedCommand(command: string, args: string[], options: CommandOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const maxErrorBytes = options.maxErrorBytes ?? 64 * 1024
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve({ stdout: Buffer.concat(stdout, stdoutBytes), stderr: Buffer.concat(stderr, stderrBytes) })
    }
    const stop = (message: string) => {
      child.kill('SIGKILL')
      finish(new Error(message))
    }
    const timeout = setTimeout(() => stop(`${command} 处理超过 ${Math.ceil(options.timeoutMs / 1_000)} 秒，已停止。`), options.timeoutMs)
    timeout.unref()

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > options.maxOutputBytes) {
        stop(`${command} 输出超过 ${Math.ceil(options.maxOutputBytes / 1_000_000)}MB 限制。`)
        return
      }
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length
      if (stderrBytes > maxErrorBytes) {
        stop(`${command} 错误输出超过限制。`)
        return
      }
      stderr.push(chunk)
    })
    child.on('error', (error) => finish(error))
    child.on('close', (code, signal) => {
      if (settled) return
      if (code === 0) finish()
      else finish(new Error(`${command} 执行失败（${signal ? `signal ${signal}` : `exit ${code}`}）：${Buffer.concat(stderr, stderrBytes).toString('utf8').trim()}`))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(options.input)
  })
}
