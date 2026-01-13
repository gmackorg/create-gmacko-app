import type { OpenAPIV3 } from "openapi-types";

import { integrations } from "@gmacko/config";

export interface OpenApiConfig {
  title: string;
  version: string;
  description?: string;
  baseUrl: string;
}

const defaultConfig: OpenApiConfig = {
  title: "Gmacko API",
  version: "1.0.0",
  description: "API documentation for your application",
  baseUrl: "http://localhost:3000/api",
};

export function isOpenApiEnabled(): boolean {
  return integrations.openapi;
}

export function generateApiDocument(
  config: Partial<OpenApiConfig> = {},
): OpenAPIV3.Document {
  const mergedConfig = { ...defaultConfig, ...config };

  const document: OpenAPIV3.Document = {
    openapi: "3.0.3",
    info: {
      title: mergedConfig.title,
      version: mergedConfig.version,
      description: mergedConfig.description,
    },
    servers: [
      {
        url: mergedConfig.baseUrl,
        description: "API Server",
      },
    ],
    paths: {
      "/trpc/auth.getSession": {
        get: {
          tags: ["auth"],
          summary: "Get current session",
          description: "Returns the current user session if authenticated",
          responses: {
            "200": {
              description: "Session data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      user: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          email: { type: "string" },
                          name: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/trpc/post.all": {
        get: {
          tags: ["post"],
          summary: "Get all posts",
          description: "Returns all posts",
          responses: {
            "200": {
              description: "List of posts",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        content: { type: "string" },
                        createdAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/trpc/post.byId": {
        get: {
          tags: ["post"],
          summary: "Get post by ID",
          description: "Returns a single post by its ID",
          parameters: [
            {
              name: "id",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Post data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      content: { type: "string" },
                      createdAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Post not found",
            },
          },
        },
      },
      "/trpc/post.create": {
        post: {
          tags: ["post"],
          summary: "Create a new post",
          description: "Creates a new post (requires authentication)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "content"],
                  properties: {
                    title: { type: "string", minLength: 1 },
                    content: { type: "string", minLength: 1 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Created post",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      content: { type: "string" },
                      createdAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized",
            },
          },
        },
      },
      "/trpc/post.delete": {
        post: {
          tags: ["post"],
          summary: "Delete a post",
          description: "Deletes a post by ID (requires authentication)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id"],
                  properties: {
                    id: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Post deleted",
            },
            "401": {
              description: "Unauthorized",
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
    tags: [
      { name: "auth", description: "Authentication endpoints" },
      { name: "post", description: "Post management endpoints" },
    ],
  };

  return document;
}

export function getOpenApiSpec(config?: Partial<OpenApiConfig>): string {
  if (!integrations.openapi) {
    return JSON.stringify({ error: "OpenAPI not enabled" });
  }
  return JSON.stringify(generateApiDocument(config), null, 2);
}
