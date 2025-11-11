import type { FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { userService, type OAuthProfile } from '../../services/UserService.js'
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

const OAUTH_STATE_COOKIE = 'oauth_state'
const OAUTH_RETURN_COOKIE = 'oauth_return'
const OAUTH_PROVIDERS = ['google', 'discord', 'yandex'] as const
type OAuthProvider = typeof OAUTH_PROVIDERS[number]

type ProviderConfig = {
	authUrl: string
	tokenUrl: string
	userInfoUrl: string
	scope: string
	clientId?: string | null
	clientSecret?: string | null
	redirectUri?: string | null
}

const PROVIDER_CONFIG: Record<OAuthProvider, ProviderConfig> = {
	google: {
		authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
		scope: 'openid email profile',
		clientId: ENV.GOOGLE_CLIENT_ID ?? null,
		clientSecret: ENV.GOOGLE_CLIENT_SECRET ?? null,
		redirectUri: ENV.GOOGLE_REDIRECT_URI ?? null,
	},
	discord: {
		authUrl: 'https://discord.com/api/oauth2/authorize',
		tokenUrl: 'https://discord.com/api/oauth2/token',
		userInfoUrl: 'https://discord.com/api/users/@me',
		scope: 'identify email',
		clientId: ENV.DISCORD_CLIENT_ID ?? null,
		clientSecret: ENV.DISCORD_CLIENT_SECRET ?? null,
		redirectUri: ENV.DISCORD_REDIRECT_URI ?? null,
	},
	yandex: {
		authUrl: 'https://oauth.yandex.com/authorize',
		tokenUrl: 'https://oauth.yandex.com/token',
		userInfoUrl: 'https://login.yandex.ru/info?format=json',
		scope: 'login:email login:info',
		clientId: ENV.YANDEX_CLIENT_ID ?? null,
		clientSecret: ENV.YANDEX_CLIENT_SECRET ?? null,
		redirectUri: ENV.YANDEX_REDIRECT_URI ?? null,
	},
}

const FRONTEND_BASES = (ENV.FRONTEND_URL || '')
	.split(',')
	.map(base => base.trim())
	.filter(Boolean)
const DEFAULT_FRONTEND_URL = FRONTEND_BASES[0] || 'http://localhost:3000/'

function isProviderConfigured(provider: OAuthProvider) {
	const config = PROVIDER_CONFIG[provider]
	return Boolean(config.clientId && config.clientSecret)
}

function buildState() {
	return crypto.randomBytes(32).toString('hex')
}

function allowedReturnUrl(url?: string) {
	if (!url) return undefined
	try {
		const parsed = new URL(url)
		const allowed = FRONTEND_BASES.some(base => {
			try {
				return new URL(base).hostname === parsed.hostname
			} catch {
				return false
			}
		})
		return allowed ? parsed.toString() : undefined
	} catch {
		return undefined
	}
}

function getDefaultRedirect(path = '/', params: Record<string, string | undefined> = {}) {
	const url = new URL(path, DEFAULT_FRONTEND_URL)
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined) url.searchParams.set(key, value)
	})
	return url.toString()
}

function buildRedirect(returnUrl: string | undefined, fallbackPath: string, params: Record<string, string | undefined> = {}) {
	const sanitized = allowedReturnUrl(returnUrl)
	if (sanitized) {
		const url = new URL(sanitized)
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined) url.searchParams.set(key, value)
		})
		return url.toString()
	}
	return getDefaultRedirect(fallbackPath, params)
}

function getRedirectUri(provider: OAuthProvider, request: FastifyRequest) {
	const config = PROVIDER_CONFIG[provider]
	if (config.redirectUri) return config.redirectUri
	const forwardedProto = (request.headers['x-forwarded-proto'] as string) || request.protocol
	const forwardedHost = (request.headers['x-forwarded-host'] as string) || request.headers.host || ''
	const base = `${forwardedProto}://${forwardedHost}`
	const defaultPath = {
		google: '/user/oauth/google/callback',
		discord: '/user/oauth/discord/callback',
		yandex: '/user/oauth/yandex/callback',
	} as const
	return `${base}${defaultPath[provider]}`
}

function buildOAuthUrl(provider: OAuthProvider, state: string, request: FastifyRequest) {
	const config = PROVIDER_CONFIG[provider]
	const redirectUri = getRedirectUri(provider, request)
	const params = new URLSearchParams({
		client_id: config.clientId || '',
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: config.scope,
		state,
	})
	if (provider === 'google') {
		params.set('access_type', 'offline')
		params.set('include_granted_scopes', 'true')
	}
	return `${config.authUrl}?${params.toString()}`
}

async function exchangeCodeForToken(provider: OAuthProvider, code: string, request: FastifyRequest) {
	const config = PROVIDER_CONFIG[provider]
	const redirectUri = getRedirectUri(provider, request)
	const body = new URLSearchParams({
		client_id: config.clientId || '',
		client_secret: config.clientSecret || '',
		code,
		grant_type: 'authorization_code',
		redirect_uri: redirectUri,
	})
	const response = await fetch(config.tokenUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	})
	if (!response.ok) {
		throw new Error(`Failed to exchange code for token: ${response.status}`)
	}
	return response.json() as Promise<Record<string, any>>
}

async function fetchOAuthProfile(provider: OAuthProvider, accessToken: string) {
	const config = PROVIDER_CONFIG[provider]
	const headers =
		provider === 'yandex'
			? { Authorization: `OAuth ${accessToken}` }
			: { Authorization: `Bearer ${accessToken}` }
	const response = await fetch(config.userInfoUrl, { headers })
	if (!response.ok) {
		throw new Error(`Failed to fetch ${provider} user profile`)
	}
	return response.json() as Promise<Record<string, any>>
}

function mapOAuthProfile(provider: OAuthProvider, raw: any): OAuthProfile {
	switch (provider) {
		case 'google':
			return {
				provider,
				providerId: raw.id ?? raw.sub,
				...(raw.email ? { email: raw.email } : {}),
				...(raw.name ? { name: raw.name } : raw.email ? { name: raw.email } : {}),
				...(raw.picture ? { avatar: raw.picture } : {}),
			}
		case 'discord':
			return {
				provider,
				providerId: raw.id,
				...(raw.email ? { email: raw.email } : {}),
				...(raw.global_name || raw.username ? { name: raw.global_name || raw.username } : {}),
				...(raw.avatar ? { avatar: `https://cdn.discordapp.com/avatars/${raw.id}/${raw.avatar}.png` } : {}),
			}
		case 'yandex':
			return {
				provider,
				providerId: raw.id || raw.login,
				...(raw.default_email ? { email: raw.default_email } : {}),
				...(raw.real_name || raw.display_name || raw.login ? { name: raw.real_name || raw.display_name || raw.login } : {}),
				...(raw.default_avatar_id ? { avatar: `https://avatars.yandex.net/get-yapic/${raw.default_avatar_id}/islands-200` } : {}),
			}
		default:
			throw new Error(`Unsupported provider: ${provider}`)
	}
}
async function resolveAuthContext(request: FastifyRequest) {
	const cookies: any = request.cookies || {}
	const token = cookies?.token as string | undefined
	const uid = cookies?.uid ? Number(cookies.uid) : undefined
	if (!token || !uid) throw new Error('Unauthorized')
	try {
		const payload: any = jwt.verify(token, ENV.JWT_SECRET as unknown as jwt.Secret)
		if (!payload || typeof payload.uid !== 'number' || payload.uid !== uid) throw new Error('Unauthorized')
		return { uid, uuid: payload.uuid as string | undefined }
	} catch {
		throw new Error('Unauthorized')
	}
}

export const UserController = {
	// POST /user/registering - No RBAC (public)
	registering: async (request: FastifyRequest, reply: FastifyReply) => {
		const body = (request.body as any) || {}
		const { email, verificationCode, passwordHash, passwordHint, invitationCode, username, userNickname } = body
		try {
			const result = await userService.register({ username, email, passwordHash, nickname: userNickname, verificationCode, invitationCode })
			setCookies(reply, { token: result.token, email, uid: result.user.userId, uuid: result.user.uuid })
			return { success: true, UUID: result.user.uuid, uid: result.user.userId, token: result.token, message: 'OK' }
		} catch (e: any) {
			return reply.code(400).send({ success: false, message: e?.message || 'Registration failed' })
		}
	},

	// POST /user/login - No RBAC (public)
	login: async (request: FastifyRequest, reply: FastifyReply) => {
		const body = (request.body as any) || {}
		const { email, passwordHash, clientOtp } = body
		try {
			const result = await userService.login({ email, passwordHash, clientOtp })
			setCookies(reply, { token: result.token, email: result.user.email, uid: result.user.userId, uuid: result.user.uuid })
			return { success: true, email: result.user.email, UUID: result.user.uuid, uid: result.user.userId, token: result.token, passwordHint: '', message: 'OK' }
		} catch (error: any) {
			if (error?.message === 'TOTP_REQUIRED') {
				return { success: false, message: 'totp_required', requireTotp: true }
			}
			if (error?.message === 'INVALID_TOTP') {
				return { success: false, message: 'invalid_totp', requireTotp: true }
			}
			return { success: false, message: 'Email or password incorrect' }
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

	// GET /user/oauth/:provider - start OAuth login
	oauthStart: async (request: FastifyRequest, reply: FastifyReply) => {
		const providerParam = (request.params as any)?.provider as string
		const provider = OAUTH_PROVIDERS.find(item => item === providerParam)
		if (!provider) return reply.code(400).send({ success: false, message: 'Unsupported provider' })
		if (!isProviderConfigured(provider)) return reply.code(503).send({ success: false, message: `${provider} oauth not configured` })

		const { returnUrl } = request.query as { returnUrl?: string }
		const sanitizedReturn = allowedReturnUrl(returnUrl)
		const state = buildState()
		const authUrl = buildOAuthUrl(provider, state, request)

		const cookieOptions = {
			httpOnly: true,
			secure: request.protocol === 'https' || process.env.NODE_ENV === 'production',
			sameSite: 'lax' as const,
			path: '/',
			maxAge: 600,
		}

		reply.setCookie(OAUTH_STATE_COOKIE, state, cookieOptions)
		if (sanitizedReturn) {
			reply.setCookie(OAUTH_RETURN_COOKIE, sanitizedReturn, cookieOptions)
		}

		return reply.redirect(authUrl)
	},

	// GET /user/oauth/:provider/callback - OAuth callback
	oauthCallback: async (request: FastifyRequest, reply: FastifyReply) => {
		const providerParam = (request.params as any)?.provider as string
		const provider = OAUTH_PROVIDERS.find(item => item === providerParam)
		if (!provider) return reply.redirect(getDefaultRedirect('/auth/error', { oauth: 'unsupported_provider' }))

		const storedReturnUrl = request.cookies[OAUTH_RETURN_COOKIE]
		const clearOAuthCookies = () => {
			reply.clearCookie(OAUTH_STATE_COOKIE, { path: '/' })
			reply.clearCookie(OAUTH_RETURN_COOKIE, { path: '/' })
		}

		try {
			if (!isProviderConfigured(provider)) {
				clearOAuthCookies()
				return reply.redirect(buildRedirect(storedReturnUrl, '/auth/error', { oauth: 'provider_not_configured', provider }))
			}

			const { code, state, error } = request.query as Record<string, string | undefined>
			const storedState = request.cookies[OAUTH_STATE_COOKIE]

			if (error) {
				clearOAuthCookies()
				return reply.redirect(buildRedirect(storedReturnUrl, '/auth/error', { oauth: error, provider }))
			}
			if (!code) {
				clearOAuthCookies()
				return reply.redirect(buildRedirect(storedReturnUrl, '/auth/error', { oauth: 'no_code', provider }))
			}
			if (!state || !storedState || state !== storedState) {
				clearOAuthCookies()
				return reply.redirect(buildRedirect(storedReturnUrl, '/auth/error', { oauth: 'invalid_state', provider }))
			}

			clearOAuthCookies()

			const tokenData = await exchangeCodeForToken(provider, code, request)
			const accessToken = tokenData.access_token
			if (!accessToken) throw new Error('Missing access token')

			const rawProfile = await fetchOAuthProfile(provider, accessToken)
			const profile = mapOAuthProfile(provider, rawProfile)
			const result = await userService.handleOAuthLogin(profile)

			setCookies(reply, {
				token: result.token,
				email: result.user.email,
				uid: result.user.userId,
				uuid: result.user.uuid,
			})

			return reply.redirect(buildRedirect(storedReturnUrl, '/', {
				oauth: 'success',
				provider,
				new: result.isNewUser ? '1' : undefined,
			}))
		} catch (reason: any) {
			console.error(`${providerParam} oauth callback error:`, reason)
			clearOAuthCookies()
			return reply.redirect(buildRedirect(storedReturnUrl, '/auth/error', { oauth: 'internal_error', provider }))
		}
	},

	oauthProviders: async () => {
		const available = Object.fromEntries(
			OAUTH_PROVIDERS.map(provider => [provider, isProviderConfigured(provider)])
		) as Record<OAuthProvider, boolean>
		return { success: true, available }
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
					label: (user as any).label || [],
					authenticatorType: (user as any).twoFactorType || (user as any).authenticatorType || 'none'
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
		try {
			const { uid } = await resolveAuthContext(request)
			const result = await userService.setupTotp(uid)
			if (result.alreadyEnabled) {
				return { success: true, isExists: true, existsAuthenticatorType: 'totp' as const }
			}
			return { success: true, isExists: false, result: { otpAuth: result.otpauth } }
		} catch (error: any) {
			console.error('Create TOTP authenticator error:', error)
			return { success: false, isExists: false, message: error?.message || 'Failed to create TOTP authenticator' }
		}
	},

	// POST /user/confirmUserTotpAuthenticator - RBAC protected via preHandler
	confirmTotp: async (request: FastifyRequest) => {
		try {
			const { uid } = await resolveAuthContext(request)
		const { clientOtp } = (request.body as any) || {}
			if (!clientOtp) {
				return { success: false, message: 'TOTP code required' }
			}
			const result = await userService.confirmTotp(uid, clientOtp)
			return { success: true, result: { backupCode: result.backupCodes, recoveryCode: result.recoveryCode } }
		} catch (error: any) {
			console.error('Confirm TOTP authenticator error:', error)
			return { success: false, message: error?.message || 'Failed to confirm TOTP authenticator' }
		}
	},

	// Email 2FA endpoints - RBAC protected via preHandler
	createEmailAuthenticator: async (request: FastifyRequest) => {
		if (!ENV.REQUIRE_REGISTRATION_VERIFICATION) {
			return { success: false, message: 'Email-based 2FA is disabled' }
		}
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
		if (!ENV.REQUIRE_REGISTRATION_VERIFICATION) {
			return { success: false, message: 'Email-based 2FA is disabled' }
		}
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
		if (!ENV.REQUIRE_REGISTRATION_VERIFICATION) {
			return { success: false, message: 'Email-based 2FA is disabled' }
		}
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
		if (!ENV.REQUIRE_REGISTRATION_VERIFICATION) {
			return { success: false, message: 'Email-based 2FA is disabled' }
		}
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
			const status = await userService.getTwoFactorStatusByEmail(email)
			if (!ENV.REQUIRE_REGISTRATION_VERIFICATION && status.type === 'email') {
				return { success: true, have2FA: false, type: 'none' as const }
			}
			return { success: true, ...status }
		} catch (error) {
			console.error('Check 2FA by email error:', error)
			return { success: false, have2FA: false, message: 'Failed to check 2FA status' }
		}
	},

	checkUserHave2FAByUUID: async (request: FastifyRequest) => {
		try {
			const { uid } = await resolveAuthContext(request)
			const status = await userService.getTwoFactorStatusByUid(uid)
			if (!ENV.REQUIRE_REGISTRATION_VERIFICATION && status.type === 'email') {
				return { success: true, have2FA: false, type: 'none' as const }
			}
			return { success: true, ...status }
		} catch (error) {
			console.error('Check 2FA by UUID error:', error)
			return { success: false, have2FA: false, message: 'Failed to check 2FA status' }
		}
	},

	// DELETE /user/deleteTotpAuthenticatorByTotpVerificationCodeController - RBAC protected via preHandler
	deleteTotpByCode: async (request: FastifyRequest) => {
		try {
			const { uid } = await resolveAuthContext(request)
		const body = request.body as any
		const { clientOtp, passwordHash } = body
		
		if (!clientOtp || !passwordHash) {
			return { success: false, message: 'TOTP code and password required' }
		}
		
			await userService.deleteTotp(uid, passwordHash, clientOtp)
			return { success: true, isCoolingDown: false }
		} catch (error: any) {
			console.error('Delete TOTP authenticator error:', error)
			return { success: false, message: error?.message || 'Failed to delete TOTP authenticator' }
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
	requestSendVerificationCode: async (request: FastifyRequest) => {
		const body = (request.body as any) || {}
		const email = body?.email as string | undefined
		if (!email) return { success: false, isTimeout: false, message: 'Email is required' }
		return await userService.sendRegistrationVerificationCode(email)
	},
	createInvitationCode: async (request: FastifyRequest) => {
		if (!ENV.ENABLE_INVITATION) {
			return { success: false, isCoolingDown: false, message: 'Invitation codes are disabled' }
		}
		try {
			const auth = await resolveAuthContext(request)
			const invitation = await userService.createInvitationCode(auth.uid, auth.uuid ?? '')
			return {
				success: true,
				isCoolingDown: false,
				invitationCodeResult: {
					creatorUid: invitation.creatorUid,
					creatorUUID: invitation.creatorUUID,
					invitationCode: invitation.invitationCode,
					generationDateTime: invitation.generationDateTime,
					isPending: invitation.isPending,
					disabled: invitation.disabled,
					assignee: invitation.assigneeUid,
					usedDateTime: invitation.usedDateTime,
				},
			}
		} catch (error: any) {
			if (error?.message === 'Unauthorized') return { success: false, isCoolingDown: false, message: 'Unauthorized' }
			return { success: false, isCoolingDown: false, message: error?.message || 'Failed to create invitation code' }
		}
	},
	getMyInvitationCode: async (request: FastifyRequest) => {
		if (!ENV.ENABLE_INVITATION) {
			return { success: true, invitationCodeResult: [] }
		}
		try {
			const auth = await resolveAuthContext(request)
			const codes = await userService.getInvitationCodes(auth.uid)
			const normalized = codes.map(code => ({
				creatorUid: code.creatorUid,
				creatorUUID: code.creatorUUID,
				invitationCode: code.invitationCode,
				generationDateTime: code.generationDateTime,
				isPending: code.isPending,
				disabled: code.disabled,
				assignee: code.assigneeUid,
				usedDateTime: code.usedDateTime,
			}))
			return { success: true, invitationCodeResult: normalized }
		} catch (error: any) {
			if (error?.message === 'Unauthorized') return { success: false, invitationCodeResult: [], message: 'Unauthorized' }
			return { success: false, invitationCodeResult: [], message: error?.message || 'Failed to get invitation codes' }
		}
	},
	checkInvitationCode: async (request: FastifyRequest) => {
		if (!ENV.ENABLE_INVITATION) {
			return { success: true, isAvailableInvitationCode: true }
		}
		const body = (request.body as any) || {}
		const invitationCode = body?.invitationCode as string | undefined
		if (!invitationCode) return { success: false, isAvailableInvitationCode: false, message: 'Invitation code required' }
		return userService.checkInvitationCodeAvailability(invitationCode)
	},
	requestSendChangeEmailVerificationCode: async (request: FastifyRequest) => {
		try {
			const auth = await resolveAuthContext(request)
			const body = (request.body as any) || {}
			const newEmail = body?.newEmail as string | undefined
			if (!newEmail) return { success: false, isCoolingDown: false, message: 'New email is required' }
			return await userService.sendChangeEmailVerificationCode(auth.uid, newEmail)
		} catch (error: any) {
			if (error?.message === 'Unauthorized') return { success: false, isCoolingDown: false, message: 'Unauthorized' }
			return { success: false, isCoolingDown: false, message: error?.message || 'Failed to send verification code' }
		}
	},
	requestSendChangePasswordVerificationCode: async (request: FastifyRequest) => {
		try {
			const auth = await resolveAuthContext(request)
			return await userService.sendChangePasswordVerificationCode(auth.uid)
		} catch (error: any) {
			if (error?.message === 'Unauthorized') return { success: false, isCoolingDown: false, message: 'Unauthorized' }
			return { success: false, isCoolingDown: false, message: error?.message || 'Failed to send verification code' }
		}
	},
	updateUserEmail: async (request: FastifyRequest) => {
		try {
			const auth = await resolveAuthContext(request)
			const body = (request.body as any) || {}
			const { oldEmail, newEmail, passwordHash, verificationCode } = body || {}
			if (!oldEmail || !newEmail || !passwordHash || !verificationCode) {
				return { success: false, message: 'Missing required fields' }
			}
			await userService.updateEmailWithVerification({
				uid: auth.uid,
				oldEmail,
				newEmail,
				passwordHash,
				verificationCode,
			})
			return { success: true }
		} catch (error: any) {
			if (error?.message === 'Unauthorized') return { success: false, message: 'Unauthorized' }
			return { success: false, message: error?.message || 'Failed to update email' }
		}
	},
	updateUserPassword: async (request: FastifyRequest) => {
		try {
			const auth = await resolveAuthContext(request)
			const body = (request.body as any) || {}
			const { oldPasswordHash, newPasswordHash, verificationCode } = body || {}
			if (!oldPasswordHash || !newPasswordHash || !verificationCode) {
				return { success: false, message: 'Missing required fields' }
			}
			await userService.updatePasswordWithVerification({
				uid: auth.uid,
				oldPasswordHash,
				newPasswordHash,
				verificationCode,
			})
			return { success: true }
		} catch (error: any) {
			if (error?.message === 'Unauthorized') return { success: false, message: 'Unauthorized' }
			return { success: false, message: error?.message || 'Failed to update password' }
		}
	},
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