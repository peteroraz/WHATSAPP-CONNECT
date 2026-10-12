import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import type { App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let adminApp: App;
let adminDb: Firestore;
let adminAuth: Auth;

export const isCloudRun = Boolean(process.env.K_SERVICE);
export const isAiStudioPreview = Boolean(
  process.env.APP_URL?.includes('ais-dev') ||
  process.env.APP_URL?.includes('ais-pre') ||
  process.env.K_SERVICE?.startsWith('ais-dev') ||
  process.env.K_SERVICE?.startsWith('ais-pre') ||
  process.env.NODE_ENV === 'development'
);
export const isProduction = isCloudRun && !isAiStudioPreview;

function getFirebaseConfig() {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[FirebaseAdmin] Error reading firebase-applet-config.json:', err);
  }
  return {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'gen-lang-client-0579605586',
    firestoreDatabaseId: 'ai-studio-17b07ed1-8dd3-47a5-9d7f-2b8129040087',
  };
}

const config = getFirebaseConfig();

if (getApps().length === 0) {
  adminApp = initializeApp({
    credential: applicationDefault(),
    projectId: config.projectId,
  });
} else {
  adminApp = getApps()[0]!;
}

// Named database support: pass databaseId to getFirestore
const databaseId: string = config.firestoreDatabaseId || '(default)';
adminDb = getFirestore(adminApp, databaseId);
adminAuth = getAuth(adminApp);

let isFirestoreAdminAvailable = false;

// Test connectivity / IAM validation non-destructively
(async () => {
  try {
    // Quick test read to verify credentials against the named database
    await adminDb.collection('whatsapp_phone_routes').limit(1).get();
    isFirestoreAdminAvailable = true;
    console.info('[WhatsAppRepo] PRODUCTION FIRESTORE active.');
  } catch (err: any) {
    isFirestoreAdminAvailable = false;
    if (isProduction) {
      console.error(
        'Firebase Admin Firestore unavailable in production.\nDurable WhatsApp processing cannot continue.'
      );
    } else {
      console.info(
        '[WhatsAppRepo] DEVELOPMENT MEMORY FALLBACK active (local/AI Studio preview mode).'
      );
    }
  }
})();

export { adminApp, adminDb, adminAuth, databaseId, isFirestoreAdminAvailable };
