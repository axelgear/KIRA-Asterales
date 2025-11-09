import type { FastifyRequest, FastifyReply } from 'fastify'
import { RbacUserBindingModel } from '../infrastructure/models/RbacUserBinding.js'
import { RbacRoleModelV2 } from '../infrastructure/models/RbacRole.js'

interface CheckUserRbacParams {
  apiPath: string
  uuid?: string
  uid?: number
}

interface CheckUserRbacResult {
  status: number
  message: string
}

/**
 * Check user permissions by RBAC
 * @param params RBAC check parameters
 * @returns RBAC check result
 */
export const checkUserByRbac = async (params: CheckUserRbacParams): Promise<CheckUserRbacResult> => {
  try {
    const { apiPath } = params
    let { uuid, uid } = params

    if (!uuid && uid === undefined) {
      console.error('ERROR', 'User RBAC authorization failed, UUID or UID not provided')
      return { status: 500, message: 'User RBAC authorization failed, UUID or UID not provided' }
    }

    if (!apiPath) {
      console.error('ERROR', 'User RBAC authorization failed, API path not provided')
      return { status: 500, message: 'User RBAC authorization failed, API path not provided' }
    }

    // Strip query parameters from apiPath for permission checking
    const cleanApiPath = apiPath.split('?')[0] || apiPath

    // Build query to find user - use OR query if both uuid and uid are provided
    let userQuery: any
    if (uuid && uid !== undefined) {
      userQuery = { $or: [{ uuid }, { userId: uid }] }
    } else if (uuid) {
      userQuery = { uuid }
    } else if (uid !== undefined) {
      userQuery = { userId: uid }
    } else {
      return { status: 500, message: 'User RBAC authorization failed, UUID or UID not provided' }
    }

    // Get user binding with roles
    const userBinding = await RbacUserBindingModel.findOne(userQuery).lean()
    if (!userBinding) {
      return { status: 403, message: `User ${uuid ? `UUID: ${uuid}` : `UID: ${uid}`} does not exist` }
    }

    const userRoles = userBinding.roles || []
    if (userRoles.length === 0) {
      return { status: 403, message: `User ${uuid ? `UUID: ${uuid}` : `UID: ${uid}`} has no roles assigned` }
    }

    // Check if any role has permission for this API path
    const rolesWithPermissions = await RbacRoleModelV2.find({
      roleName: { $in: userRoles }
    }).lean()

    const hasPermission = rolesWithPermissions.some(role => 
      role.apiPathPermissions && role.apiPathPermissions.some(permissionPath => matchesApiPath(permissionPath, cleanApiPath))
    )

    if (hasPermission) {
      return { status: 200, message: `User ${uuid ? `UUID: ${uuid}` : `UID: ${uid}`} has permission to access ${cleanApiPath}` }
    } else {
      return { status: 403, message: `User ${uuid ? `UUID: ${uuid}` : `UID: ${uid}`} has insufficient permissions to access ${cleanApiPath}` }
    }

  } catch (error) {
    console.error('ERROR', 'User RBAC authorization error:', error)
    return { status: 500, message: 'User RBAC authorization error' }
  }
}

function matchesApiPath(permissionPath: string, requestPath: string) {
  if (!permissionPath) return false
  const cleanPermission = permissionPath.split('?')[0] || permissionPath

  if (cleanPermission === requestPath) return true

  const permissionSegments = cleanPermission.split('/')
  const requestSegments = requestPath.split('/')

  if (permissionSegments.length !== requestSegments.length) return false

  return permissionSegments.every((segment, index) => {
    const requestSegment = requestSegments[index] ?? ''
    if (!segment) return segment === requestSegment
    if (segment.startsWith(':')) {
      return requestSegment.length > 0
    }
    return segment === requestSegment
  })
}

/**
 * RBAC check wrapper for controllers
 * This function is a wrapper for checkUserByRbac that includes error handling and response setting
 * @param params RBAC check parameters
 * @param request Fastify request
 * @param reply Fastify reply
 * @returns boolean indicating if check passed
 */
export const isPassRbacCheck = async (params: CheckUserRbacParams, request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
  try {
    const rbacCheckResult = await checkUserByRbac(params)
    const { status: rbacStatus, message: rbacMessage } = rbacCheckResult
    
    if (rbacStatus !== 200) {
      reply.code(rbacStatus).send({ success: false, message: rbacMessage })
      console.warn('WARN', 'RBAC', `${rbacStatus} - ${rbacMessage}`)
      return false
    }

    return true
  } catch (error) {
    console.error('ERROR', 'RBAC authorization error in controller:', error)
    reply.code(500).send({ success: false, message: 'RBAC authorization error' })
    return false
  }
}

/**
 * Get user roles by UUID or UID
 * @param params User identifier parameters
 * @returns User roles
 */
export const getUserRoles = async (params: { uuid?: string; uid?: number }): Promise<string[]> => {
  try {
    const { uuid, uid } = params

    if (!uuid && uid === undefined) {
      return []
    }

    // Build query to find user - use OR query if both uuid and uid are provided
    let userQuery: any
    if (uuid && uid !== undefined) {
      userQuery = { $or: [{ uuid }, { userId: uid }] }
    } else if (uuid) {
      userQuery = { uuid }
    } else if (uid !== undefined) {
      userQuery = { userId: uid }
    } else {
      return []
    }

    const userBinding = await RbacUserBindingModel.findOne(userQuery).lean()
    return userBinding?.roles || []
  } catch (error) {
    console.error('ERROR', 'Failed to get user roles:', error)
    return []
  }
}

/**
 * Check if user has any of the specified roles
 * @param params User identifier parameters
 * @param requiredRoles Array of required roles
 * @returns Boolean indicating if user has any required role
 */
export const hasAnyRole = async (params: { uuid?: string; uid?: number }, requiredRoles: string[]): Promise<boolean> => {
  const userRoles = await getUserRoles(params)
  return requiredRoles.some(role => userRoles.includes(role))
}

/**
 * Check if user has admin role (root or administrator)
 * @param params User identifier parameters
 * @returns Boolean indicating if user is admin
 */
export const isAdmin = async (params: { uuid?: string; uid?: number }): Promise<boolean> => {
  return await hasAnyRole(params, ['root', 'administrator'])
} 