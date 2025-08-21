import { authenticator } from 'otplib'
import { ENV } from '../config/environment.js'

class TotpService {
  generateSecret(label: string) {
    const secret = authenticator.generateSecret()
    const otpauth = authenticator.keyuri(label, ENV.TOTP_ISSUER as unknown as string, secret)
    return { secret, otpauth }
  }

  verify(code: string, secret: string) {
    return authenticator.verify({ token: code, secret })
  }
}

export const totpService = new TotpService() 