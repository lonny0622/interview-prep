/* global Buffer, process */
import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const COST = 32_768
const BLOCK_SIZE = 8
const PARALLELIZATION = 1
const HASH_LENGTH = 64

function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    return Promise.reject(new Error('请在交互式终端运行，或通过 INTERVIEWPREP_PASSWORD 环境变量提供密码。'))
  }
  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  return new Promise((resolve, reject) => {
    let value = ''
    const finish = () => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
      process.stdout.write('\n')
    }
    const onData = (character) => {
      if (character === '\u0003') {
        finish()
        reject(new Error('已取消。'))
        return
      }
      if (character === '\r' || character === '\n') {
        finish()
        resolve(value)
        return
      }
      if (character === '\u007f' || character === '\b') {
        if (value) {
          value = value.slice(0, -1)
          process.stdout.write('\b \b')
        }
        return
      }
      if (character >= ' ') {
        value += character
        process.stdout.write('*')
      }
    }
    process.stdin.on('data', onData)
  })
}

const password = process.env.INTERVIEWPREP_PASSWORD || await readHidden('输入登录密码：')
if (password.length < 16) throw new Error('密码至少需要 16 个字符；建议使用密码管理器生成随机密码。')

const salt = randomBytes(24)
const hash = await scrypt(password, salt, HASH_LENGTH, {
  N: COST,
  r: BLOCK_SIZE,
  p: PARALLELIZATION,
  maxmem: 256 * 1024 * 1024,
})

process.stdout.write(`scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('base64url')}$${Buffer.from(hash).toString('base64url')}\n`)
