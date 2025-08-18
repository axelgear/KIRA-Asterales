import 'dotenv/config';

export const ENV = {
  // Server Configuration
  SERVER_PORT: parseInt(process.env.SERVER_PORT || '9999', 10),
  SERVER_ENV: process.env.SERVER_ENV,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // RBAC Configuration
  RBAC_DISABLE: process.env.RBAC_DISABLE === 'true',
  
  // MongoDB Configuration
  MONGODB_PROTOCOL: process.env.MONGODB_PROTOCOL || 'mongodb',
  MONGODB_CLUSTER_HOST: process.env.MONGODB_CLUSTER_HOST || '',
  MONGODB_NAME: process.env.MONGODB_NAME,
  MONGODB_USERNAME: process.env.MONGODB_USERNAME,
  MONGODB_PASSWORD: process.env.MONGODB_PASSWORD,
  
  // Elasticsearch Configuration
  ELASTICSEARCH_PROTOCOL: process.env.ELASTICSEARCH_PROTOCOL || 'http',
  ELASTICSEARCH_CLUSTER_HOST: process.env.ELASTICSEARCH_CLUSTER_HOST || '',
  ELASTICSEARCH_ADMIN_USERNAME: process.env.ELASTICSEARCH_ADMIN_USERNAME,
  ELASTICSEARCH_ADMIN_PASSWORD: process.env.ELASTICSEARCH_ADMIN_PASSWORD,
  
  // Redis Configuration
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  
  // SMTP Configuration
  SMTP_ENDPOINT: process.env.SMTP_ENDPOINT || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '465', 10),
  SMTP_USER_NAME: process.env.SMTP_USER_NAME || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  
  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  // Security Configuration
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  TOTP_ISSUER: process.env.TOTP_ISSUER ,
  
  // Performance Configuration
  ENABLE_COMPRESSION: process.env.ENABLE_COMPRESSION === 'true',
  ENABLE_PERFORMANCE_MONITORING: process.env.ENABLE_PERFORMANCE_MONITORING === 'true',
  
  // Cache TTL Configuration
  CACHE_TTL_SHORT: parseInt(process.env.CACHE_TTL_SHORT || '300', 10),
  CACHE_TTL_MEDIUM: parseInt(process.env.CACHE_TTL_MEDIUM || '1800', 10),
  CACHE_TTL_LONG: parseInt(process.env.CACHE_TTL_LONG || '3600', 10),
  CACHE_TTL_VERY_LONG: parseInt(process.env.CACHE_TTL_VERY_LONG || '86400', 10)
} as const;

// Type for environment variables
export type Environment = typeof ENV;

// Validation function
export function validateEnvironment(): void {
  const required = [
    'MONGODB_CLUSTER_HOST',
    'MONGODB_NAME',
    'JWT_SECRET'
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      console.warn(`⚠️ Warning: ${key} is not set`);
    }
  }
  
  console.log('✅ Environment configuration loaded');
} 