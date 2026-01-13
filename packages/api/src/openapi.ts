import type { OpenAPIV3 } from "openapi-types";

import { integrations } from "@gmacko/config";

import type { ApiVersion } from "./versioning";
import {
  API_VERSIONS,
  CURRENT_API_VERSION,
  DEFAULT_API_VERSION,
} from "./versioning";

export interface OpenApiConfig {
  title: string;
  version: string;
  description?: string;
  baseUrl: string;
  /** API version for the spec (v1, v2, etc.) */
  apiVersion?: ApiVersion;
  /** Whether to include version in URL paths */
  includeVersionInPaths?: boolean;
}

const defaultConfig: OpenApiConfig = {
  title: "Gmacko API",
  version: "1.0.0",
  description: "API documentation for your application",
  baseUrl: "http://localhost:3000/api",
  apiVersion: DEFAULT_API_VERSION,
  includeVersionInPaths: true,
};

export function isOpenApiEnabled(): boolean {
  return integrations.openapi;
}

/**
 * Get available API versions
 */
export function getAvailableApiVersions(): readonly ApiVersion[] {
  return API_VERSIONS;
}

/**
 * Get current (latest stable) API version
 */
export function getCurrentApiVersion(): ApiVersion {
  return CURRENT_API_VERSION;
}

/**
 * Prefix paths with API version if configured
 */
function versionedPath(path: string, config: OpenApiConfig): string {
  if (config.includeVersionInPaths && config.apiVersion) {
    return `/${config.apiVersion}${path}`;
  }
  return path;
}

export function generateApiDocument(
  config: Partial<OpenApiConfig> = {},
): OpenAPIV3.Document {
  const mergedConfig = { ...defaultConfig, ...config };

  // Build version info string
  const versionInfo = mergedConfig.apiVersion
    ? ` (API ${mergedConfig.apiVersion.toUpperCase()})`
    : "";

  const document: OpenAPIV3.Document = {
    openapi: "3.0.3",
    info: {
      title: mergedConfig.title + versionInfo,
      version: mergedConfig.version,
      description: mergedConfig.description,
      "x-api-version": mergedConfig.apiVersion,
    } as OpenAPIV3.InfoObject,
    servers: [
      {
        url: mergedConfig.baseUrl,
        description: "API Server",
        variables: {
          version: {
            default: mergedConfig.apiVersion ?? DEFAULT_API_VERSION,
            enum: API_VERSIONS as unknown as string[],
            description: "API version",
          },
        },
      },
    ],
    paths: {
      [versionedPath("/trpc/auth.getSession", mergedConfig)]: {
        get: {
          tags: ["auth"],
          summary: "Get current session",
          description: "Returns the current user session if authenticated",
          parameters: [
            {
              name: "X-API-Version",
              in: "header",
              required: false,
              schema: { type: "string", default: DEFAULT_API_VERSION },
              description: "API version (alternative to URL versioning)",
            },
          ],
          responses: {
            "200": {
              description: "Session data",
              headers: {
                "X-API-Version": {
                  description: "The API version used for this request",
                  schema: { type: "string" },
                },
              },
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
      [versionedPath("/trpc/post.all", mergedConfig)]: {
        get: {
          tags: ["post"],
          summary: "Get all posts",
          description: "Returns all posts",
          parameters: [
            {
              name: "X-API-Version",
              in: "header",
              required: false,
              schema: { type: "string", default: DEFAULT_API_VERSION },
              description: "API version (alternative to URL versioning)",
            },
          ],
          responses: {
            "200": {
              description: "List of posts",
              headers: {
                "X-API-Version": {
                  description: "The API version used for this request",
                  schema: { type: "string" },
                },
              },
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
      [versionedPath("/trpc/post.byId", mergedConfig)]: {
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
            {
              name: "X-API-Version",
              in: "header",
              required: false,
              schema: { type: "string", default: DEFAULT_API_VERSION },
              description: "API version (alternative to URL versioning)",
            },
          ],
          responses: {
            "200": {
              description: "Post data",
              headers: {
                "X-API-Version": {
                  description: "The API version used for this request",
                  schema: { type: "string" },
                },
              },
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
      [versionedPath("/trpc/post.create", mergedConfig)]: {
        post: {
          tags: ["post"],
          summary: "Create a new post",
          description: "Creates a new post (requires authentication)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "X-API-Version",
              in: "header",
              required: false,
              schema: { type: "string", default: DEFAULT_API_VERSION },
              description: "API version (alternative to URL versioning)",
            },
          ],
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
              headers: {
                "X-API-Version": {
                  description: "The API version used for this request",
                  schema: { type: "string" },
                },
              },
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
      [versionedPath("/trpc/post.delete", mergedConfig)]: {
        post: {
          tags: ["post"],
          summary: "Delete a post",
          description: "Deletes a post by ID (requires authentication)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "X-API-Version",
              in: "header",
              required: false,
              schema: { type: "string", default: DEFAULT_API_VERSION },
              description: "API version (alternative to URL versioning)",
            },
          ],
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
              headers: {
                "X-API-Version": {
                  description: "The API version used for this request",
                  schema: { type: "string" },
                },
              },
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

/**
 * Generate OpenAPI spec for a specific API version
 */
export function generateVersionedApiDocument(
  version: ApiVersion,
  config: Partial<Omit<OpenApiConfig, "apiVersion">> = {},
): OpenAPIV3.Document {
  return generateApiDocument({
    ...config,
    apiVersion: version,
    // Version-specific configuration can be added here
    version: `1.0.0-${version}`,
  });
}

/**
 * Generate all versioned OpenAPI specs
 */
export function generateAllVersionedSpecs(
  config: Partial<Omit<OpenApiConfig, "apiVersion">> = {},
): Record<ApiVersion, OpenAPIV3.Document> {
  const specs: Record<string, OpenAPIV3.Document> = {};
  for (let i = 0; i < API_VERSIONS.length; i++) {
    const version = API_VERSIONS[i];
    if (version) {
      specs[version] = generateVersionedApiDocument(version, config);
    }
  }
  return specs as Record<ApiVersion, OpenAPIV3.Document>;
}
