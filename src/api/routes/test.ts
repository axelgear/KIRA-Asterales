import type { FastifyInstance } from 'fastify'

// Test routes for development and debugging
export default async function testRoutes(fastify: FastifyInstance) {
  // Import required services
  const { elasticsearchIndexService } = await import('../../services/ElasticsearchIndexService.js')
  const { elasticsearchManager } = await import('../../infrastructure/elasticsearch.js')
  const { searchService } = await import('../../services/SearchService.js')

  // Elasticsearch index management endpoints
  fastify.get('/elasticsearch/indices', async (request, reply) => {
    try {
      const indices = await elasticsearchIndexService.listAllIndices();
      const currentIndices = elasticsearchIndexService.getCurrentIndexNames();

      return {
        success: true,
        currentIndices,
        allIndices: indices,
        message: 'Index information retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        message: 'Failed to retrieve index information'
      };
    }
  });

  fastify.post('/elasticsearch/indices/create', async (request, reply) => {
    try {
      const result = await elasticsearchIndexService.createAllIndices();

      return {
        success: result.success,
        results: result.results,
        message: result.success ? 'All indices created successfully' : 'Some indices failed to create'
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        message: 'Failed to create indices'
      };
    }
  });

  fastify.delete('/elasticsearch/indices/test', async (request, reply) => {
    try {
      const result = await elasticsearchIndexService.deleteTestIndices();

      return {
        success: result.success,
        deleted: result.deleted,
        message: result.success ? 'Test indices deleted successfully' : 'No test indices to delete'
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        message: 'Failed to delete test indices'
      };
    }
  });

  // Simple index creation test
  fastify.post('/elasticsearch/test-index', async (request, reply) => {
    try {
      const client = elasticsearchManager.getClient();

      // Try to create a simple test index
      const testIndexName = 'test-index-simple';

      // Check if index exists
      const exists = await client.indices.exists({ index: testIndexName });

      if (!exists) {
        // Create simple index
        await client.indices.create({
          index: testIndexName,
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0
            },
            mappings: {
              properties: {
                test_field: { type: 'text' },
                timestamp: { type: 'date' }
              }
            }
          }
        });

        return {
          success: true,
          message: 'Simple test index created successfully',
          indexName: testIndexName
        };
      } else {
        return {
          success: true,
          message: 'Test index already exists',
          indexName: testIndexName
        };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        message: 'Failed to create test index'
      };
    }
  });

  // Debug index creation
  fastify.post('/elasticsearch/debug-create', async (request, reply) => {
    try {
      const client = elasticsearchManager.getClient();
      const testIndexName = 'debug-test-index';

      console.log('🔍 Attempting to create debug index:', testIndexName);

      // Try direct creation
      const result = await client.indices.create({
        index: testIndexName,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0
          },
          mappings: {
            properties: {
              test_field: { type: 'text' }
            }
          }
        }
      });

      console.log('✅ Debug index created successfully:', result);

      return {
        success: true,
        message: 'Debug index created successfully',
        result: result
      };
    } catch (error) {
      console.error('❌ Debug index creation failed:', error);
      return {
        success: false,
        error: (error as Error).message,
        message: 'Debug index creation failed'
      };
    }
  });

  // Test indexing sample data
  fastify.post('/elasticsearch/test-indexing', async (request, reply) => {
    try {
      const client = elasticsearchManager.getClient();

      // Sample novel data
      const sampleNovel = {
        novelId: 99999,
        title: 'Test Novel - The Legendary Thief',
        slug: 'test-novel-legendary-thief',
        description: 'A thrilling test novel about a legendary thief who steals hearts and treasures.',
        author: 'Test Author',
        originalAuthor: 'Test Original Author',
        uploaderId: 1,
        uploaderUUID: 'test-uuid-123',
        genres: [
          { genreId: 1, genreName: 'Action', isDefault: true },
          { genreId: 2, genreName: 'Adventure', isDefault: true }
        ],
        tags: [
          { tagId: 1, tagName: 'Thief', isDefault: true },
          { tagId: 2, tagName: 'Magic', isDefault: true }
        ],
        status: 'ongoing',
        copyright: 'Original',
        wordCount: 50000,
        chapterCount: 10,
        views: 1000,
        dailyViews: 50,
        weeklyViews: 200,
        monthlyViews: 800,
        upvoteCount: 25,
        downvoteCount: 2,
        watchedCount: 150,
        image: 'test-cover.jpg',
        published: true,
        pendingReview: false,
        isBlocked: false,
        isHidden: false,
        uploadDate: new Date().toISOString(),
        publishDateTime: new Date().toISOString(),
        editDateTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        searchScore: 0.0,
        popularityScore: 0.0
      };

      // Index the sample novel
      const indexResult = await client.index({
        index: 'novels-2025-08-15',
        id: sampleNovel.novelId.toString(),
        body: sampleNovel
      });

      // Sample chapter data
      const sampleChapter = {
        chapterId: 99999,
        novelId: 99999,
        chapterNumber: 1,
        chapterTitle: 'Chapter 1: The Beginning',
        chapterSlug: 'chapter-1-the-beginning',
        content: 'This is the beginning of our test novel. The legendary thief was about to embark on his greatest adventure yet...',
        wordCount: 2500,
        isPublished: true,
        isBlocked: false,
        isHidden: false,
        pendingReview: false,
        views: 100,
        likes: 5,
        dislikes: 0,
        publishDateTime: new Date().toISOString(),
        editDateTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        searchScore: 0.0
      };

      // Index the sample chapter
      const chapterResult = await client.index({
        index: 'chapters-2025-08-15',
        id: sampleChapter.chapterId.toString(),
        body: sampleChapter
      });

      // Refresh indices to make data searchable
      await client.indices.refresh({ index: ['novels-2025-08-15', 'chapters-2025-08-15'] });

      return {
        success: true,
        message: 'Sample data indexed successfully',
        results: {
          novel: indexResult,
          chapter: chapterResult
        },
        data: {
          novel: sampleNovel,
          chapter: sampleChapter
        }
      };
    } catch (error) {
      console.error('❌ Test indexing failed:', error);
      return {
        success: false,
        error: (error as Error).message,
        message: 'Test indexing failed'
      };
    }
  });

  // Search endpoints (development/testing)
  fastify.get('/search/novels', async (request, reply) => {
    const qVal = (request.query as any).q as string | undefined
    const page = Number((request.query as any).page ?? 1)
    const limit = Number((request.query as any).limit ?? 20)
    const sortVal = (request.query as any).sort as string | undefined
    const orderVal = ((request.query as any).order as string | undefined)?.toLowerCase() as 'asc' | 'desc' | undefined
    const genres = ((request.query as any).genres as string | undefined)?.split(',').filter(Boolean)
    const tags = ((request.query as any).tags as string | undefined)?.split(',').filter(Boolean)
    const status = ((request.query as any).status as string | undefined)?.split(',').filter(Boolean)
    const uploaderId = (request.query as any).uploaderId ? Number((request.query as any).uploaderId) : undefined
    const published = (request.query as any).published !== undefined ? ((request.query as any).published === 'true') : undefined

    const filters: Record<string, any> = {}
    if (genres && genres.length) filters.genres = genres
    if (tags && tags.length) filters.tags = tags
    if (status && status.length) filters.status = status
    if (typeof uploaderId === 'number') filters.uploaderId = uploaderId
    if (typeof published === 'boolean') filters.published = published

    const params: any = { page, limit }
    if (qVal !== undefined) Object.assign(params, { q: qVal })
    if (sortVal !== undefined) Object.assign(params, { sort: sortVal })
    if (orderVal !== undefined) Object.assign(params, { order: orderVal })
    if (Object.keys(filters).length > 0) Object.assign(params, { filters })

    const result = await searchService.searchNovels(params)
    return {
      success: true,
      data: result.items,
      pagination: {
        currentPage: result.page,
        pageSize: result.limit,
        totalItems: result.total,
        totalPages: Math.ceil(result.total / result.limit),
        hasNext: result.page * result.limit < result.total,
        hasPrev: result.page > 1
      },
      timestamp: Date.now()
    }
  })

  fastify.get('/search/chapters', async (request, reply) => {
    const qVal = (request.query as any).q as string | undefined
    const page = Number((request.query as any).page ?? 1)
    const limit = Number((request.query as any).limit ?? 20)
    const sortVal = (request.query as any).sort as string | undefined
    const orderVal = ((request.query as any).order as string | undefined)?.toLowerCase() as 'asc' | 'desc' | undefined
    const novelId = (request.query as any).novelId ? Number((request.query as any).novelId) : undefined
    const minChapter = (request.query as any).minChapter ? Number((request.query as any).minChapter) : undefined
    const maxChapter = (request.query as any).maxChapter ? Number((request.query as any).maxChapter) : undefined
    const published = (request.query as any).published !== undefined ? ((request.query as any).published === 'true') : undefined

    const filters: Record<string, any> = {}
    if (typeof novelId === 'number') filters.novelId = novelId
    if (typeof minChapter === 'number') filters.minChapter = minChapter
    if (typeof maxChapter === 'number') filters.maxChapter = maxChapter
    if (typeof published === 'boolean') filters.published = published

    const params: any = { page, limit }
    if (qVal !== undefined) Object.assign(params, { q: qVal })
    if (sortVal !== undefined) Object.assign(params, { sort: sortVal })
    if (orderVal !== undefined) Object.assign(params, { order: orderVal })
    if (Object.keys(filters).length > 0) Object.assign(params, { filters })

    const result = await searchService.searchChapters(params)
    return {
      success: true,
      data: result.items,
      pagination: {
        currentPage: result.page,
        pageSize: result.limit,
        totalItems: result.total,
        totalPages: Math.ceil(result.total / result.limit),
        hasNext: result.page * result.limit < result.total,
        hasPrev: result.page > 1
      },
      timestamp: Date.now()
    }
  })
}
