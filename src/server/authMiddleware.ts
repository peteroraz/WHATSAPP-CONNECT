import type { Request, Response, NextFunction } from 'express';
import { adminAuth, adminDb, isProduction, isFirestoreAdminAvailable } from './firebaseAdmin.ts';
import type { UserRole } from '../types/index.ts';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  orgId: string;
  role: UserRole;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      auth?: AuthenticatedUser;
    }
  }
}

/**
 * Server Authentication Middleware
 * 
 * 1. Authenticates operational APIs using Firebase ID tokens.
 * 2. Enforces organization membership and roles server-side.
 * 3. Migrates legacy memberships (mem_*) to canonical ID: ${organizationId}_${userId}.
 * 4. Strictly protects Cloud Run production; permits demo mode in development/preview.
 */
export async function authenticateFirebaseUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  const authHeader = req.headers?.authorization;
  const demoHeader = req.headers?.['x-demo-mode'];
  const orgHeader = (req.headers?.['x-organization-id'] as string) || (req.query?.organizationId as string) || req.body?.organizationId;

  // Handle Demo / Dev Preview Mode
  const isDemoBearer = authHeader === 'Bearer demo';
  const isExplicitDemo = Boolean(demoHeader === 'true' || isDemoBearer);

  if (!isProduction && (isExplicitDemo || !authHeader)) {
    // In local development or AI Studio preview sandbox without credentials, allow demo session
    const demoOrgId = orgHeader || 'demo_org';
    const demoUser: AuthenticatedUser = {
      uid: 'demo_user_101',
      email: 'demo@whatsflow.io',
      orgId: demoOrgId,
      role: 'owner',
    };
    req.user = demoUser;
    req.auth = demoUser;
    return next();
  }

  // Require Authorization header in production or when token provided
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid Authorization header. Firebase ID token required.',
    });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Firebase ID token is empty.',
    });
  }

  try {
    let uid = '';
    let email = '';

    // Verify token with Firebase Admin
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email || '';
    } catch (tokenErr: any) {
      if (isProduction || isFirestoreAdminAvailable) {
        console.error('[AuthMiddleware] ID token verification failed in production:', tokenErr.message);
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid or expired Firebase ID token.',
        });
      }

      // In non-production preview when Firebase Admin lacks credentials, safely decode payload
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          uid = payload.user_id || payload.sub || 'dev_user';
          email = payload.email || 'dev@whatsflow.io';
        } else {
          throw new Error('Malformed token');
        }
      } catch {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid token format in preview mode.',
        });
      }
    }

    // Determine target organizationId
    let targetOrgId = orgHeader;

    if (!targetOrgId && isFirestoreAdminAvailable) {
      try {
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (userDoc.exists) {
          targetOrgId = userDoc.data()?.currentOrgId;
        }
      } catch (err: any) {
        console.warn('[AuthMiddleware] Error fetching user profile:', err.message);
      }
    }

    if (!targetOrgId) {
      // In development fallback if org cannot be loaded from db
      if (!isProduction) {
        targetOrgId = 'dev_org';
      } else {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: No organization associated with this user account.',
        });
      }
    }

    // Canonical membership validation and legacy migration
    const canonicalMembershipId = `${targetOrgId}_${uid}`;
    let role: UserRole = 'agent';
    let isMember = false;

    if (isFirestoreAdminAvailable) {
      try {
        const canonicalRef = adminDb.collection('organization_memberships').doc(canonicalMembershipId);
        const canonicalSnap = await canonicalRef.get();

        if (canonicalSnap.exists) {
          const data = canonicalSnap.data();
          role = (data?.role as UserRole) || 'agent';
          isMember = true;
        } else {
          // 1. Check legacy memberships: organizationId == targetOrgId && userId == uid
          const legacyQuery = await adminDb
            .collection('organization_memberships')
            .where('organizationId', '==', targetOrgId)
            .where('userId', '==', uid)
            .limit(1)
            .get();

          if (!legacyQuery.empty) {
            const legacyDoc = legacyQuery.docs[0];
            const legacyData = legacyDoc.data();
            role = (legacyData?.role as UserRole) || 'agent';
            isMember = true;

            // Migrate to canonical ID idempotently
            await canonicalRef.set(
              {
                ...legacyData,
                id: canonicalMembershipId,
                organizationId: targetOrgId,
                userId: uid,
                role,
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
            console.info(`[AuthMiddleware] Migrated legacy membership ${legacyDoc.id} to ${canonicalMembershipId}`);
          } else {
            // 2. Check if user is the organization owner
            const orgDoc = await adminDb.collection('organizations').doc(targetOrgId).get();
            if (orgDoc.exists && orgDoc.data()?.ownerId === uid) {
              role = 'owner';
              isMember = true;

              // Create canonical owner membership
              await canonicalRef.set({
                id: canonicalMembershipId,
                organizationId: targetOrgId,
                userId: uid,
                role: 'owner',
                userEmail: email,
                userName: email.split('@')[0] || 'Owner',
                createdAt: new Date().toISOString(),
              });
              console.info(`[AuthMiddleware] Created canonical owner membership for ${canonicalMembershipId}`);
            }
          }
        }
      } catch (dbErr: any) {
        if (isProduction) {
          console.error('[AuthMiddleware] Error verifying organization membership:', dbErr);
          return res.status(503).json({
            success: false,
            error: 'Database unavailable while checking organization authorization.',
          });
        }
      }
    } else if (!isProduction) {
      // In dev fallback without Firestore Admin
      isMember = true;
      role = 'owner';
    }

    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: User ${uid} does not belong to organization ${targetOrgId}.`,
      });
    }

    const authUser: AuthenticatedUser = {
      uid,
      email,
      orgId: targetOrgId,
      role,
    };

    req.user = authUser;
    req.auth = authUser;
    return next();
  } catch (err: any) {
    console.error('[AuthMiddleware] Unexpected authentication error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server authentication error.',
    });
  }
}

/**
 * Role-Based Access Control Middleware
 * Enforces that authenticated user possesses one of the allowed roles.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required before checking role.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Role '${req.user.role}' lacks permission for this action. Required: ${allowedRoles.join(', ')}.`,
      });
    }

    return next();
  };
}
