import assert from 'node:assert/strict'
import process from 'node:process'
import { describe, it } from 'node:test'
import { runBoundedCommand } from '../../dist-server/services/media/process.js'

describe('bounded media process runner', () => {
  it('captures normal output', async () => {
    const result = await runBoundedCommand(process.execPath, ['-e', 'process.stdout.write("ok")'], { timeoutMs: 2_000, maxOutputBytes: 10 })
    assert.equal(result.stdout.toString(), 'ok')
  })

  it('kills commands that exceed output or time limits', async () => {
    await assert.rejects(
      runBoundedCommand(process.execPath, ['-e', 'process.stdout.write("too much output")'], { timeoutMs: 2_000, maxOutputBytes: 3 }),
      /输出超过/,
    )
    await assert.rejects(
      runBoundedCommand(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 50, maxOutputBytes: 10 }),
      /处理超过/,
    )
  })
})
