import type { FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import { userService } from '../../services/UserService.js'
import { ENV } from '../../config/environment.js'

function setCookies(reply: FastifyReply, data: { token: string; email?: string; uid: number; uuid: string }) {
	const isSecure = process.env.NODE_ENV !== 'development'
	const cookieOption = {
		httpOnly: true,
		secure: false, // Force false for localhost development
		sameSite: 'lax' as const, // Use 'lax' for cross-site cookies in development
		maxAge: 60 * 60 * 24 * 365,
		path: '/',
	}
	if (data.token) reply.setCookie('token', data.token, cookieOption)
	if (data.email) reply.setCookie('email', data.email, cookieOption)
	reply.setCookie('uid', String(data.uid), cookieOption)
	reply.setCookie('uuid', data.uuid, cookieOption)
}

function clearCookies(reply: FastifyReply) {
	const opt = { path: '/' }
	reply.clearCookie('token', opt)
	reply.clearCookie('email', opt)
	reply.clearCookie('uid', opt)
	reply.clearCookie('uuid', opt)
}

export const UserController = {
	// POST /user/registering - No RBAC (public)
	registering: async (request: FastifyRequest, reply: FastifyReply) => {
		const body = (request.body as any) || {}
		const { email, verificationCode, passwordHash, passwordHint, invitationCode, username, userNickname } = body
		try {
			const result = await userService.register({ username, email, passwordHash, nickname: userNickname })
			setCookies(reply, { token: result.token, email, uid: result.user.userId, uuid: result.user.uuid })
			return { success: true, UUID: result.user.uuid, uid: result.user.userId, token: result.token, message: 'OK' }
		} catch (e: any) {
			return reply.code(400).send({ success: false, message: e?.message || 'Registration failed' })
		}
	},

	// POST /user/login - No RBAC (public)
	login: async (request: FastifyRequest, reply: FastifyReply) => {
		const body = (request.body as any) || {}
		const { email, passwordHash, clientOtp, verificationCode } = body
		try {
			const result = await userService.login({ email, passwordHash })
			setCookies(reply, { token: result.token, email: result.user.email, uid: result.user.userId, uuid: result.user.uuid })
			return { success: true, email: result.user.email, UUID: result.user.uuid, uid: result.user.userId, token: result.token, passwordHint: '', message: 'OK' }
		} catch {
			return reply.code(401).send({ success: false, message: 'Email or password incorrect' })
		}
	},

	// GET /user/check - No RBAC (public)
	check: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const token = cookies?.token as string | undefined
		const uid = cookies?.uid ? Number(cookies.uid) : undefined
		if (!token || !uid) return { success: true, userTokenOk: false }
		try {
			const payload: any = jwt.verify(token, ENV.JWT_SECRET as unknown as jwt.Secret)
			if (payload && typeof payload.uid === 'number' && payload.uid === uid) {
				return { success: true, userTokenOk: true, uid, roles: payload.roles || [] }
			}
			return { success: true, userTokenOk: false }
		} catch {
			return { success: true, userTokenOk: false }
		}
	},

	// GET /user/logout - RBAC protected via preHandler
	logout: async (_request: FastifyRequest, reply: FastifyReply) => {
		clearCookies(reply)
		return { success: true, message: 'OK' }
	},

	// POST /user/self - RBAC protected via preHandler
	self: async (request: FastifyRequest) => {
		const body = (request.body as any) || {}
		const cookies: any = request.cookies || {}
		const uid = (cookies?.uid && Number(cookies.uid)) || body?.uid
		const token = cookies?.token || body?.token
		
		if (!uid || !token) return { success: false, message: 'Not logged in' }
		
		try {
			jwt.verify(token, ENV.JWT_SECRET as unknown as jwt.Secret)
			const user = await userService.getProfile(Number(uid))
			return {
				success: true,
				result: {
					uid: user.userId,
					email: user.email,
					roles: user.roles,
					username: user.username,
					userNickname: user.nickname,
					userCreateDateTime: (user as any).createdAt ? new Date((user as any).createdAt).getTime() : Date.now(),
					avatar: (user as any).avatar || '',
					gender: (user as any).gender || '',
					signature: (user as any).bio || '',
					label: (user as any).label || []
				}
			}
		} catch {
			return { success: false, message: 'Invalid session' }
		}
	},

	// GET /user/info - Admin RBAC protected via preHandler
	info: async (request: FastifyRequest) => {
		const uid = Number((request.query as any)?.uid)
		if (!uid) return { success: false, message: 'Missing parameter' }
		try {
			const user = await userService.getProfile(uid)
			return { success: true, data: { uid: user.userId, email: user.email, roles: user.roles, username: user.username, userNickname: user.nickname } }
		} catch {
			return { success: false, message: 'User not found' }
		}
	},

	// GET /user/exists - Admin RBAC protected via preHandler
	exists: async (request: FastifyRequest) => {
		const uid = Number((request.query as any)?.uid)
		if (!uid) return { success: true, exists: false }
		try {
			const user = await userService.getProfile(uid)
			return { success: true, exists: !!user }
		} catch {
			return { success: true, exists: false }
		}
	},

	// POST /user/update/info - RBAC protected via preHandler
	updateInfo: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uid = cookies?.uid ? Number(cookies.uid) : undefined
		if (!uid) return { success: false, message: 'Not logged in' }
		
		const data = (request.body as any) || {}
		const updated = await userService.updateProfile(uid, {
			nickname: data?.userNickname,
			avatar: data?.avatar,
			bio: data?.signature,
		})
		return { success: true, data: { uid: updated.userId, userNickname: updated.nickname, avatar: (updated as any).avatar, signature: (updated as any).bio } }
	},

	// POST /user/createTotpAuthenticator - RBAC protected via preHandler
	createTotp: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uid = cookies?.uid ? Number(cookies.uid) : undefined
		if (!uid) return { success: false, message: 'Not logged in' }
		
		const { otpauth } = await userService.setupTotp(uid)
		return { success: true, otpauth }
	},

	// POST /user/confirmUserTotpAuthenticator - RBAC protected via preHandler
	confirmTotp: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uid = cookies?.uid ? Number(cookies.uid) : undefined
		if (!uid) return { success: false, message: 'Not logged in' }
		
		const { clientOtp } = (request.body as any) || {}
		await userService.verifyTotp(uid, clientOtp)
		return { success: true }
	},

	// Email 2FA endpoints - RBAC protected via preHandler
	createEmailAuthenticator: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uuid = cookies?.uuid
		const token = cookies?.token
		
		if (!uuid || !token) {
			return { success: false, message: 'Authentication required' }
		}
		
		try {
			// TODO: Implement proper email 2FA creation logic
			// For now, return a stub response
			return { 
				success: false, 
				isExists: false, 
				message: 'Email 2FA creation not yet implemented' 
			}
		} catch (error) {
			console.error('Create email authenticator error:', error)
			return { success: false, message: 'Failed to create email authenticator' }
		}
	},

	sendUserEmailAuthenticator: async (request: FastifyRequest) => {
		const body = request.body as any
		const { email, passwordHash, clientLanguage } = body
		
		if (!email || !passwordHash) {
			return { success: false, message: 'Email and password required' }
		}
		
		try {
			// TODO: Implement proper email verification code sending
			// For now, return a stub response
			return { 
				success: false, 
				message: 'Email verification code sending not yet implemented' 
			}
		} catch (error) {
			console.error('Send email authenticator error:', error)
			return { success: false, message: 'Failed to send email verification code' }
		}
	},

	sendDeleteUserEmailAuthenticator: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uuid = cookies?.uuid
		const token = cookies?.token
		const body = request.body as any
		const { clientLanguage } = body
		
		if (!uuid || !token) {
			return { success: false, message: 'Authentication required' }
		}
		
		try {
			// TODO: Implement proper email deletion verification code sending
			// For now, return a stub response
			return { 
				success: false, 
				message: 'Email deletion verification code sending not yet implemented' 
			}
		} catch (error) {
			console.error('Send delete email authenticator error:', error)
			return { success: false, message: 'Failed to send deletion verification code' }
		}
	},

	deleteUserEmailAuthenticator: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uuid = cookies?.uuid
		const token = cookies?.token
		const body = request.body as any
		const { passwordHash, verificationCode } = body
		
		if (!uuid || !token) {
			return { success: false, message: 'Authentication required' }
		}
		
		if (!passwordHash || !verificationCode) {
			return { success: false, message: 'Password and verification code required' }
		}
		
		try {
			// TODO: Implement proper email 2FA deletion logic
			// For now, return a stub response
			return { 
				success: false, 
				message: 'Email 2FA deletion not yet implemented' 
			}
		} catch (error) {
			console.error('Delete email authenticator error:', error)
			return { success: false, message: 'Failed to delete email authenticator' }
		}
	},

	checkUserHave2FAByEmail: async (request: FastifyRequest) => {
		const query = request.query as any
		const email = query.email
		
		if (!email) {
			return { success: false, have2FA: false, message: 'Email required' }
		}
		
		try {
			// TODO: Implement proper 2FA check by email
			// For now, return a stub response
			return { 
				success: true, 
				have2FA: false, 
				message: '2FA check by email not yet implemented' 
			}
		} catch (error) {
			console.error('Check 2FA by email error:', error)
			return { success: false, have2FA: false, message: 'Failed to check 2FA status' }
		}
	},

	checkUserHave2FAByUUID: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uuid = cookies?.uuid
		const token = cookies?.token
		
		if (!uuid || !token) {
			return { success: false, have2FA: false, message: 'Authentication required' }
		}
		
		try {
			// TODO: Implement proper 2FA check by UUID
			// For now, return a stub response
			return { 
				success: true, 
				have2FA: false, 
				message: '2FA check by UUID not yet implemented' 
			}
		} catch (error) {
			console.error('Check 2FA by UUID error:', error)
			return { success: false, have2FA: false, message: 'Failed to check 2FA status' }
		}
	},

	// DELETE /user/deleteTotpAuthenticatorByTotpVerificationCodeController - RBAC protected via preHandler
	deleteTotpByCode: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uuid = cookies?.uuid
		const token = cookies?.token
		const body = request.body as any
		const { clientOtp, passwordHash } = body
		
		if (!uuid || !token) {
			return { success: false, message: 'Authentication required' }
		}
		
		if (!clientOtp || !passwordHash) {
			return { success: false, message: 'TOTP code and password required' }
		}
		
		try {
			// TODO: Implement proper TOTP deletion logic
			// For now, return a stub response
			return { 
				success: false, 
				message: 'TOTP deletion not yet implemented' 
			}
		} catch (error) {
			console.error('Delete TOTP authenticator error:', error)
			return { success: false, message: 'Failed to delete TOTP authenticator' }
		}
	},

	// Settings & others (stubs) - RBAC protected via preHandler
	getUserSettings: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uid = cookies?.uid ? Number(cookies.uid) : undefined
		const body = request.body as any
		const requestUid = body?.uid ? Number(body.uid) : undefined
		
		const targetUid = uid || requestUid
		if (!targetUid) return { success: false, message: 'User ID required' }
		
		try {
			const UserSettingsModel = (await import('../../infrastructure/models/UserSettings.js')).UserSettingsModel
			const userSettings = await UserSettingsModel.findOne({ uid: targetUid }).lean()
			
			if (userSettings) {
				return { 
					success: true, 
					message: 'User settings retrieved successfully',
					userSettings: {
						uid: userSettings.uid,
						editDateTime: userSettings.editDateTime || Date.now(),
						enableCookie: userSettings.enableCookie,
						themeType: userSettings.themeType,
						themeColor: userSettings.themeColor,
						themeColorCustom: userSettings.themeColorCustom,
						wallpaper: userSettings.wallpaper,
						coloredSideBar: userSettings.coloredSideBar,
						dataSaverMode: userSettings.dataSaverMode,
						noSearchRecommendations: userSettings.noSearchRecommendations,
						noRelatedVideos: userSettings.noRelatedVideos,
						noRecentSearch: userSettings.noRecentSearch,
						noViewHistory: userSettings.noViewHistory,
						openInNewWindow: userSettings.openInNewWindow,
						currentLocale: userSettings.currentLocale,
						timezone: userSettings.timezone,
						unitSystemType: userSettings.unitSystemType,
						devMode: userSettings.devMode,
						showCssDoodle: userSettings.showCssDoodle,
						sharpAppearanceMode: userSettings.sharpAppearanceMode,
						flatAppearanceMode: userSettings.flatAppearanceMode,
						userPrivaryVisibilitiesSetting: userSettings.userPrivaryVisibilitiesSetting || [],
						userLinkedAccountsVisibilitiesSetting: userSettings.userLinkedAccountsVisibilitiesSetting || [],
						userWebsitePrivacySetting: userSettings.userWebsitePrivacySetting
					}
				}
			} else {
				// Return default settings if none exist
				return { 
					success: true, 
					message: 'Default user settings',
					userSettings: {
						uid: targetUid,
						editDateTime: Date.now(),
						enableCookie: true,
						themeType: 'system',
						themeColor: '#3b82f6',
						themeColorCustom: '',
						wallpaper: '',
						coloredSideBar: true,
						dataSaverMode: 'standard',
						noSearchRecommendations: false,
						noRelatedVideos: false,
						noRecentSearch: false,
						noViewHistory: false,
						openInNewWindow: false,
						currentLocale: 'en',
						timezone: 'UTC',
						unitSystemType: 'metric',
						devMode: false,
						showCssDoodle: false,
						sharpAppearanceMode: false,
						flatAppearanceMode: false,
						userPrivaryVisibilitiesSetting: [],
						userLinkedAccountsVisibilitiesSetting: [],
						userWebsitePrivacySetting: 'public'
					}
				}
			}
		} catch (error) {
			console.error('Get user settings error:', error)
			return { success: false, message: 'Failed to retrieve user settings' }
		}
	},

	updateUserSettings: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uid = cookies?.uid ? Number(cookies.uid) : undefined
		
		if (!uid) return { success: false, message: 'User ID required' }
		
		const body = request.body as any
		const now = Date.now()
		
		try {
			const UserSettingsModel = (await import('../../infrastructure/models/UserSettings.js')).UserSettingsModel
			
			const updateData = {
				...body,
				editDateTime: now
			}
			
			const userSettings = await UserSettingsModel.findOneAndUpdate(
				{ uid },
				{ $set: updateData },
				{ new: true, upsert: true }
			).lean()
			
			return { 
				success: true, 
				message: 'User settings updated successfully',
				userSettings: {
					uid: userSettings.uid,
					editDateTime: userSettings.editDateTime,
					enableCookie: userSettings.enableCookie,
					themeType: userSettings.themeType,
					themeColor: userSettings.themeColor,
					themeColorCustom: userSettings.themeColorCustom,
					wallpaper: userSettings.wallpaper,
					coloredSideBar: userSettings.coloredSideBar,
					dataSaverMode: userSettings.dataSaverMode,
					noSearchRecommendations: userSettings.noSearchRecommendations,
					noRelatedVideos: userSettings.noRelatedVideos,
					noRecentSearch: userSettings.noRecentSearch,
					noViewHistory: userSettings.noViewHistory,
					openInNewWindow: userSettings.openInNewWindow,
					currentLocale: userSettings.currentLocale,
					timezone: userSettings.timezone,
					unitSystemType: userSettings.unitSystemType,
					devMode: userSettings.devMode,
					showCssDoodle: userSettings.showCssDoodle,
					sharpAppearanceMode: userSettings.sharpAppearanceMode,
					flatAppearanceMode: userSettings.flatAppearanceMode,
					userPrivaryVisibilitiesSetting: userSettings.userPrivaryVisibilitiesSetting || [],
					userLinkedAccountsVisibilitiesSetting: userSettings.userLinkedAccountsVisibilitiesSetting || [],
					userWebsitePrivacySetting: userSettings.userWebsitePrivacySetting
				}
			}
		} catch (error) {
			console.error('Update user settings error:', error)
			return { success: false, message: 'Failed to update user settings' }
		}
	},
	requestSendVerificationCode: async () => ({ success: true }),
	createInvitationCode: async () => ({ success: false, message: 'Not implemented' }),
	getMyInvitationCode: async () => ({ success: false, codes: [] }),
	checkInvitationCode: async () => ({ success: false, available: false }),
	requestSendChangeEmailVerificationCode: async () => ({ success: false }),
	requestSendChangePasswordVerificationCode: async () => ({ success: false }),
	updateUserEmail: async () => ({ success: false }),
	updateUserPassword: async () => ({ success: false }),
	checkUsername: async (request: FastifyRequest) => {
		const username = (request.query as any)?.username as string
		if (!username) return { success: true, available: false }
		try {
			const exists = await (await import('../../infrastructure/models/User.js')).UserModel.findOne({ username }).lean()
			return { success: true, available: !exists }
		} catch {
			return { success: true, available: false }
		}
	},
	getBlockedUser: async () => ({ success: true, data: [] }),
	adminGetUserInfo: async (request: FastifyRequest) => {
		const query = request.query as any
		const params: {
			page?: number;
			limit?: number;
			q?: string;
			role?: string;
			blocked?: boolean;
		} = {
			page: query.page ? Number(query.page) : 1,
			limit: query.pageSize ? Number(query.pageSize) : 50
		}
		
		if (query.q) params.q = query.q
		if (query.role) params.role = query.role
		if (query.blocked !== undefined) params.blocked = query.blocked === 'true'
		
		try {
			const result = await userService.adminListUsers(params)
			return { 
				success: true, 
				result: result.items.map(user => ({
					uid: user.userId,
					UUID: user.uuid,
					username: user.username,
					userNickname: user.nickname,
					email: user.email,
					userCreateDateTime: (user as any).createdAt ? new Date((user as any).createdAt).getTime() : Date.now(),
					roles: user.roles,
					avatar: (user as any).avatar || '',
					userBannerImage: '',
					signature: (user as any).bio || '',
					gender: '',
					label: [],
					editDateTime: (user as any).updatedAt ? new Date((user as any).updatedAt).getTime() : Date.now(),
					editOperatorUUID: 'system',
					isUpdatedAfterReview: false
				})),
				totalCount: result.total
			}
		} catch (error) {
			console.error('Admin getUserInfo error:', error)
			return { success: false, message: 'Failed to fetch users' }
		}
	},
	// Admin methods
	adminEditUserInfo: async (request: FastifyRequest) => {
		const body = request.body as any
		const { uid, userInfo } = body
		
		if (!uid) return { success: false, message: 'Missing user ID' }
		
		try {
			const updated = await userService.adminUpdateProfile(uid, userInfo)
			return { success: true, message: 'User updated successfully' }
		} catch (error) {
			console.error('Admin edit user error:', error)
			return { success: false, message: 'Failed to update user' }
		}
	},

	approveUserInfo: async (request: FastifyRequest) => {
		const body = request.body as any
		const { UUID } = body
		
		if (!UUID) return { success: false, message: 'Missing user UUID' }
		
		try {
			// TODO: Implement user info approval logic
			return { success: true, message: 'User info approved' }
		} catch (error) {
			console.error('Approve user info error:', error)
			return { success: false, message: 'Failed to approve user info' }
		}
	},

	adminClearUserInfo: async (request: FastifyRequest) => {
		const body = request.body as any
		const { uid } = body
		
		if (!uid) return { success: false, message: 'Missing user ID' }
		
		try {
			// TODO: Implement user info clearing logic
			return { success: true, message: 'User info cleared' }
		} catch (error) {
			console.error('Admin clear user info error:', error)
			return { success: false, message: 'Failed to clear user info' }
		}
	},

	getUserAvatarUploadSignedUrl: async () => {
		// TODO: Implement signed URL generation for avatar uploads
		return { success: false, message: 'Not implemented' }
	},

	// Enhanced admin methods
	adminGetUserByInvitationCode: async (request: FastifyRequest) => {
		const query = request.query as any
		const invitationCode = query.invitationCode
		
		if (!invitationCode) return { success: false, message: 'Missing invitation code' }
		
		try {
			// TODO: Implement invitation code lookup
			return { success: true, userInfoResult: {} }
		} catch (error) {
			console.error('Admin get user by invitation code error:', error)
			return { success: false, message: 'Failed to find user by invitation code' }
		}
	},

	// User management methods
	adminBlockUser: async (request: FastifyRequest) => {
		const body = request.body as any
		const { uid, reason } = body
		
		if (!uid) return { success: false, message: 'Missing user ID' }
		
		try {
			await userService.adminBlockUser(uid, reason)
			return { success: true, message: 'User blocked successfully' }
		} catch (error) {
			console.error('Admin block user error:', error)
			return { success: false, message: 'Failed to block user' }
		}
	},

	adminUnblockUser: async (request: FastifyRequest) => {
		const body = request.body as any
		const { uid } = body
		
		if (!uid) return { success: false, message: 'Missing user ID' }
		
		try {
			await userService.adminUnblockUser(uid)
			return { success: true, message: 'User unblocked successfully' }
		} catch (error) {
			console.error('Admin unblock user error:', error)
			return { success: false, message: 'Failed to unblock user' }
		}
	},

	adminUpdateUserRoles: async (request: FastifyRequest) => {
		const body = request.body as any
		const { uid, roles } = body
		
		if (!uid || !roles) return { success: false, message: 'Missing user ID or roles' }
		
		try {
			await userService.adminUpdateRoles(uid, roles)
			return { success: true, message: 'User roles updated successfully' }
		} catch (error) {
			console.error('Admin update user roles error:', error)
			return { success: false, message: 'Failed to update user roles' }
		}
	},

	// Missing essential methods
	updateOrCreateUserInfo: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = cookies?.uid ? Number(cookies.uid) : undefined
		
		if (!uid) return { success: false, message: 'Not logged in' }
		
		try {
			const updated = await userService.updateProfile(uid, {
				nickname: body?.userNickname,
				avatar: body?.avatar,
				bio: body?.signature,
			})
			return { success: true, message: 'User info updated successfully' }
		} catch (error) {
			console.error('Update user info error:', error)
			return { success: false, message: 'Failed to update user info' }
		}
	},

	getUserInfoByUid: async (request: FastifyRequest) => {
		const query = request.query as any
		const uid = Number(query.uid)
		
		if (!uid) return { success: false, message: 'Missing user ID' }
		
		try {
			const user = await userService.getProfile(uid)
			return { 
				success: true, 
				result: {
					uid: user.userId,
					uuid: user.uuid,
					username: user.username,
					userNickname: user.nickname,
					avatar: (user as any).avatar || '',
					signature: (user as any).bio || '',
					roles: user.roles,
					createdAt: (user as any).createdAt,
					isFollowing: false,
					isSlef: false
				}
			}
		} catch (error) {
			console.error('Get user info error:', error)
			return { success: false, message: 'User not found' }
		}
	},

	userExistsCheckByUID: async (request: FastifyRequest) => {
		const query = request.query as any
		const uid = Number(query.uid)
		
		if (!uid) return { success: true, exists: false }
		
		try {
			const user = await userService.getProfile(uid)
			return { success: true, exists: !!user }
		} catch (error) {
			return { success: true, exists: false }
		}
	},

	userEmailExistsCheck: async (request: FastifyRequest) => {
		const query = request.query as any
		const email = query.email
		
		if (!email) return { success: true, exists: false }
		
		try {
			const user = await (await import('../../infrastructure/models/User.js')).UserModel.findOne({ email }).lean()
			return { success: true, exists: !!user }
		} catch (error) {
			return { success: true, exists: true } // Pessimistic approach
		}
	}
} 