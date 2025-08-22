import type { FastifyInstance } from 'fastify'
//import { createRbacGuard, createAdminGuard, createRoleGuard } from '../../plugins/rbac.js'

export default async function registerRoutes(fastify: FastifyInstance) {
	const UserRoutes = (await import('./user.js')).default
	await fastify.register(UserRoutes)

	const RbacRoutes = (await import('./rbac.js')).default
	await fastify.register(RbacRoutes)

	const NovelRoutes = (await import('./novel.js')).default
	await fastify.register(NovelRoutes)

	const ChapterRoutes = (await import('./chapter.js')).default
	await fastify.register(ChapterRoutes)

	const CacheRoutes = (await import('./cache.js')).default
	await fastify.register(CacheRoutes)

	const ReadingListRoutes = (await import('./reading-list.js')).default
	await fastify.register(ReadingListRoutes)

	const NovelTaxonomyRoutes = (await import('./novel-taxonomy.js')).default
	await fastify.register(NovelTaxonomyRoutes)

	const ReportRoutes = (await import('./report.js')).default
	await fastify.register(ReportRoutes)

	/*
	// Example protected routes showing different RBAC patterns with elegant syntax
	fastify.get('/admin/users', { preHandler: [createAdminGuard('both')] }, async () => {
		return { success: true, data: [], timestamp: Date.now() }
	})

	fastify.get('/api/protected', { preHandler: [createRbacGuard('both')] }, async () => {
		return { success: true, message: 'This route is RBAC protected' }
	})

	// Example with specific identifier type
	fastify.get('/api/uuid-only', { preHandler: [createRbacGuard('uuid')] }, async () => {
		return { success: true, message: 'UUID-only protection' }
	})

	// Example with role-based protection
	fastify.get('/moderator/content', { preHandler: [createRoleGuard(['moderator', 'admin'], 'both')] }, async () => {
		return { success: true, message: 'Moderator content' }
	})
	*/
} 