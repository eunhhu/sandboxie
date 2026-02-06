import { db } from '../db';
import { pushSubscriptions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { config } from '../config';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Web Push requires VAPID keys and the web-push protocol.
// We implement a minimal version using fetch to the push endpoint.

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function subscribe(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  // Upsert: if endpoint exists, update keys
  const existing = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, subscription.endpoint));

  if (existing.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      })
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
  } else {
    await db.insert(pushSubscriptions).values({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });
  }
}

export async function unsubscribe(endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function sendNotificationToAll(payload: PushPayload): Promise<void> {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    console.warn('[push] VAPID keys not configured, skipping push notifications');
    return;
  }

  const subs = await db.select().from(pushSubscriptions);
  if (subs.length === 0) return;

  // Use web-push library if available, otherwise log
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      config.vapidSubject,
      config.vapidPublicKey,
      config.vapidPrivateKey,
    );

    const body = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        ),
      ),
    );

    // Clean up expired subscriptions (410 Gone)
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const err = result.reason;
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          try {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.endpoint, subs[i].endpoint));
            console.log(`[push] Removed expired subscription: ${subs[i].endpoint.slice(0, 50)}...`);
          } catch {}
        } else {
          console.warn(`[push] Failed to send to ${subs[i].endpoint.slice(0, 50)}...:`, err?.message || err);
        }
      }
    }
  } catch (err) {
    console.warn('[push] web-push not available or send failed:', err instanceof Error ? err.message : err);
  }
}

export function getVapidPublicKey(): string {
  return config.vapidPublicKey;
}
