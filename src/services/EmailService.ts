import nodemailer from 'nodemailer'
import { ENV } from '../config/environment.js'

class EmailService {
  private transporter = nodemailer.createTransport({
    host: ENV.SMTP_ENDPOINT,
    port: ENV.SMTP_PORT,
    secure: ENV.SMTP_PORT === 465,
    auth: ENV.SMTP_USER_NAME ? { user: ENV.SMTP_USER_NAME, pass: ENV.SMTP_PASSWORD } : undefined
  } as any)

  async send(to: string, subject: string, html: string) {
    if (!ENV.SMTP_USER_NAME) return { accepted: [], messageId: 'dev-skip' }
    return this.transporter.sendMail({ from: ENV.SMTP_USER_NAME, to, subject, html })
  }
}

export const emailService = new EmailService() 