import crypto from 'crypto'

export function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function base64(input: string) {
  return Buffer.from(input).toString('base64')
} 