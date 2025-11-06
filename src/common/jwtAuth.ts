import type { FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import { ENV } from '../config/environment.js'

/**
 * JWT Authentication and Authorization Utilities
 * 
 * Provides secure JWT token validation for API endpoints
 * Extracts and validates userUuid from JWT tokens to prevent XSS attacks
 * and user enumeration vulnerabilities.
 */

export interface JwtPayload {
	uid?: number;
	uuid?: string;
	roles?: string[];
	iat?: number;
	exp?: number;
}

export interface AuthResult {
	isValid: boolean;
	userUuid: string | null;
	userId: number | null;
	roles: string[];
	error?: string;
}

/**
 * Validate JWT token and extract secure userUuid
 * 
 * This function provides secure authentication by:
 * 1. Verifying JWT signature using server secret
 * 2. Checking token expiration
 * 3. Cross-validating JWT payload with cookies
 * 4. Returning secure UUID instead of sequential ID
 * 
 * @param request - Fastify request object containing cookies
 * @returns userUuid if valid, null if invalid
 */
export function validateTokenAndGetUserUuid(request: FastifyRequest): string | null {
	try {
		const cookies: any = request.cookies || {}
		const token = cookies?.token as string | undefined
		const userUuid = cookies?.uuid as string | undefined
		
		// Both token and userUuid must be present
		if (!token || !userUuid) {
			console.log('❌ Missing token or userUuid in cookies')
			return null
		}
		
		// Verify JWT token using server secret
		const payload = jwt.verify(token, ENV.JWT_SECRET as unknown as jwt.Secret) as JwtPayload
		
		// Validate that JWT payload contains matching userUuid
		if (payload && payload.uuid === userUuid) {
			console.log(`✅ Token validated for user: ${userUuid}`)
			return userUuid
		}
		
		console.log('❌ JWT payload userUuid mismatch')
		return null
	} catch (error) {
		console.log('❌ JWT token verification failed:', error instanceof Error ? error.message : 'Unknown error')
		return null
	}
}

/**
 * Comprehensive JWT token validation with detailed results
 * 
 * @param request - Fastify request object containing cookies
 * @returns Detailed authentication result
 */
export function validateJwtToken(request: FastifyRequest): AuthResult {
	try {
		const cookies: any = request.cookies || {}
		const token = cookies?.token as string | undefined
		const userUuid = cookies?.uuid as string | undefined
		const userId = cookies?.uid ? Number(cookies.uid) : null
		
		// Check if required cookies are present
		if (!token) {
			return {
				isValid: false,
				userUuid: null,
				userId: null,
				roles: [],
				error: 'JWT token missing'
			}
		}
		
		if (!userUuid) {
			return {
				isValid: false,
				userUuid: null,
				userId: null,
				roles: [],
				error: 'User UUID missing'
			}
		}
		
		// Verify JWT token
		const payload = jwt.verify(token, ENV.JWT_SECRET as unknown as jwt.Secret) as JwtPayload
		
		// Cross-validate payload with cookies
		const uuidMatch = payload.uuid === userUuid
		const uidMatch = !userId || payload.uid === userId
		
		if (!uuidMatch) {
			return {
				isValid: false,
				userUuid: null,
				userId: null,
				roles: [],
				error: 'JWT userUuid mismatch'
			}
		}
		
		if (!uidMatch) {
			return {
				isValid: false,
				userUuid: null,
				userId: null,
				roles: [],
				error: 'JWT userId mismatch'
			}
		}
		
		// Return successful validation result
		return {
			isValid: true,
			userUuid: payload.uuid || userUuid,
			userId: payload.uid || userId,
			roles: payload.roles || [],
		}
		
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		console.log('❌ JWT token verification failed:', errorMessage)
		
		return {
			isValid: false,
			userUuid: null,
			userId: null,
			roles: [],
			error: errorMessage
		}
	}
}

/**
 * Check if user has specific role
 * 
 * @param request - Fastify request object
 * @param requiredRole - Role to check for
 * @returns boolean indicating if user has the role
 */
export function hasRole(request: FastifyRequest, requiredRole: string): boolean {
	const authResult = validateJwtToken(request)
	return authResult.isValid && authResult.roles.includes(requiredRole)
}

/**
 * Check if user is admin (has 'administrator' or 'root' role)
 * 
 * @param request - Fastify request object
 * @returns boolean indicating if user is admin
 */
export function isAdmin(request: FastifyRequest): boolean {
	const authResult = validateJwtToken(request)
	if (!authResult.isValid) return false
	
	return authResult.roles.includes('administrator') || authResult.roles.includes('root')
}

/**
 * Middleware-style authentication handler
 * Returns standardized error responses for invalid authentication
 * 
 * @param request - Fastify request object
 * @returns AuthResult if valid, error response object if invalid
 */
export function requireAuth(request: FastifyRequest): AuthResult | { success: false; message: string } {
	const authResult = validateJwtToken(request)
	
	if (!authResult.isValid) {
		return {
			success: false,
			message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
		}
	}
	
	return authResult
}

/**
 * Legacy function for backward compatibility
 * Use validateTokenAndGetUserUuid for new implementations
 * 
 * @deprecated Use validateTokenAndGetUserUuid instead
 */
export function getUserUuidFromToken(request: FastifyRequest): string | null {
	return validateTokenAndGetUserUuid(request)
}
