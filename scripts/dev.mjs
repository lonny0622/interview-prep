/* global process */
import { spawn } from 'node:child_process'

function run(command, args) {
  return spawn(command, args, { stdio: 'inherit', env: process.env })
}

const build = run('pnpm', ['gateway:build'])
const buildCode = await new Promise((resolve) => build.once('exit', resolve))

if (buildCode !== 0) process.exit(buildCode ?? 1)

const gateway = run(process.execPath, ['dist-server/gateway.js'])
const client = run('pnpm', ['dev:client'])
const services = [gateway, client]
let stopping = false

function stop(signal = 'SIGTERM') {
  if (stopping) return
  stopping = true
  for (const service of services) if (!service.killed) service.kill(signal)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(signal))
}

for (const service of services) {
  service.once('exit', (code) => {
    stop()
    process.exitCode = code ?? 1
  })
}
