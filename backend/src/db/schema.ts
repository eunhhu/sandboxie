import { pgTable, uuid, varchar, integer, real, timestamp, pgEnum, text, boolean, jsonb } from 'drizzle-orm/pg-core';

export const sessionStatusEnum = pgEnum('session_status', ['running', 'stopped', 'paused']);
export const agentTypeEnum = pgEnum('agent_type', ['claude', 'codex']);
export const taskStatusEnum = pgEnum('task_status', ['queued', 'running', 'completed', 'failed', 'cancelled']);

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 30 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  subdomain: varchar('subdomain', { length: 255 }).notNull().unique(),
  sshPort: integer('ssh_port').notNull().unique(),
  httpPort: integer('http_port').notNull().unique(),
  agentPort: integer('agent_port').notNull().unique(),
  containerName: varchar('container_name', { length: 100 }).notNull().unique(),
  memoryLimit: integer('memory_limit').notNull().default(256),
  cpuLimit: real('cpu_limit').notNull().default(0.5),
  status: sessionStatusEnum('status').notNull().default('stopped'),
  agentEnabled: boolean('agent_enabled').notNull().default(false),
  anthropicApiKey: varchar('anthropic_api_key', { length: 512 }),
  openaiApiKey: varchar('openai_api_key', { length: 512 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentTasks = pgTable('agent_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  agent: agentTypeEnum('agent').notNull(),
  prompt: text('prompt').notNull(),
  workingDir: varchar('working_dir', { length: 500 }).notNull().default('~/'),
  status: taskStatusEnum('status').notNull().default('queued'),
  output: text('output'),
  exitCode: integer('exit_code'),
  tokenUsage: jsonb('token_usage'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AgentTask = typeof agentTasks.$inferSelect;
export type NewAgentTask = typeof agentTasks.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
