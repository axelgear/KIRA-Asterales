// Elasticsearch connection and management
import { Client } from '@elastic/elasticsearch';
import { ENV } from '../config/environment.js';

class ElasticsearchManager {
  private client: Client | null = null;
  private isConnected = false;
  private readonly clusterNodes: string[];

  constructor() {
    // Parse cluster hosts (support for multiple nodes)
    const hosts = ENV.ELASTICSEARCH_CLUSTER_HOST.split(',').map(host => host.trim());
    this.clusterNodes = hosts.map(host => 
      `${ENV.ELASTICSEARCH_PROTOCOL}://${ENV.ELASTICSEARCH_ADMIN_USERNAME}:${ENV.ELASTICSEARCH_ADMIN_PASSWORD}@${host}`
    );
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      console.log('✅ Elasticsearch already connected');
      return;
    }

    try {
      console.log('🔍 Connecting to Elasticsearch cluster...');
      console.log(`   Nodes: ${this.clusterNodes.length}`);
      console.log(`   Protocol: ${ENV.ELASTICSEARCH_PROTOCOL}`);

      this.client = new Client({
        nodes: this.clusterNodes,
        auth: {
          username: ENV.ELASTICSEARCH_ADMIN_USERNAME as unknown as string,
          password: ENV.ELASTICSEARCH_ADMIN_PASSWORD as unknown as string
        },
        tls: {
          rejectUnauthorized: false // For development, enable in production
        },
        maxRetries: 3,
        requestTimeout: 10000,
        sniffOnStart: true,
        sniffInterval: 30000,
        sniffOnConnectionFault: true
      });

      // Test connection
      const info = await this.client.info();
      this.isConnected = true;
      
      console.log('✅ Elasticsearch connected successfully');
      console.log(`   Cluster: ${info.cluster_name}`);
      console.log(`   Version: ${info.version.number}`);
      console.log(`   Lucene: ${info.version.lucene_version}`);

      // Set up event listeners
      this.setupEventListeners();

    } catch (error) {
      console.error('❌ Failed to connect to Elasticsearch:', error);
      this.isConnected = false;
      this.client = null;
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.client) return;

    // Note: Elasticsearch client doesn't support event listeners like MongoDB
    // Connection status is checked on each operation
    
    // Graceful shutdown
    process.on('SIGINT', this.gracefulShutdown.bind(this));
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
  }

  async disconnect(): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      await this.client.close();
      this.isConnected = false;
      this.client = null;
      console.log('✅ Elasticsearch disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting from Elasticsearch:', error);
      throw error;
    }
  }

  private async gracefulShutdown(): Promise<void> {
    console.log('🔄 Elasticsearch graceful shutdown initiated...');
    await this.disconnect();
  }

  getClient(): Client {
    if (!this.client || !this.isConnected) {
      throw new Error('Elasticsearch client not connected. Call connect() first.');
    }
    return this.client;
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async healthCheck(): Promise<any> {
    if (!this.client) {
      return { status: 'disconnected', error: 'Client not initialized' };
    }

    try {
      const health = await this.client.cluster.health();
      return {
        status: 'connected',
        cluster: health.cluster_name,
        clusterStatus: health.status,
        nodes: health.number_of_nodes,
        shards: health.active_shards
      };
    } catch (error) {
      return { status: 'error', error: (error as Error).message };
    }
  }

  async createIndex(indexName: string, mapping: any): Promise<boolean> {
    try {
      const client = this.getClient();
      const exists = await client.indices.exists({ index: indexName });
      
      if (!exists) {
        // For Elasticsearch 8.x, the structure should be different
        const indexBody: any = {};
        
        // Add settings if they exist
        if (mapping.settings) {
          indexBody.settings = mapping.settings;
        }
        
        // Add mappings if they exist
        if (mapping.mappings) {
          indexBody.mappings = mapping.mappings;
        }
        
        await client.indices.create({
          index: indexName,
          body: indexBody
        });
        console.log(`✅ Created index: ${indexName}`);
        return true;
      } else {
        console.log(`ℹ️ Index already exists: ${indexName}`);
        return true;
      }
    } catch (error) {
      console.error(`❌ Failed to create index ${indexName}:`, error);
      return false;
    }
  }

  async deleteIndex(indexName: string): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.indices.delete({ index: indexName });
      console.log(`✅ Deleted index: ${indexName}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete index ${indexName}:`, error);
      return false;
    }
  }

  async bulkIndex(indexName: string, documents: any[]): Promise<boolean> {
    try {
      const client = this.getClient();
      const operations = documents.flatMap(doc => [
        { index: { _index: indexName } },
        doc
      ]);

      const result = await client.bulk({ body: operations });
      
      if (result.errors) {
        console.error('❌ Bulk indexing errors:', result.items.filter(item => item.index?.error));
        return false;
      }

      console.log(`✅ Bulk indexed ${documents.length} documents to ${indexName}`);
      return true;
    } catch (error) {
      console.error(`❌ Bulk indexing failed for ${indexName}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const elasticsearchManager = new ElasticsearchManager();

// Export client getter
export const getElasticsearchClient = () => elasticsearchManager.getClient();

// Export connection status
export const isElasticsearchConnected = () => elasticsearchManager.getConnectionStatus(); 