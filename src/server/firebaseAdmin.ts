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

export { adminApp, adminDb, databaseId };
