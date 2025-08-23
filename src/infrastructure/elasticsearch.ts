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
      console.log(`   Using nodes: ${this.clusterNodes.join(', ')}`);

      this.client = new Client({
        node: this.clusterNodes,
        auth: {
          username: ENV.ELASTICSEARCH_ADMIN_USERNAME as unknown as string,
          password: ENV.ELASTICSEARCH_ADMIN_PASSWORD as unknown as string
        },
        tls: {
          rejectUnauthorized: false // For development, enable in production
        },
        // Performance optimizations
        maxRetries: 1, // Reduce retries for faster failure
        requestTimeout: 5000, // Reduce timeout from 10s to 5s
        pingTimeout: 3000,
        sniffOnStart: false,
        sniffInterval: 0,
        sniffOnConnectionFault: false,
        // Compression for better network performance
        compression: true
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
      const stats = await this.client.cluster.stats();
      return {
        status: 'connected',
        cluster: health.cluster_name,
        clusterStatus: health.status,
        nodes: health.number_of_nodes,
        shards: {
          active: health.active_shards,
          initializing: health.initializing_shards,
          unassigned: health.unassigned_shards
        },
        performance: {
          indices: stats.indices,
          nodes: stats.nodes
        }
      };
    } catch (error) {
      return { status: 'error', error: (error as Error).message };
    }
  }

  // Optimize index settings for better performance
  async optimizeIndexSettings(indexName: string): Promise<boolean> {
    try {
      const client = this.getClient();

      // Check if index exists
      const exists = await client.indices.exists({ index: indexName });
      if (!exists) {
        console.log(`⚠️ Index ${indexName} does not exist, skipping optimization`);
        return false;
      }

      // Apply performance optimizations
      await client.indices.putSettings({
        index: indexName,
        body: {
          settings: {
            // Cache settings
            'index.queries.cache.enabled': true,
            'index.requests.cache.enable': true,

            // Refresh interval - less frequent for better write performance
            'index.refresh_interval': '30s',

            // Merge settings for better search performance
            'index.merge.policy.max_merge_at_once': 10,
            'index.merge.policy.segments_per_tier': 10,

            // Translog settings for durability vs performance balance
            'index.translog.durability': 'async',
            'index.translog.flush_threshold_size': '512mb'
          }
        }
      });

      console.log(`✅ Optimized settings for index: ${indexName}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to optimize index ${indexName}:`, error);
      return false;
    }
  }

  // Get performance statistics
  async getPerformanceStats(): Promise<any> {
    try {
      const client = this.getClient();

      const [clusterHealth, clusterStats, nodesStats] = await Promise.all([
        client.cluster.health(),
        client.cluster.stats(),
        client.nodes.stats({ metric: 'jvm,os,fs,indices' })
      ]);

      return {
        cluster: {
          name: clusterHealth.cluster_name,
          status: clusterHealth.status,
          nodes: clusterHealth.number_of_nodes,
          activeShards: clusterHealth.active_shards
        },
        performance: {
          indices: clusterStats.indices,
          nodes: clusterStats.nodes,
          detailedNodes: nodesStats.nodes
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to get performance stats:', error);
      return { error: (error as Error).message };
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