export const toBase64 = (input: string) => Buffer.from(input).toString('base64')
export const fromBase64 = (b64: string) => Buffer.from(b64, 'base64').toString('utf8') 