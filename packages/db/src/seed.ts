/**
 * Database Seeding Script
 *
 * Seeds the database with sample data for development/testing.
 * Run with: pnpm --filter @gmacko/db seed
 *
 * This script is idempotent - it clears existing seed data before inserting.
 */

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";

import { db } from "./client";
import { apiKeys, Post, user, userPreferences } from "./schema";

// Seed user IDs - using fixed IDs makes the seed idempotent
const SEED_USER_IDS = [
  "seed_user_alice_001",
  "seed_user_bob_002",
  "seed_user_charlie_003",
];

// Sample user data
const sampleUsers = [
  {
    id: SEED_USER_IDS[0]!,
    name: "Alice Johnson",
    email: "alice.seed@example.com",
    emailVerified: true,
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
    createdAt: new Date("2024-01-15T10:00:00Z"),
    updatedAt: new Date("2024-01-15T10:00:00Z"),
  },
  {
    id: SEED_USER_IDS[1]!,
    name: "Bob Smith",
    email: "bob.seed@example.com",
    emailVerified: true,
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
    createdAt: new Date("2024-02-20T14:30:00Z"),
    updatedAt: new Date("2024-02-20T14:30:00Z"),
  },
  {
    id: SEED_USER_IDS[2]!,
    name: "Charlie Davis",
    email: "charlie.seed@example.com",
    emailVerified: false,
    image: null,
    createdAt: new Date("2024-03-10T09:15:00Z"),
    updatedAt: new Date("2024-03-10T09:15:00Z"),
  },
];

// Sample posts data
const samplePosts = [
  {
    id: randomUUID(),
    title: "Getting Started with Drizzle ORM",
    content:
      "Drizzle ORM is a TypeScript-first ORM that provides type-safe database access. In this post, we explore the basics of setting up Drizzle with Neon Postgres and creating your first schema.",
  },
  {
    id: randomUUID(),
    title: "Building a Monorepo with Turborepo",
    content:
      "Turborepo makes managing monorepos a breeze. Learn how to structure your packages, configure caching, and speed up your builds with this comprehensive guide.",
  },
  {
    id: randomUUID(),
    title: "Type-Safe APIs with tRPC",
    content:
      "tRPC enables end-to-end type safety between your client and server. Discover how to define procedures, handle errors, and integrate with React Query for seamless data fetching.",
  },
  {
    id: randomUUID(),
    title: "Authentication with Better Auth",
    content:
      "Better Auth provides a flexible authentication solution for modern web applications. This tutorial covers setting up OAuth providers, session management, and securing your routes.",
  },
  {
    id: randomUUID(),
    title: "Deploying to Vercel and Neon",
    content:
      "Learn the best practices for deploying your Next.js application to Vercel with a Neon Postgres database. We cover environment variables, connection pooling, and performance optimization.",
  },
];

// Sample user preferences
const samplePreferences = [
  {
    id: randomUUID(),
    userId: SEED_USER_IDS[0]!,
    theme: "dark" as const,
    language: "en",
    timezone: "America/New_York",
    emailNotifications: true,
    pushNotifications: true,
  },
  {
    id: randomUUID(),
    userId: SEED_USER_IDS[1]!,
    theme: "light" as const,
    language: "es",
    timezone: "Europe/Madrid",
    emailNotifications: true,
    pushNotifications: false,
  },
  {
    id: randomUUID(),
    userId: SEED_USER_IDS[2]!,
    theme: "system" as const,
    language: "en",
    timezone: "UTC",
    emailNotifications: false,
    pushNotifications: false,
  },
];

// Sample API keys (keyHash is a placeholder - in real usage, hash the actual key)
const sampleApiKeys = [
  {
    id: randomUUID(),
    userId: SEED_USER_IDS[0]!,
    name: "Development API Key",
    keyHash: "sha256_placeholder_dev_key_hash_alice",
    keyPrefix: "gm_dev_alice",
    permissions: ["read", "write"],
    expiresAt: new Date("2025-12-31T23:59:59Z"),
  },
  {
    id: randomUUID(),
    userId: SEED_USER_IDS[0]!,
    name: "Production Read-Only",
    keyHash: "sha256_placeholder_prod_key_hash_alice",
    keyPrefix: "gm_prd_alice",
    permissions: ["read"],
    expiresAt: null,
  },
  {
    id: randomUUID(),
    userId: SEED_USER_IDS[1]!,
    name: "CI/CD Pipeline Key",
    keyHash: "sha256_placeholder_cicd_key_hash_bob",
    keyPrefix: "gm_ci_bob",
    permissions: ["read", "write", "delete"],
    expiresAt: new Date("2025-06-30T23:59:59Z"),
  },
];

async function clearSeedData() {
  console.log("Clearing existing seed data...");

  // Delete in order respecting foreign key constraints
  // API keys and preferences reference users, so delete them first
  await db.delete(apiKeys).where(inArray(apiKeys.userId, SEED_USER_IDS));
  await db
    .delete(userPreferences)
    .where(inArray(userPreferences.userId, SEED_USER_IDS));

  // Delete seed users
  await db.delete(user).where(inArray(user.id, SEED_USER_IDS));

  // Delete posts by checking for seed-specific content pattern
  // Posts don't have userId, so we delete by email pattern in title
  for (const post of samplePosts) {
    await db.delete(Post).where(eq(Post.title, post.title));
  }

  console.log("Seed data cleared.");
}

async function seedUsers() {
  console.log("Seeding users...");
  await db.insert(user).values(sampleUsers);
  console.log(`Inserted ${sampleUsers.length} users.`);
}

async function seedPosts() {
  console.log("Seeding posts...");
  await db.insert(Post).values(samplePosts);
  console.log(`Inserted ${samplePosts.length} posts.`);
}

async function seedUserPreferences() {
  console.log("Seeding user preferences...");
  await db.insert(userPreferences).values(samplePreferences);
  console.log(`Inserted ${samplePreferences.length} user preferences.`);
}

async function seedApiKeys() {
  console.log("Seeding API keys...");
  await db.insert(apiKeys).values(sampleApiKeys);
  console.log(`Inserted ${sampleApiKeys.length} API keys.`);
}

async function main() {
  console.log("Starting database seed...\n");

  try {
    // Clear existing seed data first (idempotent)
    await clearSeedData();

    // Seed in order respecting foreign key constraints
    await seedUsers();
    await seedPosts();
    await seedUserPreferences();
    await seedApiKeys();

    console.log("\nDatabase seeding completed successfully!");
    console.log("\nSeed Summary:");
    console.log(`  - Users: ${sampleUsers.length}`);
    console.log(`  - Posts: ${samplePosts.length}`);
    console.log(`  - User Preferences: ${samplePreferences.length}`);
    console.log(`  - API Keys: ${sampleApiKeys.length}`);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();
