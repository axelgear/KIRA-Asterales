// Common types used throughout the application

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SearchParams {
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  count?: number;
  message?: string;
  error?: string;
}

export interface CacheOptions {
  ttl?: number;
  key?: string;
  tags?: string[];
}

export interface UserContext {
  userId: number;
  uuid: string;
  roles: string[];
  permissions: string[];
  isAdmin: boolean;
}

export interface RequestContext {
  user?: UserContext;
  requestId: string;
  timestamp: number;
  ip: string;
  userAgent: string;
}

// HTTP Status codes
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503
}

// Common error types
export class AppError extends Error {
  constructor(
    public statusCode: HttpStatus,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message, true);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(HttpStatus.UNAUTHORIZED, message, true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(HttpStatus.FORBIDDEN, message, true);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(HttpStatus.NOT_FOUND, message, true);
  }
} 