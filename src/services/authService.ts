import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  FirebaseUser,
  handleFirestoreError,
  OperationType
} from '../lib/firebase.ts';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { UserProfile, Organization, OrganizationMembership } from '../types/index.ts';

const LOCAL_USER_KEY = 'whatsflow_active_user';
const LOCAL_ORG_KEY = 'whatsflow_active_org';

export interface AuthState {
  user: UserProfile | null;
  organization: Organization | null;
  membership: OrganizationMembership | null;
  loading: boolean;
  isDemoMode?: boolean;
}

export const authService = {
  /**
   * Helper to create demo organization and user for testing
   */
  createDemoOrg(userId: string, email: string, name: string): { org: Organization; membership: OrganizationMembership } {
    const orgId = `org_${Date.now()}`;
    const org: Organization = {
      id: orgId,
      name: 'Acme Global Commerce',
      ownerId: userId,
      timezone: 'UTC',
      whatsappConnected: false,
      whatsappBusinessAccountId: '',
      whatsappPhoneNumberId: '',
      whatsappPhoneNumber: '',
      whatsappApiVersion: 'v21.0',
      businessHours: {
        enabled: true,
        timezone: 'UTC',
        days: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '17:00',
        outOfHoursMessage: 'Thank you for contacting us. Our office is currently closed. Our business hours are Monday to Friday, 8:00 AM to 5:00 PM. We will respond as soon as we reopen.',
      },
      createdAt: new Date().toISOString(),
    };

    const membership: OrganizationMembership = {
      id: `mem_${Date.now()}`,
      organizationId: orgId,
      userId,
      role: 'owner',
      userEmail: email,
      userName: name,
      createdAt: new Date().toISOString(),
    };

    return { org, membership };
  },

  /**
   * Ensure user document and organization exist in Firestore
   */
  async syncUserAndOrg(fbUser: FirebaseUser): Promise<{ user: UserProfile; organization: Organization; membership: OrganizationMembership }> {
    try {
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data() as UserProfile;
        // Fetch org
        let orgData: Organization;
        const orgRef = doc(db, 'organizations', userData.currentOrgId);
        const orgSnap = await getDoc(orgRef);

        if (orgSnap.exists()) {
          orgData = { id: orgSnap.id, ...orgSnap.data() } as Organization;
        } else {
          const { org } = this.createDemoOrg(fbUser.uid, fbUser.email || '', fbUser.displayName || 'Business Owner');
          await setDoc(orgRef, org);
          orgData = org;
        }

        const membership: OrganizationMembership = {
          id: `mem_${fbUser.uid}`,
          organizationId: orgData.id,
          userId: fbUser.uid,
          role: 'owner',
          userEmail: fbUser.email || '',
          userName: fbUser.displayName || 'Admin',
          createdAt: new Date().toISOString(),
        };

        return { user: userData, organization: orgData, membership };
      } else {
        // First time signup
        const { org, membership } = this.createDemoOrg(
          fbUser.uid, 
          fbUser.email || 'user@example.com', 
          fbUser.displayName || 'Account Owner'
        );

        const newUser: UserProfile = {
          id: fbUser.uid,
          email: fbUser.email || '',
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Team Lead',
          photoURL: fbUser.photoURL || undefined,
          currentOrgId: org.id,
          createdAt: new Date().toISOString(),
        };

        // Write to Firestore
        await setDoc(userRef, { ...newUser, createdAt: serverTimestamp() });
        await setDoc(doc(db, 'organizations', org.id), org);
        await setDoc(doc(db, 'organization_memberships', membership.id), membership);

        return { user: newUser, organization: org, membership };
      }
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}`);
      }
      console.warn('Firestore user sync fallback (using local cache):', err);
      const { org, membership } = this.createDemoOrg(
        fbUser.uid, 
        fbUser.email || 'user@whatsflow.io', 
        fbUser.displayName || 'Owner'
      );
      const fallbackUser: UserProfile = {
        id: fbUser.uid,
        email: fbUser.email || 'user@whatsflow.io',
        displayName: fbUser.displayName || 'Owner',
        currentOrgId: org.id,
        createdAt: new Date().toISOString(),
      };
      return { user: fallbackUser, organization: org, membership };
    }
  },

  /**
   * Guest / Demo Login for instant exploration
   */
  loginAsDemo(): { user: UserProfile; organization: Organization; membership: OrganizationMembership } {
    const demoUserId = 'demo_user_101';
    const { org, membership } = this.createDemoOrg(demoUserId, 'demo@whatsflow.io', 'Alex Rivera');
    const user: UserProfile = {
      id: demoUserId,
      email: 'alex.rivera@acme.com',
      displayName: 'Alex Rivera',
      currentOrgId: org.id,
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
    localStorage.setItem(LOCAL_ORG_KEY, JSON.stringify(org));
    return { user, organization: org, membership };
  },

  getStoredDemoAuth(): { user: UserProfile; organization: Organization; membership: OrganizationMembership } | null {
    try {
      const u = localStorage.getItem(LOCAL_USER_KEY);
      const o = localStorage.getItem(LOCAL_ORG_KEY);
      if (u && o) {
        const user = JSON.parse(u) as UserProfile;
        const org = JSON.parse(o) as Organization;
        const membership: OrganizationMembership = {
          id: `mem_${user.id}`,
          organizationId: org.id,
          userId: user.id,
          role: 'owner',
          userEmail: user.email,
          userName: user.displayName,
          createdAt: user.createdAt,
        };
        return { user, organization: org, membership };
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  },

  async loginWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider);
    return this.syncUserAndOrg(cred.user);
  },

  async signInWithGoogle() {
    return this.loginWithGoogle();
  },

  async loginWithEmail(email: string, pass: string) {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    return this.syncUserAndOrg(cred.user);
  },

  async signInWithEmail(email: string, pass: string) {
    return this.loginWithEmail(email, pass);
  },

  async registerWithEmail(email: string, pass: string, orgName?: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    return this.syncUserAndOrg(cred.user, orgName);
  },

  async signUpWithEmail(email: string, pass: string, orgName?: string) {
    return this.registerWithEmail(email, pass, orgName);
  },

  async logout() {
    localStorage.removeItem(LOCAL_USER_KEY);
    localStorage.removeItem(LOCAL_ORG_KEY);
    try {
      await signOut(auth);
    } catch (e) {
      // ignore
    }
  },

  async signOut() {
    return this.logout();
  },

  onAuthStateChanged(callback: (user: UserProfile | null, org: Organization | null) => void) {
    // 1. Check local demo user first
    const demo = this.getStoredDemoAuth();
    if (demo) {
      callback(demo.user, demo.organization);
    }

    // 2. Subscribe to Firebase auth changes
    return onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const { user, organization } = await this.syncUserAndOrg(fbUser);
          callback(user, organization);
        } catch (e) {
          const fallback = this.getStoredDemoAuth();
          if (fallback) callback(fallback.user, fallback.organization);
        }
      } else {
        const stored = this.getStoredDemoAuth();
        if (stored) {
          callback(stored.user, stored.organization);
        } else {
          callback(null, null);
        }
      }
    });
  },
};
