

## 📁 Project Structure

```
src/
├── api/                    # API controllers and routes
│   ├── controllers/        # Request handlers
│   ├── routes/            # Route definitions
│   └── Novel/             # Frontend API clients
├── config/                # Environment configuration
├── infrastructure/        # Database connections and models
│   ├── models/           # Mongoose schemas
│   ├── database.ts       # MongoDB connection
│   └── elasticsearch.ts  # Elasticsearch connection
├── services/             # Business logic services
│   ├── NovelService.ts   # Novel operations
│   ├── ChapterService.ts # Chapter operations
│   ├── UserService.ts    # User management
│   └── *SearchService.ts # Elasticsearch services
├── plugins/              # Fastify plugins
│   └── rbac.ts          # RBAC middleware
└── types/                # TypeScript type definitions
```

