// MongoDB database connection and management
import mongoose from 'mongoose';
import { ENV } from '../config/environment.js';

class DatabaseManager {
  private isConnected = false;
  
  private get connectionString(): string {
    const { MONGODB_PROTOCOL, MONGODB_CLUSTER_HOST, MONGODB_NAME, MONGODB_USERNAME, MONGODB_PASSWORD } = ENV;
    
    if (MONGODB_USERNAME && MONGODB_PASSWORD) {
      return `${MONGODB_PROTOCOL}://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@${MONGODB_CLUSTER_HOST}/${MONGODB_NAME}?authSource=admin`;
    }
    
    return `${MONGODB_PROTOCOL}://${MONGODB_CLUSTER_HOST}/${MONGODB_NAME}`;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('✅ MongoDB already connected');
      return;
    }

    try {
      // Configure mongoose
      mongoose.set('strictQuery', false);
      mongoose.set('debug', ENV.NODE_ENV === 'development');

      // Connection options
      const options = {
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
        retryWrites: true,
        w: 'majority' as const
      };

      // Connect to MongoDB
      await mongoose.connect(this.connectionString, options);
      
      this.isConnected = true;
      console.log('✅ MongoDB connected successfully');
      console.log(`📍 Database: ${ENV.MONGODB_NAME}`);
      console.log(`🌐 Host: ${ENV.MONGODB_CLUSTER_HOST}`);

      // Handle connection events
      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
        this.isConnected = true;
      });

      // Graceful shutdown
      process.on('SIGINT', this.gracefulShutdown.bind(this));
      process.on('SIGTERM', this.gracefulShutdown.bind(this));

    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('✅ MongoDB disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  private async gracefulShutdown(): Promise<void> {
    console.log('🔄 Graceful shutdown initiated...');
    await this.disconnect();
    process.exit(0);
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  getConnectionString(): string {
    return this.connectionString.replace(/\/\/.*@/, '//***:***@'); // Hide credentials in logs
  }
}

// Export singleton instance
export const databaseManager = new DatabaseManager();

// Export mongoose instance for use in models
export { mongoose };

// Export connection status
export const isDatabaseConnected = () => databaseManager.getConnectionStatus(); 