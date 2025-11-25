// Main Fastify application
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyCompress from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';

// Import our modules
import { validateEnvironment } from './config/environment.js';
import { databaseManager } from './infrastructure/database.js';
import { elasticsearchManager } from './infrastructure/elasticsearch.js';
import { redisManager } from './infrastructure/redis.js';


async function bootstrap() {
  try {
    // Validate environment variables
    validateEnvironment();
    
    // Create Fastify instance with performance optimizations
    const fastify = Fastify({
      logger: process.env.NODE_ENV === 'development',
      trustProxy: true,
      bodyLimit: 1048576,
      requestTimeout: 15000,
      connectionTimeout: 5000,
      keepAliveTimeout: 5000,
      maxRequestsPerSocket: 1000,
      maxParamLength: 500 // Allow longer URL parameters for long novel slugs
    });

    // Accept empty JSON body as {} (for Rosales POST endpoints like /user/self)
    fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body: string, done) => {
      if (!body || body.trim() === '') return done(null, {} as any)
      try {
        const json = JSON.parse(body)
        done(null, json)
      } catch (err) {
        done(err as Error, undefined as any)
      }
    })

    // Register plugins
    await fastify.register(fastifyCors, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
    });

    await fastify.register(fastifyCookie, {
      secret: process.env.COOKIE_SECRET as string
    });

    await fastify.register(fastifyCompress);

    const csrfPlugin = (await import('./plugins/csrf.js')).default
    await fastify.register(csrfPlugin)

    // Register RBAC plugin
    const rbacPlugin = (await import('./plugins/rbac.js')).default
    await fastify.register(rbacPlugin)

    await fastify.register(fastifyRateLimit, {
      max: 100,                        // 100 requests per window
      timeWindow: '1 minute',          // 1 minute window
      allowList: ['127.0.0.1'],        // Allow localhost
      errorResponseBuilder: (request, context) => ({
        code: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${context.after}`,
        retryAfter: context.after
      })
    });

    // Connect to database
    try {
      await databaseManager.connect();
    } catch (error) {
      console.warn('⚠️ MongoDB connection failed, continuing without database...');
      console.warn('   This is normal during development setup');
    }

    // Connect to Elasticsearch
    try {
      await elasticsearchManager.connect();
    } catch (error) {
      console.warn('⚠️ Elasticsearch connection failed, continuing without search...');
      console.warn('   This is normal during development setup');
    }

    // Connect to Redis
    try {
      await redisManager.connect();
    } catch (error) {
      console.warn('⚠️ Redis connection failed, continuing without caching...');
      console.warn('   This is normal during development setup');
    }

    // Register routes (will be added later)
      // For now, a simple health check is registered above
    const registerRoutes = (await import('./api/routes/index.js')).default
    await fastify.register(registerRoutes)

    // Health check endpoint
    fastify.get('/health', async (request, reply) => {
      const mongoStatus = databaseManager.getConnectionStatus();
      const elasticsearchStatus = elasticsearchManager.getConnectionStatus();
      const redisStatus = redisManager.getConnectionStatus();
      
      let elasticsearchHealth: any = { status: 'disconnected' };
      if (elasticsearchStatus) {
        try {
          elasticsearchHealth = await elasticsearchManager.healthCheck();
        } catch (error) {
          elasticsearchHealth = { status: 'error', error: 'Health check failed' };
        }
      }

      let redisHealth: any = { status: 'disconnected' };
      if (redisStatus) {
        try {
          redisHealth = await redisManager.healthCheck();
        } catch (error) {
          redisHealth = { status: 'error', error: 'Health check failed' };
        }
      }

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: mongoStatus ? 'connected' : 'disconnected',
        elasticsearch: elasticsearchHealth,
        redis: redisHealth,
        environment: process.env.NODE_ENV
      };
    });

    // Global error handler
    fastify.setErrorHandler((error, request, reply) => {
      console.error('Fastify error:', error);
      
      // Don't expose internal errors in production
      const statusCode = error.statusCode || 500;
      const message = statusCode === 500 && process.env.NODE_ENV === 'production' 
        ? 'Internal Server Error' 
        : error.message;

      reply.status(statusCode).send({
        success: false,
        error: message,
        statusCode,
        timestamp: new Date().toISOString()
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
      
      try {
        await fastify.close();
        await databaseManager.disconnect();
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Start server
    const port = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 9999;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    
    console.log('🚀 KIRA-Asterales server started successfully!');
    console.log(`📍 Server running on http://${host}:${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Health check: http://${host}:${port}/health`);

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap().catch((error) => {
  console.error('❌ Bootstrap failed:', error);
  process.exit(1);
}); 