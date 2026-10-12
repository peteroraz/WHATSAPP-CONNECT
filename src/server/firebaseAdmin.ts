import { initializeApp, applicationDefault, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let adminApp: App;
let adminDb: Firestore;

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

let isFirestoreAdminAvailable = false;

// Test connectivity / IAM validation non-destructively
(async () => {
  try {
    // Quick test read to verify credentials against the named database
    await adminDb.collection('whatsapp_phone_routes').limit(1).get();
    isFirestoreAdminAvailable = true;
    console.info('[FirebaseAdmin] Connected to Firestore successfully.');
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (err?.code === 7 || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('unauthenticated')) {
      isFirestoreAdminAvailable = false;
      console.info('[FirebaseAdmin] Admin Firestore running in delegated mode (sandbox ADC without direct IAM). Resilient store active.');
    } else {
      isFirestoreAdminAvailable = false;
      console.warn('[FirebaseAdmin] Firestore note during initialization:', err?.code || msg);
    }
  }
})();

export { adminApp, adminDb, databaseId, isFirestoreAdminAvailable };
