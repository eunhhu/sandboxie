import { pgTable, uuid, varchar, integer, real, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const sessionStatusEnum = pgEnum('session_status', ['running', 'stopped', 'paused']);

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 30 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  subdomain: varchar('subdomain', { length: 255 }).notNull().unique(),
  sshPort: integer('ssh_port').notNull().unique(),
  httpPort: integer('http_port').notNull().unique(),
  containerName: varchar('container_name', { length: 100 }).notNull().unique(),
  memoryLimit: integer('memory_limit').notNull().default(256),
  cpuLimit: real('cpu_limit').notNull().default(0.5),
  status: sessionStatusEnum('status').notNull().default('stopped'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
