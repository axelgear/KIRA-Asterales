import type { FastifyReply, FastifyRequest } from 'fastify'
import crypto from 'crypto'
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

type OAuthProvider = 'google' | 'discord' | 'yandex'

type OAuthConfig = {
	scope: string
	authUrl: string
	tokenUrl: string
	getCredentials: () => { clientId?: string; clientSecret?: string; redirectUri?: string }
	buildAuthorizeParams?: (params: URLSearchParams) => URLSearchParams
	buildTokenRequestBody: (code: string, credentials: { clientId: string; clientSecret: string; redirectUri: string }) => Record<string, string>
	fetchUserProfile: (token: { access_token: string; token_type?: string }) => Promise<any>
	mapProfile: (data: any) => { providerId: string; email?: string | undefined; name?: string | undefined; avatar?: string | undefined }
}

const FIVE_MINUTES = 60 * 5

const oauthCookieOptions = {
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax' as const,
	maxAge: FIVE_MINUTES,
	path: '/',
}

const oauthConfigs: Record<OAuthProvider, OAuthConfig> = {
	google: {
		scope: 'openid email profile',
		authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		getCredentials: () => {
			const credentials: { clientId?: string; clientSecret?: string; redirectUri?: string } = {}
			if (ENV.GOOGLE_CLIENT_ID) credentials.clientId = ENV.GOOGLE_CLIENT_ID
			if (ENV.GOOGLE_CLIENT_SECRET) credentials.clientSecret = ENV.GOOGLE_CLIENT_SECRET
			if (ENV.GOOGLE_REDIRECT_URI) credentials.redirectUri = ENV.GOOGLE_REDIRECT_URI
			return credentials
		},
		buildAuthorizeParams: params => {
			params.set('access_type', 'offline')
			params.set('prompt', 'select_account')
			return params
		},
		buildTokenRequestBody: (code, credentials) => ({
			client_id: credentials.clientId,
			client_secret: credentials.clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: credentials.redirectUri,
		}),
		fetchUserProfile: async token => {
			const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
				headers: {
					Authorization: `Bearer ${token.access_token}`,
				},
			})
			if (!response.ok) {
				throw new Error('USER_INFO_FAILED')
			}
			return response.json()
		},
		mapProfile: data => ({
			providerId: typeof data?.id === 'string' ? data.id : String(data?.id ?? ''),
			email: typeof data?.email === 'string' ? data.email : undefined,
			name: typeof data?.name === 'string' ? data.name : undefined,
			avatar: typeof data?.picture === 'string' ? data.picture : undefined,
		}),
	},
	discord: {
		scope: 'identify email',
		authUrl: 'https://discord.com/api/oauth2/authorize',
		tokenUrl: 'https://discord.com/api/oauth2/token',
		getCredentials: () => {
			const credentials: { clientId?: string; clientSecret?: string; redirectUri?: string } = {}
			if (ENV.DISCORD_CLIENT_ID) credentials.clientId = ENV.DISCORD_CLIENT_ID
			if (ENV.DISCORD_CLIENT_SECRET) credentials.clientSecret = ENV.DISCORD_CLIENT_SECRET
			if (ENV.DISCORD_REDIRECT_URI) credentials.redirectUri = ENV.DISCORD_REDIRECT_URI
			return credentials
		},
		buildTokenRequestBody: (code, credentials) => ({
			client_id: credentials.clientId,
			client_secret: credentials.clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: credentials.redirectUri,
		}),
		fetchUserProfile: async token => {
			const response = await fetch('https://discord.com/api/users/@me', {
				headers: {
					Authorization: `Bearer ${token.access_token}`,
				},
			})
			if (!response.ok) {
				throw new Error('USER_INFO_FAILED')
			}
			return response.json()
		},
		mapProfile: data => ({
			providerId: typeof data?.id === 'string' ? data.id : String(data?.id ?? ''),
			email: typeof data?.email === 'string' ? data.email : undefined,
			name: typeof data?.global_name === 'string' ? data.global_name : (typeof data?.username === 'string' ? data.username : undefined),
			avatar: typeof data?.avatar === 'string' ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : undefined,
		}),
	},
	yandex: {
		scope: 'login:email login:info',
		authUrl: 'https://oauth.yandex.com/authorize',
		tokenUrl: 'https://oauth.yandex.com/token',
		getCredentials: () => {
			const credentials: { clientId?: string; clientSecret?: string; redirectUri?: string } = {}
			if (ENV.YANDEX_CLIENT_ID) credentials.clientId = ENV.YANDEX_CLIENT_ID
			if (ENV.YANDEX_CLIENT_SECRET) credentials.clientSecret = ENV.YANDEX_CLIENT_SECRET
			if (ENV.YANDEX_REDIRECT_URI) credentials.redirectUri = ENV.YANDEX_REDIRECT_URI
			return credentials
		},
		buildAuthorizeParams: params => {
			params.set('force_confirm', 'yes')
			return params
		},
		buildTokenRequestBody: (code, credentials) => ({
			client_id: credentials.clientId,
			client_secret: credentials.clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: credentials.redirectUri,
		}),
		fetchUserProfile: async token => {
			const response = await fetch('https://login.yandex.ru/info', {
				headers: {
					Authorization: `OAuth ${token.access_token}`,
				},
			})
			if (!response.ok) {
				throw new Error('USER_INFO_FAILED')
			}
			return response.json()
		},
		mapProfile: data => ({
			providerId: data?.id ? String(data.id) : '',
			email: typeof data?.default_email === 'string' ? data.default_email : undefined,
			name: typeof data?.real_name === 'string'
				? data.real_name
				: (typeof data?.display_name === 'string' ? data.display_name : (typeof data?.login === 'string' ? data.login : undefined)),
			avatar: typeof data?.default_avatar_id === 'string'
				? `https://avatars.yandex.net/get-yapic/${data.default_avatar_id}/islands-200`
				: undefined,
		}),
	},
}

function buildAuthorizeUrl(provider: OAuthProvider, credentials: { clientId: string; redirectUri: string }, state: string) {
	const config = oauthConfigs[provider]
	const params = new URLSearchParams({
		client_id: credentials.clientId,
		redirect_uri: credentials.redirectUri,
		response_type: 'code',
		scope: config.scope,
		state,
	})
	return (config.buildAuthorizeParams ? config.buildAuthorizeParams(params) : params).toString()
}

function getFrontendOrigin(request: FastifyRequest) {
	const candidate = ENV.FRONTEND_URL || request.headers.origin || ''
	try {
		return new URL(candidate).origin
	} catch {
		return '*'
	}
}

function sendOAuthResult(reply: FastifyReply, request: FastifyRequest, payload: { success: boolean; provider: OAuthProvider; mode: 'login' | 'link'; message?: string; user?: { uid: number; email: string; username: string }; requireTotp?: boolean; totpToken?: string }) {
	const origin = getFrontendOrigin(request)
	const data = JSON.stringify({
		type: 'oauth-result',
		...payload,
	}).replace(/</g, '\\u003c')

	const fallbackMessage = payload.success ? 'Login succeeded. You can close this window.' : (payload.message || 'Login failed. You can close this window.')
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>OAuth ${payload.success ? 'Success' : 'Error'}</title>
</head>
<body>
<script>
(function () {
	const data = ${data};
	try {
		if (window.opener && !window.opener.closed) {
			window.opener.postMessage(data, ${JSON.stringify(origin)});
		}
	} catch (err) {
		console.error('Failed to postMessage to opener', err);
	}
	try { window.close(); } catch {}
	setTimeout(function () {
		document.body.textContent = ${JSON.stringify(fallbackMessage)};
	}, 150);
})();
</script>
</body>
</html>`
	reply.type('text/html').send(html)
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

	// POST /user/oauth/totp
	oauthTotpConfirm: async (request: FastifyRequest, reply: FastifyReply) => {
		const { totpToken, clientOtp } = (request.body as any) || {}
		if (!totpToken || !clientOtp) {
			return { success: false, message: 'Missing token or TOTP code' }
		}
		try {
			const result = await userService.finalizeOAuthTotp({ totpToken, clientOtp })
			setCookies(reply, { token: result.token, email: result.user.email, uid: result.user.userId, uuid: result.user.uuid })
			return { success: true }
		} catch (error: any) {
			console.error('OAuth TOTP confirm error:', error)
			return { success: false, message: error?.message || 'Failed to confirm TOTP code' }
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
				return reply.code(401).send({ success: false, message: 'totp_required', requireTotp: true })
			}
			if (error?.message === 'INVALID_TOTP') {
				return reply.code(401).send({ success: false, message: 'invalid_totp', requireTotp: true })
			}
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

	// GET /user/oauth/:provider/start
	oauthStart: async (request: FastifyRequest, reply: FastifyReply) => {
		const provider = ((request.params as any)?.provider || '').toLowerCase() as OAuthProvider
		const config = oauthConfigs[provider]
		if (!config) {
			return reply.code(404).send({ success: false, message: 'Unsupported provider' })
		}
		const credentials = config.getCredentials()
		const { clientId, clientSecret, redirectUri } = credentials
		if (!clientId || !clientSecret || !redirectUri) {
			return reply.code(503).send({ success: false, message: 'OAuth provider not configured' })
		}
		const state = crypto.randomBytes(32).toString('hex')
		const requestedMode = ((request.query as any)?.mode === 'link') ? 'link' : 'login'
		reply.setCookie('oauth_state', state, oauthCookieOptions)
		reply.setCookie('oauth_provider', provider, oauthCookieOptions)
		reply.setCookie('oauth_mode', requestedMode, oauthCookieOptions)
		const authorizeParams = buildAuthorizeUrl(provider, { clientId, redirectUri }, state)
		const redirectUrl = `${config.authUrl}?${authorizeParams}`
		return reply.redirect(redirectUrl)
	},

	// GET /user/oauth/:provider/callback
	oauthCallback: async (request: FastifyRequest, reply: FastifyReply) => {
		const provider = ((request.params as any)?.provider || '').toLowerCase() as OAuthProvider
		const config = oauthConfigs[provider]
		if (!config) {
			return reply.code(404).send({ success: false, message: 'Unsupported provider' })
		}
		const storedState = request.cookies?.oauth_state
		const storedProvider = request.cookies?.oauth_provider
		let mode: 'login' | 'link' = request.cookies?.oauth_mode === 'link' ? 'link' : 'login'
		reply.clearCookie('oauth_state', { path: '/' })
		reply.clearCookie('oauth_provider', { path: '/' })
		reply.clearCookie('oauth_mode', { path: '/' })

		const { code, state, error } = request.query as any
		if (error) {
			return sendOAuthResult(reply, request, { success: false, provider, mode, message: String(error) })
		}
		if (!code || !state) {
			return sendOAuthResult(reply, request, { success: false, provider, mode, message: 'Missing authorization code' })
		}
		if (!storedState || storedState !== state || storedProvider !== provider) {
			return sendOAuthResult(reply, request, { success: false, provider, mode, message: 'Invalid oauth state' })
		}

		const credentials = config.getCredentials()
		const { clientId, clientSecret, redirectUri } = credentials
		if (!clientId || !clientSecret || !redirectUri) {
			return sendOAuthResult(reply, request, { success: false, provider, mode, message: 'OAuth provider not configured' })
		}

		try {
			const tokenResponse = await fetch(config.tokenUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams(config.buildTokenRequestBody(code, {
					clientId,
					clientSecret,
					redirectUri,
				})),
			})

			if (!tokenResponse.ok) {
				return sendOAuthResult(reply, request, { success: false, provider, mode, message: 'Failed to exchange authorization code' })
			}

			const tokenData = await tokenResponse.json()
			if (!tokenData?.access_token) {
				return sendOAuthResult(reply, request, { success: false, provider, mode, message: 'Invalid token response' })
			}

			const profileData = await config.fetchUserProfile(tokenData)
			const mappedProfile = config.mapProfile(profileData)
			if (!mappedProfile?.providerId) {
				return sendOAuthResult(reply, request, { success: false, provider, mode, message: 'Missing provider identifier' })
			}
			if (!mappedProfile?.email) {
				return sendOAuthResult(reply, request, { success: false, provider, mode, message: 'Email not provided by provider' })
			}

			let linkUid: number | undefined
			if (mode === 'link') {
				try {
					const context = await resolveAuthContext(request)
					linkUid = context.uid
				} catch {
					mode = 'login'
				}
			}

			let user
			let token: string | undefined
			if (mode === 'link' && linkUid) {
				const result = await userService.linkOAuthAccount(linkUid, {
					provider,
					providerId: mappedProfile.providerId,
					email: mappedProfile.email,
					name: mappedProfile.name,
					avatar: mappedProfile.avatar,
				})
				user = result.user
				token = result.token
			} else {
				const loginResult = await userService.handleOAuthLogin({
					provider,
					providerId: mappedProfile.providerId,
					email: mappedProfile.email,
					name: mappedProfile.name,
					avatar: mappedProfile.avatar,
				})
				if ('requireTotp' in loginResult && loginResult.requireTotp) {
					return sendOAuthResult(reply, request, { success: false, provider, mode, requireTotp: true, totpToken: loginResult.totpToken, message: 'totp_required' })
				}
				user = loginResult.user
				token = loginResult.token
				mode = 'login'
			}

			if (token) {
				setCookies(reply, { token, email: user.email, uid: user.userId, uuid: user.uuid })
			}
			return sendOAuthResult(reply, request, {
				success: true,
				provider,
				mode,
				user: {
					uid: user.userId,
					email: user.email,
					username: user.username,
				},
			})
		} catch (err: any) {
			console.error('OAuth callback error:', err)
			const rawMessage = typeof err?.message === 'string' ? err.message : undefined
			const friendlyMessages: Record<string, string> = {
				EMAIL_MISMATCH: 'Email address from provider does not match your account.',
				OAUTH_ACCOUNT_IN_USE: 'This provider account is already linked to another user.',
			}
			const message = rawMessage && friendlyMessages[rawMessage] ? friendlyMessages[rawMessage] : (rawMessage || 'OAuth callback failed')
			return sendOAuthResult(reply, request, { success: false, provider, mode, message })
		}
	},

	// DELETE /user/oauth/:provider - RBAC protected
	unlinkOAuthProvider: async (request: FastifyRequest, reply: FastifyReply) => {
		const provider = ((request.params as any)?.provider || '').toLowerCase() as OAuthProvider
		if (!oauthConfigs[provider]) {
			return { success: false, message: 'Unsupported provider' }
		}
		try {
			const { uid } = await resolveAuthContext(request)
			const result = await userService.unlinkOAuthAccount(uid, provider)
			setCookies(reply, { token: result.token, email: result.user.email, uid: result.user.userId, uuid: result.user.uuid })
			return { success: true }
		} catch (error: any) {
			console.error('Unlink OAuth provider error:', error)
			return { success: false, message: error?.message || 'Failed to unlink provider' }
		}
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
					uuid: user.uuid,
					email: user.email,
					roles: user.roles,
					username: user.username,
					userNickname: user.nickname,
					userCreateDateTime: (user as any).createdAt ? new Date((user as any).createdAt).getTime() : Date.now(),
					avatar: (user as any).avatar || '',
					gender: (user as any).gender || '',
					signature: (user as any).bio || '',
					label: (user as any).label || [],
					authenticatorType: user.is2FAEnabled ? (user.twoFactorType || 'none') : 'none',
					oauthAccounts: (Array.isArray((user as any).oauthAccounts) ? (user as any).oauthAccounts : []).map((account: any) => ({
						provider: account.provider,
						providerId: account.providerId,
						email: account.email,
						name: account.name,
						avatar: account.avatar,
						linkedAt: account.linkedAt ? new Date(account.linkedAt).getTime() : undefined,
					})),
				}
			}
		} catch {
			return { success: false, message: 'Invalid session' }
		}
	},

	// GET /user/publicProfile - no auth required
	publicProfile: async (request: FastifyRequest) => {
		const uid = Number((request.query as any)?.uid)
		if (!uid) return { success: false, message: 'Missing uid' }
		try {
			const profile = await userService.getPublicProfile(uid)
			if (!profile) {
				return { success: false, message: 'User not found' }
			}
			return { success: true, result: profile }
		} catch (error) {
			console.error('Public profile error:', error)
			return { success: false, message: 'Failed to fetch user profile' }
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