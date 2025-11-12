import { UserModel } from '../infrastructure/models/User.js'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { ENV } from '../config/environment.js'
import { v4 as uuidv4 } from 'uuid'
import { RbacUserBindingModel } from '../infrastructure/models/RbacUserBinding.js'
import crypto from 'crypto'
import { totpService } from './TotpService.js'
import { UserVerificationCodeModel } from '../infrastructure/models/UserVerificationCode.js'
import { InvitationCodeModel } from '../infrastructure/models/InvitationCode.js'
import { renderEmailTemplate, sendMail } from '../infrastructure/EmailTool.js'

type VerificationCodeType = 'registration' | 'change-email' | 'change-password'

const VERIFICATION_CODE_EXPIRATION_MINUTES = 10
const DEFAULT_VERIFICATION_CODE_COOLDOWN_SECONDS = 60
const BACKUP_CODE_COUNT = 5
const BACKUP_CODE_LENGTH = 8
const RECOVERY_CODE_LENGTH = 16
const BACKUP_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RANDOM_PASSWORD_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const PROVIDERS = ['google', 'discord', 'yandex'] as const
export type OAuthProvider = typeof PROVIDERS[number]
export type OAuthProfile = {
	provider: OAuthProvider
	providerId: string
	email?: string | undefined
	name?: string | undefined
	avatar?: string | undefined
}

function generateNumericCode(length = 6): string {
	const min = 10 ** (length - 1)
	const max = 10 ** length - 1
	return String(crypto.randomInt(min, max + 1))
}

export class UserService {
	private generateRandomCode(length: number, charset = BACKUP_CODE_CHARSET): string {
		let result = ''
		for (let i = 0; i < length; i++) {
			const index = crypto.randomInt(0, charset.length)
			result += charset[index]
		}
		return result
	}

	private generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
		return Array.from({ length: count }, () => this.generateRandomCode(BACKUP_CODE_LENGTH))
	}

	private escapeRegExp(input: string) {
		return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	private async findUserByEmailInsensitive(email: string) {
		return UserModel.findOne({ email: { $regex: `^${this.escapeRegExp(email)}$`, $options: 'i' } })
	}

	private sanitizeUsernameCandidate(input: string) {
		const normalized = input
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-zA-Z0-9_]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.toLowerCase()
		if (!normalized) return `user`
		return normalized.slice(0, 24)
	}

	private async generateUniqueUsername(base: string) {
		const sanitized = this.sanitizeUsernameCandidate(base)
		let candidate = sanitized || 'user'
		let suffix = 0
		while (await UserModel.exists({ username: candidate })) {
			suffix += 1
			candidate = `${sanitized || 'user'}${suffix}`
		}
		return candidate
	}

	private createOAuthAccountEntry(profile: OAuthProfile, email: string) {
		return {
			provider: profile.provider,
			providerId: profile.providerId,
			email,
			name: profile.name ?? undefined,
			avatar: profile.avatar ?? undefined,
			linkedAt: new Date(),
		}
	}

	private createOauthTotpToken(params: { uid: number; uuid: string; provider: OAuthProvider; email: string }) {
		const payload = {
			purpose: 'oauth-totp',
			uid: params.uid,
			uuid: params.uuid,
			provider: params.provider,
			email: params.email,
		}
		return jwt.sign(payload, ENV.JWT_SECRET as unknown as jwt.Secret, { expiresIn: '5m' })
	}

	async getPublicProfile(uid: number) {
		const user = await UserModel.findOne({ userId: uid }, { userId: 1, username: 1, nickname: 1, avatar: 1, bio: 1 }).lean()
		if (!user) return null
		return {
			uid: user.userId,
			username: user.username,
			userNickname: user.nickname ?? '',
			avatar: user.avatar ?? '',
			bio: user.bio ?? '',
		}
	}

	async register(params: { username: string; email: string; password?: string; passwordHash?: string; nickname?: string; verificationCode?: string; invitationCode?: string }): Promise<{ token: string; user: any }> {
		const emailLowerCase = params.email.toLowerCase()
		if (ENV.REQUIRE_REGISTRATION_VERIFICATION) {
			if (!params.verificationCode) throw new Error('Verification code required')

			const verificationPassed = await this.verifyAndConsumeVerificationCode({
				identifier: emailLowerCase,
				type: 'registration',
				code: params.verificationCode,
			})

			if (!verificationPassed) throw new Error('Invalid or expired verification code')
		}

		const exists = await UserModel.findOne({ $or: [{ username: params.username }, { email: params.email }] })
		if (exists) throw new Error('Username or email already exists')

		const userId = await getNextSequence('userId')
		const uuid = uuidv4()
		const secretToHash = params.passwordHash ?? params.password
		if (!secretToHash) throw new Error('Missing password or passwordHash')
		const passwordHash = await bcrypt.hash(secretToHash, ENV.BCRYPT_ROUNDS)
		const user = await UserModel.create({
			userId,
			uuid,
			username: params.username,
			email: params.email,
			password: passwordHash,
			nickname: params.nickname || params.username,
			roles: ['user'],
			permissions: []
		})

		if (ENV.ENABLE_INVITATION && params.invitationCode) {
			await this.useInvitationCode(params.invitationCode, user.userId, user.uuid)
		}

		// Create default RBAC user binding with 'user' role
		await RbacUserBindingModel.updateOne(
			{ userId, uuid },
			{ $setOnInsert: { roles: ['user'], permissions: [] } },
			{ upsert: true }
		)

		const token = this.signToken({ uid: user.userId, uuid: user.uuid, roles: user.roles })
		return { token, user }
	}

	async login(params: { usernameOrEmail?: string; email?: string; username?: string; password?: string; passwordHash?: string; clientOtp?: string }): Promise<{ token: string; user: any }> {
		const identifier = params.usernameOrEmail ?? params.email ?? params.username
		const user = await UserModel.findOne({ $or: [{ username: identifier }, { email: identifier }] })
		if (!user) throw new Error('Invalid credentials')
		let ok = false
		if (params.password) {
			ok = await bcrypt.compare(params.password, user.password)
		}
		if (!ok && params.passwordHash) {
			// For passwordHash login, compare the passwordHash directly with stored bcrypt hash
			// because during registration we store bcrypt(passwordHash)
			ok = await bcrypt.compare(params.passwordHash, user.password)
		}
		if (!ok) throw new Error('Invalid credentials')
		user.lastLoginAt = new Date()
		await user.save()

		if (user.is2FAEnabled && user.totpSecret && user.twoFactorType === 'totp') {
			if (!params.clientOtp) {
				throw new Error('TOTP_REQUIRED')
			}
			const otpValid = totpService.verify(params.clientOtp, user.totpSecret)
			if (!otpValid) {
				throw new Error('INVALID_TOTP')
			}
		}

		const token = this.signToken({ uid: user.userId, uuid: user.uuid, roles: user.roles })
		return { token, user }
	}

	async getProfile(uid: number) {
		const user = await UserModel.findOne({ userId: uid }, '-password')
		if (!user) throw new Error('User not found')
		return user
	}

	async updateProfile(uid: number, payload: Partial<{ nickname: string; avatar: string; bio: string }>) {
		const user = await UserModel.findOneAndUpdate({ userId: uid }, { $set: payload }, { new: true, projection: { password: 0 } })
		if (!user) throw new Error('User not found')
		return user
	}

	async adminUpdateProfile(uid: number, payload: Partial<{ username: string; nickname: string; avatar: string; bio: string; roles: string[] }>) {
		const user = await UserModel.findOneAndUpdate({ userId: uid }, { $set: payload }, { new: true, projection: { password: 0 } })
		if (!user) throw new Error('User not found')
		
		// Update RBAC binding if roles changed
		if (payload.roles) {
			await RbacUserBindingModel.updateOne({ userId: uid }, { $set: { roles: payload.roles } }, { upsert: true })
		}
		
		return user
	}

	signToken(payload: { uid: number; uuid: string; roles: string[] }) {
		return jwt.sign(payload as any, ENV.JWT_SECRET as unknown as jwt.Secret, { expiresIn: ENV.JWT_EXPIRES_IN } as jwt.SignOptions)
	}

	private async upsertVerificationCode(params: {
		identifier: string;
		type: VerificationCodeType;
		email: string;
		metadata?: Record<string, unknown>;
		cooldownSeconds?: number;
		expireMinutes?: number;
	}): Promise<{ isCooldown: boolean; code?: string }> {
		const { identifier, type } = params
		const cooldownSeconds = params.cooldownSeconds ?? DEFAULT_VERIFICATION_CODE_COOLDOWN_SECONDS
		const expireMinutes = params.expireMinutes ?? VERIFICATION_CODE_EXPIRATION_MINUTES

		const now = new Date()
		const existing = await UserVerificationCodeModel.findOne({ identifier, type })

		if (existing && now.getTime() - existing.lastSentAt.getTime() < cooldownSeconds * 1000) {
			return { isCooldown: true }
		}

		const code = generateNumericCode(6)
		const codeHash = await bcrypt.hash(code, ENV.BCRYPT_ROUNDS)
		const expiresAt = new Date(now.getTime() + expireMinutes * 60 * 1000)

		if (existing) {
			existing.codeHash = codeHash
			existing.email = params.email
			existing.metadata = params.metadata
			existing.expiresAt = expiresAt
			existing.lastSentAt = now
			existing.attemptCount = 0
			await existing.save()
		} else {
			await UserVerificationCodeModel.create({
				identifier,
				type,
				email: params.email,
				codeHash,
				metadata: params.metadata,
				expiresAt,
				lastSentAt: now,
				attemptCount: 0,
			})
		}

		return { isCooldown: false, code }
	}

	async sendRegistrationVerificationCode(email: string): Promise<{ success: boolean; isTimeout: boolean; message?: string }> {
		if (!ENV.REQUIRE_REGISTRATION_VERIFICATION) {
			return { success: false, isTimeout: false, message: 'Registration verification disabled' }
		}
		try {
			const emailLowerCase = email.toLowerCase()
			const { isCooldown, code } = await this.upsertVerificationCode({
				identifier: emailLowerCase,
				type: 'registration',
				email,
			})
			if (isCooldown) {
				return { success: true, isTimeout: true }
			}

		if (!code) {
			return { success: false, isTimeout: false, message: 'Failed to generate verification code' }
		}

		const html = renderEmailTemplate({
			mailHeading: 'Confirm your registration',
			mailText: `Use the verification code below to finish creating your account on MTLBooks. This one-time code expires in ${VERIFICATION_CODE_EXPIRATION_MINUTES} minutes.`,
			verificationCode: code,
		})

		await sendMail(email, 'MTLBooks • Registration verification code', {
			html,
			text: `Your verification code is ${code}. It expires in ${VERIFICATION_CODE_EXPIRATION_MINUTES} minutes.`,
		})
			return { success: true, isTimeout: false }
		} catch (error: any) {
			console.error('Failed to send registration verification code:', error)
			return { success: false, isTimeout: false, message: error?.message }
		}
	}

	async sendChangeEmailVerificationCode(uid: number, newEmail: string): Promise<{ success: boolean; isCoolingDown: boolean; message?: string }> {
		try {
			const newEmailLowerCase = newEmail.toLowerCase()
			const existingEmailOwner = await UserModel.findOne({ email: newEmailLowerCase })
			if (existingEmailOwner) {
				return { success: false, isCoolingDown: false, message: 'Email already in use' }
			}

		const { isCooldown, code } = await this.upsertVerificationCode({
				identifier: newEmailLowerCase,
				type: 'change-email',
				email: newEmail,
				metadata: { uid },
				cooldownSeconds: 120,
			})

			if (isCooldown) {
				return { success: true, isCoolingDown: true }
			}

		if (!code) {
			return { success: false, isCoolingDown: false, message: 'Failed to generate verification code' }
		}

		const html = renderEmailTemplate({
			mailHeading: 'Confirm your new email address',
			mailText: `We received a request to change the email for your MTLBooks account. Enter the verification code below to continue. This code expires in ${VERIFICATION_CODE_EXPIRATION_MINUTES} minutes.`,
			verificationCode: code,
		})

		await sendMail(newEmail, 'MTLBooks • Email change verification code', {
			html,
			text: `To confirm your new email address, use the verification code ${code}. It expires in ${VERIFICATION_CODE_EXPIRATION_MINUTES} minutes.`,
		})

			return { success: true, isCoolingDown: false }
		} catch (error: any) {
			console.error('Failed to send change email verification code:', error)
			return { success: false, isCoolingDown: false, message: error?.message }
		}
	}

	async sendChangePasswordVerificationCode(uid: number): Promise<{ success: boolean; isCoolingDown: boolean; message?: string }> {
		try {
			const user = await UserModel.findOne({ userId: uid })
			if (!user) return { success: false, isCoolingDown: false, message: 'User not found' }

		const { isCooldown, code } = await this.upsertVerificationCode({
				identifier: String(uid),
				type: 'change-password',
				email: user.email,
				metadata: { uid },
				cooldownSeconds: 120,
			})

			if (isCooldown) {
				return { success: true, isCoolingDown: true }
			}

		if (!code) {
			return { success: false, isCoolingDown: false, message: 'Failed to generate verification code' }
		}

		const html = renderEmailTemplate({
			mailHeading: 'Secure your account',
			mailText: `A request was made to change the password for your MTLBooks account. Use the verification code below to proceed. If you didn't request this, change your password immediately.`,
			verificationCode: code,
		})

		await sendMail(user.email, 'MTLBooks • Password change verification code', {
			html,
			text: `Use this verification code to change your password: ${code}. If you did not request this, please secure your account immediately.`,
		})

			return { success: true, isCoolingDown: false }
		} catch (error: any) {
			console.error('Failed to send change password verification code:', error)
			return { success: false, isCoolingDown: false, message: error?.message }
		}
	}

	private async verifyAndConsumeVerificationCode(params: { identifier: string; type: VerificationCodeType; code: string }): Promise<boolean> {
		const record = await UserVerificationCodeModel.findOne({ identifier: params.identifier, type: params.type })
		if (!record) return false
		const now = Date.now()
		if (record.expiresAt.getTime() < now) {
			await UserVerificationCodeModel.deleteOne({ _id: record._id })
			return false
		}
		const isMatch = await bcrypt.compare(params.code, record.codeHash)
		if (!isMatch) {
			record.attemptCount += 1
			await record.save()
			return false
		}
		await UserVerificationCodeModel.deleteOne({ _id: record._id })
		return true
	}

	async updateEmailWithVerification(params: { uid: number; oldEmail: string; newEmail: string; passwordHash: string; verificationCode: string }): Promise<boolean> {
		const user = await UserModel.findOne({ userId: params.uid })
		if (!user) throw new Error('User not found')
		if (user.email.toLowerCase() !== params.oldEmail.toLowerCase()) throw new Error('Old email mismatch')

		const isPasswordValid = await bcrypt.compare(params.passwordHash, user.password)
		if (!isPasswordValid) throw new Error('Invalid password')

		const newEmailLowerCase = params.newEmail.toLowerCase()
		const verificationPassed = await this.verifyAndConsumeVerificationCode({
			identifier: newEmailLowerCase,
			type: 'change-email',
			code: params.verificationCode,
		})

		if (!verificationPassed) throw new Error('Invalid or expired verification code')

		const duplicate = await UserModel.findOne({ email: newEmailLowerCase })
		if (duplicate && duplicate.userId !== user.userId) throw new Error('Email already in use')

		user.email = params.newEmail
		await user.save()
		return true
	}

	async updatePasswordWithVerification(params: { uid: number; oldPasswordHash: string; newPasswordHash: string; verificationCode: string }): Promise<boolean> {
		const user = await UserModel.findOne({ userId: params.uid })
		if (!user) throw new Error('User not found')

		const isPasswordValid = await bcrypt.compare(params.oldPasswordHash, user.password)
		if (!isPasswordValid) throw new Error('Invalid password')

		const verificationPassed = await this.verifyAndConsumeVerificationCode({
			identifier: String(params.uid),
			type: 'change-password',
			code: params.verificationCode,
		})

		if (!verificationPassed) throw new Error('Invalid or expired verification code')

		user.password = await bcrypt.hash(params.newPasswordHash, ENV.BCRYPT_ROUNDS)
		await user.save()
		return true
	}

	private generateInvitationCodeString(): string {
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
		const segment = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join('')
		return `KIRA-${segment()}-${segment()}`
	}

	async createInvitationCode(uid: number, uuid: string) {
		const code = this.generateInvitationCodeString()
		const now = Date.now()

		const invitation = await InvitationCodeModel.create({
			creatorUid: uid,
			creatorUUID: uuid,
			invitationCode: code,
			generationDateTime: now,
			isPending: true,
			disabled: false,
		})

		return invitation
	}

	async getInvitationCodes(uid: number) {
		return InvitationCodeModel.find({ creatorUid: uid }).sort({ generationDateTime: -1 }).lean()
	}

	async checkInvitationCodeAvailability(code: string) {
		const normalized = code.trim().toUpperCase()
		const invitation = await InvitationCodeModel.findOne({ invitationCode: normalized }).lean()
		if (!invitation) return { success: true, isAvailableInvitationCode: false }
		const available = invitation.isPending && !invitation.disabled && !invitation.assigneeUid
		return { success: true, isAvailableInvitationCode: available }
	}

	async useInvitationCode(code: string, registrantUid: number, registrantUUID: string) {
		const normalized = code.trim().toUpperCase()
		const invitation = await InvitationCodeModel.findOne({ invitationCode: normalized })
		if (!invitation) throw new Error('Invitation code not found')
		if (invitation.disabled || !invitation.isPending || invitation.assigneeUid) throw new Error('Invitation code already used')

		invitation.isPending = false
		invitation.disabled = true
		invitation.assigneeUid = registrantUid
		invitation.assigneeUUID = registrantUUID
		invitation.usedDateTime = Date.now()
		await invitation.save()
	}

	// Email verification
	async requestEmailVerification(email: string) {
		const user = await UserModel.findOne({ email })
		if (!user) throw new Error('User not found')
		const token = crypto.randomBytes(20).toString('hex')
		user.emailVerifyToken = token
		user.emailVerifyTokenExpiresAt = new Date(Date.now() + 1000*60*30)
		await user.save()
		const html = renderEmailTemplate({
			mailHeading: 'Verify your email',
			mailText: 'Use the verification code below to confirm your email address.',
			verificationCode: token,
		})
		await sendMail(email, 'MTLBooks • Email verification', {
			html,
			text: `Use this verification code to confirm your email address: ${token}`,
		})
		return true
	}

	async verifyEmail(token: string) {
		const user = await UserModel.findOne({ emailVerifyToken: token, emailVerifyTokenExpiresAt: { $gt: new Date() } })
		if (!user) throw new Error('Invalid or expired token')
		user.isEmailVerified = true
		user.emailVerifyToken = undefined as any
		user.emailVerifyTokenExpiresAt = undefined as any
		await user.save()
		return true
	}

	// Password reset
	async requestPasswordReset(email: string) {
		const user = await UserModel.findOne({ email })
		if (!user) throw new Error('User not found')
		const token = crypto.randomBytes(20).toString('hex')
		user.passwordResetToken = token
		user.passwordResetTokenExpiresAt = new Date(Date.now() + 1000*60*30)
		await user.save()
		const html = renderEmailTemplate({
			mailHeading: 'Password reset request',
			mailText: 'Enter the verification code below to reset your password. If you did not request this, please secure your account.',
			verificationCode: token,
		})
		await sendMail(email, 'MTLBooks • Password reset verification', {
			html,
			text: `Use this verification code to reset your password: ${token}`,
		})
		return true
	}

	async resetPassword(token: string, newPassword: string) {
		const user = await UserModel.findOne({ passwordResetToken: token, passwordResetTokenExpiresAt: { $gt: new Date() } })
		if (!user) throw new Error('Invalid or expired token')
		user.password = await bcrypt.hash(newPassword, ENV.BCRYPT_ROUNDS)
		user.passwordResetToken = undefined as any
		user.passwordResetTokenExpiresAt = undefined as any
		await user.save()
		return true
	}

	async changePassword(uid: number, oldPassword: string, newPassword: string) {
		const user = await UserModel.findOne({ userId: uid })
		if (!user) throw new Error('User not found')
		const ok = await bcrypt.compare(oldPassword, user.password)
		if (!ok) throw new Error('Invalid credentials')
		user.password = await bcrypt.hash(newPassword, ENV.BCRYPT_ROUNDS)
		await user.save()
		return true
	}

	// TOTP
	async setupTotp(uid: number) {
		const user = await UserModel.findOne({ userId: uid })
		if (!user) throw new Error('User not found')
		if (user.is2FAEnabled && user.twoFactorType === 'totp' && user.totpSecret) {
			return { alreadyEnabled: true as const }
		}
		const label = user.email || `user:${uid}`
		const { secret, otpauth } = totpService.generateSecret(label)
		user.totpSecret = secret
		user.is2FAEnabled = false
		user.totpBackupCodes = []
		user.totpRecoveryCode = undefined as any
		user.totpEnabledAt = undefined as any
		await user.save()
		return { alreadyEnabled: false as const, otpauth }
	}

	async confirmTotp(uid: number, code: string) {
		const user = await UserModel.findOne({ userId: uid })
		if (!user || !user.totpSecret) throw new Error('TOTP not set')
		const ok = totpService.verify(code, user.totpSecret)
		if (!ok) throw new Error('Invalid TOTP code')

		const backupCodes = this.generateBackupCodes()
		const recoveryCode = this.generateRandomCode(RECOVERY_CODE_LENGTH)
		const backupCodeHashes = await Promise.all(backupCodes.map(code => bcrypt.hash(code, ENV.BCRYPT_ROUNDS)))
		const recoveryCodeHash = await bcrypt.hash(recoveryCode, ENV.BCRYPT_ROUNDS)

		user.totpBackupCodes = backupCodeHashes
		user.totpRecoveryCode = recoveryCodeHash
		user.is2FAEnabled = true
		user.twoFactorType = 'totp'
		user.totpEnabledAt = new Date()
		await user.save()

		return { backupCodes, recoveryCode }
	}

	async deleteTotp(uid: number, passwordHash: string, otp: string) {
		const user = await UserModel.findOne({ userId: uid })
		if (!user || !user.totpSecret) throw new Error('TOTP not set')

		const passwordMatches = await bcrypt.compare(passwordHash, user.password)
		if (!passwordMatches) throw new Error('Invalid password')

		const otpValid = totpService.verify(otp, user.totpSecret)
		if (!otpValid) throw new Error('Invalid TOTP code')

		user.totpSecret = undefined as any
		user.is2FAEnabled = false
		user.twoFactorType = 'none'
		user.totpBackupCodes = []
		user.totpRecoveryCode = undefined as any
		user.totpEnabledAt = undefined as any
		await user.save()
		return true
	}

	async getTwoFactorStatusByUid(uid: number) {
		const user = await UserModel.findOne({ userId: uid })
		if (!user) return { have2FA: false as const }
		if (user.is2FAEnabled && user.totpSecret && user.twoFactorType === 'totp') {
			return {
				have2FA: true as const,
				type: 'totp' as const,
				totpCreationDateTime: user.totpEnabledAt ? user.totpEnabledAt.getTime() : undefined,
			}
		}
		if (user.is2FAEnabled && user.twoFactorType === 'email') {
			return { have2FA: true as const, type: 'email' as const }
		}
		return { have2FA: false as const }
	}

	async getTwoFactorStatusByEmail(email: string) {
		const trimmedEmail = email.trim()
		const user = await UserModel.findOne({ email: new RegExp(`^${trimmedEmail}$`, 'i') })
		if (!user) return { have2FA: false as const, type: 'none' as const }
		return this.getTwoFactorStatusByUid(user.userId)
	}

	async handleOAuthLogin(profile: OAuthProfile & { email: string }): Promise<
		| { user: any; token: string; requireTotp?: false }
		| { requireTotp: true; totpToken: string }
	> {
		const normalizedEmail = profile.email.toLowerCase()

		let user = await UserModel.findOne({
			oauthAccounts: {
				$elemMatch: { provider: profile.provider, providerId: profile.providerId },
			},
		})

		if (!user) {
			user = await this.findUserByEmailInsensitive(normalizedEmail)
			if (user) {
				const alreadyLinked = user.oauthAccounts?.some(account => account.provider === profile.provider)
				if (!alreadyLinked) {
					if (!user.oauthAccounts || user.oauthAccounts.length === 0) {
						user.oauthAccounts = [this.createOAuthAccountEntry(profile, normalizedEmail)] as any
					} else {
						(user.oauthAccounts as any).push(this.createOAuthAccountEntry(profile, normalizedEmail))
					}
				}
			}
		}

		if (!user) {
			const userId = await getNextSequence('userId')
			const uuid = uuidv4()
			const usernameBase = profile.name || normalizedEmail.split('@')[0] || 'user'
			const username = await this.generateUniqueUsername(usernameBase)
			const passwordSeed = this.generateRandomCode(32, RANDOM_PASSWORD_CHARSET)
			const passwordHash = await bcrypt.hash(passwordSeed, ENV.BCRYPT_ROUNDS)

			user = await UserModel.create({
				userId,
				uuid,
				username,
				email: normalizedEmail,
				password: passwordHash,
				nickname: profile.name || username,
				avatar: profile.avatar,
				isEmailVerified: true,
				twoFactorType: 'none',
				roles: ['user'],
				permissions: [],
				oauthAccounts: [this.createOAuthAccountEntry(profile, normalizedEmail)],
				lastLoginAt: new Date(),
			} as any)

			await RbacUserBindingModel.updateOne(
				{ userId, uuid },
				{ $setOnInsert: { roles: ['user'], permissions: [] } },
				{ upsert: true }
			)
		} else {
			if (!user.oauthAccounts?.some(account => account.provider === profile.provider && account.providerId === profile.providerId)) {
				if (!user.oauthAccounts || user.oauthAccounts.length === 0) {
					user.oauthAccounts = [this.createOAuthAccountEntry(profile, normalizedEmail)] as any
				} else {
					(user.oauthAccounts as any).push(this.createOAuthAccountEntry(profile, normalizedEmail))
				}
			}
			if (profile.avatar && !user.avatar) {
				user.avatar = profile.avatar
			}
			if (profile.name && !user.nickname) {
				user.nickname = profile.name
			}
			user.isEmailVerified = true
		}

		if (user.is2FAEnabled && user.twoFactorType === 'totp' && user.totpSecret) {
			await user.save()
			const totpToken = this.createOauthTotpToken({ uid: user.userId, uuid: user.uuid, provider: profile.provider, email: user.email })
			return { requireTotp: true as const, totpToken }
		}

		user.lastLoginAt = new Date()
		await user.save()

		const token = this.signToken({ uid: user.userId, uuid: user.uuid, roles: user.roles })
		return { user, token }
	}

	async linkOAuthAccount(uid: number, profile: OAuthProfile & { email: string }) {
		const user = await UserModel.findOne({ userId: uid })
		if (!user) throw new Error('User not found')

		const normalizedEmail = profile.email.toLowerCase()
		const existing = await UserModel.findOne({
			oauthAccounts: {
				$elemMatch: { provider: profile.provider, providerId: profile.providerId },
			},
		})
		if (existing && existing.userId !== uid) {
			throw new Error('OAUTH_ACCOUNT_IN_USE')
		}

		const emailMatches = user.email.toLowerCase() === normalizedEmail
		if (!emailMatches) {
			throw new Error('EMAIL_MISMATCH')
		}

		const alreadyLinked = user.oauthAccounts?.some(
			account => account.provider === profile.provider
		)
		if (!alreadyLinked) {
			if (!user.oauthAccounts || user.oauthAccounts.length === 0) {
				user.oauthAccounts = [this.createOAuthAccountEntry(profile, normalizedEmail)] as any
			} else {
				(user.oauthAccounts as any).push(this.createOAuthAccountEntry(profile, normalizedEmail))
			}
		}

		if (profile.avatar && !user.avatar) {
			user.avatar = profile.avatar
		}
		if (profile.name && !user.nickname) {
			user.nickname = profile.name
		}
		user.isEmailVerified = true
		await user.save()

		const token = this.signToken({ uid: user.userId, uuid: user.uuid, roles: user.roles })
		return { user, token }
	}

	async unlinkOAuthAccount(uid: number, provider: OAuthProvider) {
		const user = await UserModel.findOne({ userId: uid })
		if (!user) throw new Error('User not found')
		const accounts = user.oauthAccounts || []
		if (!accounts.some(account => account.provider === provider)) {
			throw new Error('OAUTH_ACCOUNT_NOT_FOUND')
		}
		if (accounts.length <= 1 && !user.password) {
			throw new Error('CANNOT_REMOVE_LAST_LOGIN_METHOD')
		}
		user.oauthAccounts = accounts.filter(account => account.provider !== provider) as any
		await user.save()
		const token = this.signToken({ uid: user.userId, uuid: user.uuid, roles: user.roles })
		return { user, token }
	}

	async finalizeOAuthTotp(params: { totpToken: string; clientOtp: string }) {
		let payload: any
		try {
			payload = jwt.verify(params.totpToken, ENV.JWT_SECRET as unknown as jwt.Secret)
		} catch {
			throw new Error('Invalid or expired token')
		}
		if (!payload || payload.purpose !== 'oauth-totp') throw new Error('Invalid token')
		const user = await UserModel.findOne({ userId: payload.uid, uuid: payload.uuid })
		if (!user || !user.totpSecret) throw new Error('User not found or TOTP not set')

		const ok = totpService.verify(params.clientOtp, user.totpSecret)
		if (!ok) throw new Error('Invalid TOTP code')

		user.lastLoginAt = new Date()
		await user.save()
		const token = this.signToken({ uid: user.userId, uuid: user.uuid, roles: user.roles })
		return { user, token }
	}

	// Admin
	async adminListUsers(query: { page?: number; limit?: number; q?: string; role?: string; blocked?: boolean }) {
		const page = Math.max(1, query.page || 1)
		const limit = Math.min(100, Math.max(1, query.limit || 20))
		const skip = (page - 1) * limit
		const filter: any = {}
		if (query.q) filter.$or = [{ username: new RegExp(query.q, 'i') }, { email: new RegExp(query.q, 'i') }]
		if (typeof query.blocked === 'boolean') filter.isBlocked = query.blocked
		if (query.role) filter.roles = query.role
		const [items, total] = await Promise.all([
			UserModel.find(filter, '-password').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
			UserModel.countDocuments(filter)
		])
		return { items, total, page, limit }
	}

	async adminBlockUser(uid: number, reason?: string) {
		await UserModel.updateOne({ userId: uid }, { $set: { isBlocked: true, blockReason: reason || 'blocked' } })
		return true
	}
	async adminUnblockUser(uid: number) {
		await UserModel.updateOne({ userId: uid }, { $set: { isBlocked: false, blockReason: null } })
		return true
	}
	async adminUpdateRoles(uid: number, roles: string[]) {
		await UserModel.updateOne({ userId: uid }, { $set: { roles } })
		await RbacUserBindingModel.updateOne({ userId: uid }, { $set: { roles } }, { upsert: true })
		return true
	}

	// RBAC helpers (placeholder; to be upgraded from KIRAKIRA-Rosales)
	hasRole(user: { roles: string[] }, role: string): boolean { return user.roles?.includes(role) }
	hasPermission(user: { permissions: string[] }, perm: string): boolean { return user.permissions?.includes(perm) }
}

export const userService = new UserService() 