import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export default fp(async function csrfPlugin(fastify: FastifyInstance) {
	fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
		const method = request.method.toUpperCase()
		if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
		// If Authorization Bearer is used, skip CSRF (API clients)
		const auth = request.headers['authorization']
		if (auth && auth.toLowerCase().startsWith('bearer ')) return
		// If no cookies present, skip (not a cookie session)
		const cookies: any = request.cookies || {}
		if (!cookies || (!cookies.access_token && !cookies.refresh_token)) return
		const headerToken = request.headers['x-csrf-token'] as string | undefined
		const cookieToken = cookies['csrf_token'] as string | undefined
		if (!headerToken || !cookieToken || headerToken !== cookieToken) {
			return reply.code(403).send({ success: false, error: 'CSRF token invalid' })
		}
	})
}) as any 