/* @refresh reload */
import { render } from 'solid-js/web';
import './index.css';
import App from './App';
import { getVapidKey, subscribePush } from './api';

render(() => <App />, document.getElementById('root')!);

// Register Service Worker and Push Notifications
async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    console.log('[SW] Registered');

    // Only subscribe if logged in and VAPID key is available
    const token = localStorage.getItem('token');
    if (!token) return;

    const { key } = await getVapidKey();
    if (!key) return;

    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // Already subscribed

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });

    const json = sub.toJSON();
    await subscribePush({
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh!,
      auth: json.keys!.auth!,
    });
    console.log('[Push] Subscribed');
  } catch (err) {
    console.warn('[Push] Registration failed:', err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

registerPush();
