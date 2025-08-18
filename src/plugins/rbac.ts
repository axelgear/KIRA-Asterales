import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { isPassRbacCheck } from '../services/RbacService.js'

interface RbacOptions {
  apiPath?: string
  requireAdmin?: boolean
  requiredRoles?: string[]
}

/**
 * RBAC Guard factory - creates a preHandler that automatically checks permissions
 * @param identifierType 'uuid' | 'uid' | 'both' - which identifier to use from cookies
 * @param apiPath Optional custom API path, defaults to request.url
 * @returns PreHandler function
 */
export const createRbacGuard = (identifierType: 'uuid' | 'uid' | 'both' = 'both', apiPath?: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const cookies: any = request.cookies || {}
    const uuid = cookies?.uuid
    const uid = cookies?.uid ? Number(cookies.uid) : undefined
    
    // Determine which identifiers to use based on identifierType
    let params: any = { 
      apiPath: apiPath || request.url 
    }
    
    if (identifierType === 'uuid' || identifierType === 'both') {
      if (uuid) params.uuid = uuid
    }
    
    if (identifierType === 'uid' || identifierType === 'both') {
      if (uid !== undefined) params.uid = uid
    }
    
    // If no identifiers found, return error
    if (!params.uuid && params.uid === undefined) {
      reply.code(403).send({ success: false, message: 'Authentication required' })
      return
    }
    
    const hasPermission = await isPassRbacCheck(params, request, reply)
    if (!hasPermission) {
      // isPassRbacCheck already sets the response, just return to stop execution
      return
    }
  }
}

/**
 * Admin Guard factory - creates a preHandler that requires admin role
 * @param identifierType 'uuid' | 'uid' | 'both' - which identifier to use from cookies
 * @returns PreHandler function
 */
export const createAdminGuard = (identifierType: 'uuid' | 'uid' | 'both' = 'both') => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const cookies: any = request.cookies || {}
    const uuid = cookies?.uuid
    const uid = cookies?.uid ? Number(cookies.uid) : undefined
    
    // Determine which identifiers to use based on identifierType
    let params: any = {}
    
    if (identifierType === 'uuid' || identifierType === 'both') {
      if (uuid) params.uuid = uuid
    }
    
    if (identifierType === 'uid' || identifierType === 'both') {
      if (uid !== undefined) params.uid = uid
    }
    
    // If no identifiers found, return error
    if (!params.uuid && params.uid === undefined) {
      reply.code(403).send({ success: false, message: 'Authentication required' })
      return
    }
    
    // Check if user has admin role
    const { isAdmin } = await import('../services/RbacService.js')
    const isUserAdmin = await isAdmin(params)
    
    if (!isUserAdmin) {
      reply.code(403).send({ success: false, message: 'Admin access required' })
      return
    }
  }
}

/**
 * Role Guard factory - creates a preHandler that requires specific roles
 * @param requiredRoles Array of roles that can access the route
 * @param identifierType 'uuid' | 'uid' | 'both' - which identifier to use from cookies
 * @returns PreHandler function
 */
export const createRoleGuard = (requiredRoles: string[], identifierType: 'uuid' | 'uid' | 'both' = 'both') => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const cookies: any = request.cookies || {}
    const uuid = cookies?.uuid
    const uid = cookies?.uid ? Number(cookies.uid) : undefined
    
    // Determine which identifiers to use based on identifierType
    let params: any = {}
    
    if (identifierType === 'uuid' || identifierType === 'both') {
      if (uuid) params.uuid = uuid
    }
    
    if (identifierType === 'uid' || identifierType === 'both') {
      if (uid !== undefined) params.uid = uid
    }
    
    // If no identifiers found, return error
    if (!params.uuid && params.uid === undefined) {
      reply.code(403).send({ success: false, message: 'Authentication required' })
      return
    }
    
    // Check if user has any of the required roles
    const { hasAnyRole } = await import('../services/RbacService.js')
    const hasRequiredRole = await hasAnyRole(params, requiredRoles)
    
    if (!hasRequiredRole) {
      reply.code(403).send({ success: false, message: 'Insufficient permissions' })
      return
    }
  }
}

/**
 * RBAC middleware for Fastify routes
 * @param fastify Fastify instance
 * @param options RBAC options
 */
export default async function rbacPlugin(fastify: FastifyInstance, options: RbacOptions = {}) {
  // Add RBAC guard decorators to fastify instance
  fastify.decorate('rbacGuard', createRbacGuard)
  fastify.decorate('adminGuard', createAdminGuard)
  fastify.decorate('roleGuard', createRoleGuard)
  
  // Add legacy RBAC decorator to request for backward compatibility
  fastify.decorate('rbac', {
    check: async (request: FastifyRequest, reply: FastifyReply, apiPath?: string) => {
      const cookies: any = request.cookies || {}
      const uuid = cookies?.uuid
      const uid = cookies?.uid ? Number(cookies.uid) : undefined
      
      const pathToCheck = apiPath || request.url
      
      const params: any = { apiPath: pathToCheck }
      if (uuid) params.uuid = uuid
      if (uid !== undefined) params.uid = uid
      
      return await isPassRbacCheck(params, request, reply)
    },
    
    requireAdmin: async (request: FastifyRequest, reply: FastifyReply) => {
      const cookies: any = request.cookies || {}
      const uuid = cookies?.uuid
      const uid = cookies?.uid ? Number(cookies.uid) : undefined
      
      if (!uuid && uid === undefined) {
        reply.code(403).send({ success: false, message: 'Authentication required' })
        return false
      }
      
      // Check if user has admin role
      const { isAdmin } = await import('../services/RbacService.js')
      const params: any = {}
      if (uuid) params.uuid = uuid
      if (uid !== undefined) params.uid = uid
      const isUserAdmin = await isAdmin(params)
      
      if (!isUserAdmin) {
        reply.code(403).send({ success: false, message: 'Admin access required' })
        return false
      }
      
      return true
    },
    
    requireRoles: async (request: FastifyRequest, reply: FastifyReply, requiredRoles: string[]) => {
      const cookies: any = request.cookies || {}
      const uuid = cookies?.uuid
      const uid = cookies?.uid ? Number(cookies.uid) : undefined
      
      if (!uuid && uid === undefined) {
        reply.code(403).send({ success: false, message: 'Authentication required' })
        return false
      }
      
      // Check if user has any of the required roles
      const { hasAnyRole } = await import('../services/RbacService.js')
      const params: any = {}
      if (uuid) params.uuid = uuid
      if (uid !== undefined) params.uid = uid
      const hasRequiredRole = await hasAnyRole(params, requiredRoles)
      
      if (!hasRequiredRole) {
        reply.code(403).send({ success: false, message: 'Insufficient permissions' })
        return false
      }
      
      return true
    }
  })
}

// Extend FastifyInstance interface
declare module 'fastify' {
  interface FastifyInstance {
    rbacGuard: (identifierType?: 'uuid' | 'uid' | 'both', apiPath?: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    adminGuard: (identifierType?: 'uuid' | 'uid' | 'both') => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    roleGuard: (requiredRoles: string[], identifierType?: 'uuid' | 'uid' | 'both') => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  
  interface FastifyRequest {
    rbac: {
      check: (request: FastifyRequest, reply: FastifyReply, apiPath?: string) => Promise<boolean>
      requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>
      requireRoles: (request: FastifyRequest, reply: FastifyReply, requiredRoles: string[]) => Promise<boolean>
    }
  }
} 