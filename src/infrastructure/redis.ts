// Redis connection and caching management
import Redis from 'ioredis';
import { ENV } from '../config/environment.js';

class RedisManager {
  private client: Redis | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      console.log('✅ Redis already connected');
      return;
    }

    try {
      console.log('🟡 Connecting to Redis...');
      console.log(`   Host: ${ENV.REDIS_HOST}:${ENV.REDIS_PORT}`);
      
      // Create Redis client with proper options
      const options: any = {
        host: ENV.REDIS_HOST,
        port: ENV.REDIS_PORT,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000
      };

      // Only add password if it exists
      if (ENV.REDIS_PASSWORD) {
        options.password = ENV.REDIS_PASSWORD;
      }

      this.client = new Redis(options);

      // Test connection
      if (this.client) {
        await this.client.ping();
        this.isConnected = true;
        
        console.log('✅ Redis connected successfully');
        console.log(`   Host: ${ENV.REDIS_HOST}:${ENV.REDIS_PORT}`);

        // Set up event listeners
        this.setupEventListeners();
      }

    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      this.isConnected = false;
      this.client = null;
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.client) return;

    // Handle connection events
    this.client.on('connect', () => {
      console.log('🔄 Redis connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      console.log('✅ Redis ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      console.error('❌ Redis error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('⚠️ Redis connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    // Graceful shutdown
    process.on('SIGINT', this.gracefulShutdown.bind(this));
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
  }

  async disconnect(): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      await this.client.quit();
      this.isConnected = false;
      this.client = null;
      console.log('✅ Redis disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error);
      throw error;
    }
  }

  private async gracefulShutdown(): Promise<void> {
    console.log('🔄 Redis graceful shutdown initiated...');
    await this.disconnect();
  }

  getClient(): Redis {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected. Call connect() first.');
    }
    return this.client;
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // Cache operations
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const client = this.getClient();
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttl) {
        await client.setex(key, ttl, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  async get(key: string): Promise<any> {
    try {
      const client = this.getClient();
      const value = await client.get(key);
      
      if (value === null) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value; // Return as string if not JSON
      }
    } catch (error) {
      console.error(`❌ Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const result = await client.del(key);
      return result > 0;
    } catch (error) {
      console.error(`❌ Redis DEL error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const client = this.getClient();
      const result = await client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const client = this.getClient();
      return await client.ttl(key);
    } catch (error) {
      console.error(`❌ Redis TTL error for key ${key}:`, error);
      return -1;
    }
  }

  // Health check
  async healthCheck(): Promise<any> {
    if (!this.client) {
      return { status: 'disconnected', error: 'Client not initialized' };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      const info = await this.client.info('server');
      const version = info.split('\r\n').find(line => line.startsWith('redis_version:'))?.split(':')[1] || 'unknown';
      
      return {
        status: 'connected',
        mode: 'single',
        version,
        latency: `${latency}ms`,
        host: `${ENV.REDIS_HOST}:${ENV.REDIS_PORT}`
      };
    } catch (error) {
      return { status: 'error', error: (error as Error).message };
    }
  }
}

// Export singleton instance
export const redisManager = new RedisManager();

// Export client getter
export const getRedisClient = () => redisManager.getClient();

// Export connection status
export const isRedisConnected = () => redisManager.getConnectionStatus();