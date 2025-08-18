// Elasticsearch index management service for novels and chapters
import { elasticsearchManager } from '../infrastructure/elasticsearch.js';
import { ENV } from '../config/environment.js';

export class ElasticsearchIndexService {
  private readonly novelIndexPrefix = 'novels';
  private readonly chapterIndexPrefix = 'chapters';
  private readonly currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  constructor() {}

  /**
   * Create all required indices for the novel system
   */
  async createAllIndices(): Promise<{ success: boolean; results: any }> {
    try {
      console.log('🔍 Creating Elasticsearch indices...');
      
      const results = {
        novels: await this.createNovelIndex(),
        chapters: await this.createChapterIndex(),
        genres: await this.createGenreIndex(),
        tags: await this.createTagIndex(),
        users: await this.createUserIndex()
      };

      const allSuccess = Object.values(results).every(result => result.success);
      
      if (allSuccess) {
        console.log('✅ All Elasticsearch indices created successfully');
      } else {
        console.log('⚠️ Some indices failed to create');
      }

      return {
        success: allSuccess,
        results
      };
    } catch (error) {
      console.error('❌ Failed to create indices:', error);
      return {
        success: false,
        results: { error: (error as Error).message }
      };
    }
  }

  /**
   * Create novel index with proper mapping
   */
  private async createNovelIndex(): Promise<{ success: boolean; indexName?: string; error?: string }> {
    try {
      const indexName = `${this.novelIndexPrefix}-${this.currentDate}`;
      
      const mapping = {
        properties: {
          // Basic novel information
          novelId: { type: 'long' },
          title: { 
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' },
              suggest: { type: 'completion' }
            }
          },
          slug: { 
            type: 'keyword',
            normalizer: 'lowercase'
          },
          description: { 
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          altNames: { 
            type: 'text',
            analyzer: 'standard'
          },
          
          // Author information
          author: { 
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          originalAuthor: { 
            type: 'text',
            analyzer: 'standard'
          },
          uploaderId: { type: 'long' },
          uploaderUUID: { type: 'keyword' },
          
          // Content classification
          genres: {
            type: 'nested',
            properties: {
              genreId: { type: 'long' },
              genreName: { 
                type: 'text',
                analyzer: 'standard',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              isDefault: { type: 'boolean' }
            }
          },
          tags: {
            type: 'nested',
            properties: {
              tagId: { type: 'long' },
              tagName: { 
                type: 'text',
                analyzer: 'standard',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              isDefault: { type: 'boolean' }
            }
          },
          
          // Content details
          status: { type: 'keyword' },
          copyright: { type: 'keyword' },
          originalLink: { type: 'keyword' },
          wordCount: { type: 'long' },
          chapterCount: { type: 'long' },
          
          // Statistics and metrics
          views: { type: 'long' },
          dailyViews: { type: 'long' },
          weeklyViews: { type: 'long' },
          monthlyViews: { type: 'long' },
          upvoteCount: { type: 'long' },
          downvoteCount: { type: 'long' },
          watchedCount: { type: 'long' },
          
          // Metadata
          image: { type: 'keyword' },
          published: { type: 'boolean' },
          pendingReview: { type: 'boolean' },
          isBlocked: { type: 'boolean' },
          isHidden: { type: 'boolean' },
          
          // Timestamps
          uploadDate: { type: 'date' },
          publishDateTime: { type: 'date' },
          editDateTime: { type: 'date' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
          
          // Search optimization
          searchScore: { type: 'float' },
          popularityScore: { type: 'float' }
        }
      };

      const settings = {
        number_of_shards: 2,
        number_of_replicas: 1,
        analysis: {
          analyzer: {
            novel_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'stop', 'snowball']
            }
          }
        }
      };

      const success = await elasticsearchManager.createIndex(indexName, { mappings: mapping, settings });
      
      if (success) {
        return {
          success: true,
          indexName
        };
      } else {
        return {
          success: false,
          error: 'Failed to create index'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Create chapter index with proper mapping
   */
  private async createChapterIndex(): Promise<{ success: boolean; indexName?: string; error?: string }> {
    try {
      const indexName = `${this.chapterIndexPrefix}-${this.currentDate}`;
      
      const mapping = {
        properties: {
          // Basic chapter information
          chapterId: { type: 'long' },
          novelId: { type: 'long' },
          chapterNumber: { type: 'long' },
          chapterTitle: { 
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          chapterSlug: { 
            type: 'keyword',
            normalizer: 'lowercase'
          },
          
          // Content
          content: { 
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          wordCount: { type: 'long' },
          
          // Metadata
          isPublished: { type: 'boolean' },
          isBlocked: { type: 'boolean' },
          isHidden: { type: 'boolean' },
          pendingReview: { type: 'boolean' },
          
          // Statistics
          views: { type: 'long' },
          likes: { type: 'long' },
          dislikes: { type: 'long' },
          
          // Timestamps
          publishDateTime: { type: 'date' },
          editDateTime: { type: 'date' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
          
          // Search optimization
          searchScore: { type: 'float' }
        }
      };

      const settings = {
        number_of_shards: 2,
        number_of_replicas: 1,
        analysis: {
          analyzer: {
            chapter_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'stop', 'snowball']
            }
          }
        }
      };

      const success = await elasticsearchManager.createIndex(indexName, { mappings: mapping, settings });
      
      if (success) {
        return {
          success: true,
          indexName
        };
      } else {
        return {
          success: false,
          error: 'Failed to create index'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Create genre index for faceted search
   */
  private async createGenreIndex(): Promise<{ success: boolean; indexName?: string; error?: string }> {
    try {
      const indexName = 'genres';
      
      const mapping = {
        properties: {
          genreId: { type: 'long' },
          genreName: { 
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          description: { type: 'text' },
          isActive: { type: 'boolean' },
          sortOrder: { type: 'integer' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' }
        }
      };

      const settings = {
        number_of_shards: 1,
        number_of_replicas: 1
      };

      const success = await elasticsearchManager.createIndex(indexName, { mappings: mapping, settings });
      
      if (success) {
        return {
          success: true,
          indexName
        };
      } else {
        return {
          success: false,
          error: 'Failed to create index'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Create tag index for faceted search
   */
  private async createTagIndex(): Promise<{ success: boolean; indexName?: string; error?: string }> {
    try {
      const indexName = 'tags';
      
      const mapping = {
        properties: {
          tagId: { type: 'long' },
          tagName: { 
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          description: { type: 'text' },
          category: { type: 'keyword' },
          isActive: { type: 'boolean' },
          usageCount: { type: 'long' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' }
        }
      };

      const settings = {
        number_of_shards: 1,
        number_of_replicas: 1
      };

      const success = await elasticsearchManager.createIndex(indexName, { mappings: mapping, settings });
      
      if (success) {
        return {
          success: true,
          indexName
        };
      } else {
        return {
          success: false,
          error: 'Failed to create index'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Create user index for user-related searches
   */
  private async createUserIndex(): Promise<{ success: boolean; indexName?: string; error?: string }> {
    try {
      const indexName = 'users';
      
      const mapping = {
        properties: {
          userId: { type: 'long' },
          username: { 
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          nickname: { 
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          email: { type: 'keyword' },
          bio: { type: 'text' },
          isActive: { type: 'boolean' },
          roles: { type: 'keyword' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' }
        }
      };

      const settings = {
        number_of_shards: 1,
        number_of_replicas: 1
      };

      const success = await elasticsearchManager.createIndex(indexName, { mappings: mapping, settings });
      
      if (success) {
        return {
          success: true,
          indexName
        };
      } else {
        return {
          success: false,
          error: 'Failed to create index'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Get current index names
   */
  getCurrentIndexNames(): { novels: string; chapters: string; genres: string; tags: string; users: string } {
    return {
      novels: `${this.novelIndexPrefix}-${this.currentDate}`,
      chapters: `${this.chapterIndexPrefix}-${this.currentDate}`,
      genres: 'genres',
      tags: 'tags',
      users: 'users'
    };
  }

  /**
   * List all indices
   */
  async listAllIndices(): Promise<string[]> {
    try {
      const client = elasticsearchManager.getClient();
      const response = await client.cat.indices({ format: 'json' });
      return response.map((index: any) => index.index);
    } catch (error) {
      console.error('❌ Failed to list indices:', error);
      return [];
    }
  }

  /**
   * Delete test indices (for development)
   */
  async deleteTestIndices(): Promise<{ success: boolean; deleted: string[] }> {
    try {
      const indices = await this.listAllIndices();
      const testIndices = indices.filter(index => 
        index.includes('test') || 
        index.includes('novels-') || 
        index.includes('chapters-')
      );

      const deleted: string[] = [];
      for (const index of testIndices) {
        const success = await elasticsearchManager.deleteIndex(index);
        if (success) {
          deleted.push(index);
        }
      }

      return {
        success: deleted.length > 0,
        deleted
      };
    } catch (error) {
      console.error('❌ Failed to delete test indices:', error);
      return {
        success: false,
        deleted: []
      };
    }
  }
}

// Export singleton instance
export const elasticsearchIndexService = new ElasticsearchIndexService(); 