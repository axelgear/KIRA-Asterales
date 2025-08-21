export function joinUrl(base: string, path: string) {
  if (!base.endsWith('/')) base += '/'
  if (path.startsWith('/')) path = path.slice(1)
  return base + path
} 