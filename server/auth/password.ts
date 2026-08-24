import { scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
const HASH_LENGTH = 64
const MAX_MEMORY = 256 * 1024 * 1024

type ScryptParameters = {
  cost: number
  blockSize: number
  parallelization: number
  salt: Buffer
  expected: Buffer
}

function parsePasswordHash(encoded: string): ScryptParameters | null {
  const [algorithm, cost, blockSize, parallelization, salt, expected] = encoded.split('$')
  if (algorithm !== 'scrypt' || !cost || !blockSize || !parallelization || !salt || !expected) return null

  const parsed = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
    salt: Buffer.from(salt, 'base64url'),
    expected: Buffer.from(expected, 'base64url'),
  }
  if (!Number.isInteger(parsed.cost) || parsed.cost < 16_384 || (parsed.cost & (parsed.cost - 1)) !== 0) return null
  if (!Number.isInteger(parsed.blockSize) || parsed.blockSize < 1) return null
  if (!Number.isInteger(parsed.parallelization) || parsed.parallelization < 1) return null
  if (parsed.salt.length < 16 || parsed.expected.length !== HASH_LENGTH) return null
  return parsed
}

export function isValidPasswordHash(encoded: string): boolean {
  return parsePasswordHash(encoded) !== null
}

export function isRecommendedPasswordHash(encoded: string): boolean {
  const parameters = parsePasswordHash(encoded)
  return Boolean(parameters && parameters.blockSize >= 8 && parameters.cost * parameters.parallelization >= 98_304)
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parameters = parsePasswordHash(encoded)
  if (!parameters) return false
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, parameters.salt, HASH_LENGTH, {
      N: parameters.cost,
      r: parameters.blockSize,
      p: parameters.parallelization,
      maxmem: MAX_MEMORY,
    }, (error, key) => error ? reject(error) : resolve(key))
  })
  return timingSafeEqual(actual, parameters.expected)
}

const verificationQueue: Array<() => void> = []
let activeVerifications = 0
const MAX_CONCURRENT_VERIFICATIONS = 2

/** Bound concurrent memory-hard checks so a burst cannot exhaust a small VPS. */
export async function verifyPasswordBounded(password: string, encoded: string): Promise<boolean> {
  if (activeVerifications >= MAX_CONCURRENT_VERIFICATIONS) await new Promise<void>((resolve) => verificationQueue.push(resolve))
  activeVerifications += 1
  try {
    return await verifyPassword(password, encoded)
  } finally {
    activeVerifications -= 1
    verificationQueue.shift()?.()
  }
}

/** Avoid leaking whether the submitted username matches the only configured account. */
export function constantTimeTextEqual(actual: string, expected: string): boolean {
  const actualDigest = Buffer.from(actual.normalize('NFKC'))
  const expectedDigest = Buffer.from(expected.normalize('NFKC'))
  const paddedLength = Math.max(actualDigest.length, expectedDigest.length, 1)
  const left = Buffer.alloc(paddedLength)
  const right = Buffer.alloc(paddedLength)
  actualDigest.copy(left)
  expectedDigest.copy(right)
  return timingSafeEqual(left, right) && actualDigest.length === expectedDigest.length
}
