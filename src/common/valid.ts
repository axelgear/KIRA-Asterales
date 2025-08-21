export function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isUUID(v: string) {
  return /^[0-9a-fA-F-]{36}$/.test(v)
} 