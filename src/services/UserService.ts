import { UserModel } from '../infrastructure/models/User.js'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { ENV } from '../config/environment.js'
import { v4 as uuidv4 } from 'uuid'
import { RbacUserBindingModel } from '../infrastructure/models/RbacUserBinding.js'
import crypto from 'crypto'
import { emailService } from './EmailService.js'
import { totpService } from './TotpService.js'

export class UserService {
	async register(params: { username: string; email: string; password?: string; passwordHash?: string; nickname?: string }): Promise<{ token: string; user: any }> {
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

		// Create default RBAC user binding with 'user' role
		await RbacUserBindingModel.updateOne(
			{ userId, uuid },
			{ $setOnInsert: { roles: ['user'], permissions: [] } },
			{ upsert: true }
		)

		const token = this.signToken({ uid: user.userId, uuid: user.uuid, roles: user.roles })
		return { token, user }
	}

	async login(params: { usernameOrEmail?: string; email?: string; username?: string; password?: string; passwordHash?: string }): Promise<{ token: string; user: any }> {
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

	// Email verification
	async requestEmailVerification(email: string) {
		const user = await UserModel.findOne({ email })
		if (!user) throw new Error('User not found')
		const token = crypto.randomBytes(20).toString('hex')
		user.emailVerifyToken = token
		user.emailVerifyTokenExpiresAt = new Date(Date.now() + 1000*60*30)
		await user.save()
		await emailService.send(email, 'Verify your email', `<p>Token: ${token}</p>`)
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
		await emailService.send(email, 'Password reset', `<p>Token: ${token}</p>`)
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
		const { secret, otpauth } = totpService.generateSecret(`user:${uid}`)
		user.totpSecret = secret
		await user.save()
		return { otpauth }
	}

	async verifyTotp(uid: number, code: string) {
		const user = await UserModel.findOne({ userId: uid })
		if (!user || !user.totpSecret) throw new Error('TOTP not set')
		const ok = totpService.verify(code, user.totpSecret)
		if (!ok) throw new Error('Invalid TOTP code')
		user.is2FAEnabled = true
		await user.save()
		return true
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