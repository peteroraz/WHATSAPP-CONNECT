import { adminDb, isProduction, isFirestoreAdminAvailable } from './firebaseAdmin.ts';

export interface WhatsAppPhoneRoute {
  phoneNumberId: string;
  organizationId: string;
  clientId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DurableWebhookEvent {
  id: string;
  organizationId: string;
  clientId: string;
  phoneNumberId: string;
  type: 'incoming_message' | 'status_update';
  wamid: string;
  eventTimestamp: string;
  receivedAt: string;
  payload: Record<string, any>;
}

const STATUS_RANK: Record<string, number> = {
  submitted: 1,
  sent: 2,
  Sent: 2,
  delivered: 3,
  Delivered: 3,
  read: 4,
  Read: 4,
  failed: 5,
  Failed: 5,
};

export function normalizeE164(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

export function arePhoneNumbersEqual(p1: string, p2: string): boolean {
  const d1 = (p1 || '').replace(/\D/g, '');
  const d2 = (p2 || '').replace(/\D/g, '');
  return Boolean(d1 && d2 && (d1 === d2 || d1.endsWith(d2) || d2.endsWith(d1)));
}

function isPermissionDenied(err: any): boolean {
  if (!err) return false;
  if (err.code === 7 || err.code === 'permission-denied') return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('permission_denied') ||
    msg.includes('insufficient permissions') ||
    msg.includes('permission denied') ||
    msg.includes('unauthenticated')
  );
}

export class WhatsAppDataRepository {
  // Resilient in-memory store for development / preview mode
  private routes = new Map<string, WhatsAppPhoneRoute>();
  private webhookEvents = new Map<string, DurableWebhookEvent>();
  private contacts = new Map<string, any>();
  private conversations = new Map<string, any>();
  private messages = new Map<string, any>();
  private campaignRecipients = new Map<string, any>();
  private campaigns = new Map<string, any>();
  private optOuts = new Map<string, boolean>();
  private automationRules = new Map<string, any[]>();

  private _adminDbFailed = false;
  private hasLoggedDevNotice = false;

  private get adminDbAvailable(): boolean {
    if (this._adminDbFailed) return false;
    return isFirestoreAdminAvailable;
  }

  private handleDevAdminNotice(err?: any) {
    this._adminDbFailed = true;
    if (!this.hasLoggedDevNotice) {
      this.hasLoggedDevNotice = true;
      console.info(
        '[WhatsAppRepo] DEVELOPMENT MEMORY FALLBACK active (local/AI Studio preview mode).'
      );
    }
  }

  private handleProductionError(operation: string, err: any): never {
    console.error(
      'Firebase Admin Firestore unavailable in production.\nDurable WhatsApp processing cannot continue.'
    );
    throw new Error(`[Production Firestore Failure] ${operation}: ${err?.message || err}`);
  }

  /**
   * 1. Resolve phone route from Meta phone_number_id
   * Routing must strictly be:
   * phone_number_id -> whatsapp_phone_routes/{phoneNumberId} -> organizationId + clientId
   * No fallback to guessing organizations or scanning arbitrary tenants!
   */
  async resolvePhoneRoute(phoneNumberId: string): Promise<WhatsAppPhoneRoute | null> {
    if (!phoneNumberId) return null;

    if (isProduction) {
      try {
        const docRef = adminDb.collection('whatsapp_phone_routes').doc(phoneNumberId);
        const snap = await docRef.get();
        if (snap.exists) {
          const data = snap.data() as WhatsAppPhoneRoute;
          if (data.active !== false) {
            this.routes.set(phoneNumberId, data);
            return data;
          }
        }
        console.warn(`[WhatsAppRepo] No active route found in production for phoneNumberId: ${phoneNumberId}`);
        return null;
      } catch (err: any) {
        this.handleProductionError('resolvePhoneRoute', err);
      }
    }

    // Development / preview memory mode
    const cached = this.routes.get(phoneNumberId);
    if (cached && cached.active !== false) {
      return cached;
    }

    if (this.adminDbAvailable) {
      try {
        const docRef = adminDb.collection('whatsapp_phone_routes').doc(phoneNumberId);
        const snap = await docRef.get();
        if (snap.exists) {
          const data = snap.data() as WhatsAppPhoneRoute;
          if (data.active !== false) {
            this.routes.set(phoneNumberId, data);
            return data;
          }
        }
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    console.warn(`[WhatsAppRepo] No active route found for phoneNumberId: ${phoneNumberId}`);
    return null;
  }

  /**
   * 2. Register or update the default route for current environment WHATSAPP_PHONE_NUMBER_ID
   * In production Cloud Run: successful ONLY after whatsapp_phone_routes/{phoneNumberId} is persisted to Firestore.
   * Memory-only success is allowed ONLY in development/preview mode.
   */
  async registerDefaultRoute(
    organizationId: string,
    clientId: string
  ): Promise<{ success: boolean; phoneNumberId?: string; error?: string }> {
    const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    if (!phoneNumberId) {
      return { success: false, error: 'WHATSAPP_PHONE_NUMBER_ID environment variable is not configured.' };
    }

    const now = new Date().toISOString();
    const existing = this.routes.get(phoneNumberId);

    const routeData: WhatsAppPhoneRoute = {
      phoneNumberId,
      organizationId,
      clientId,
      active: true,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (isProduction) {
      try {
        const docRef = adminDb.collection('whatsapp_phone_routes').doc(phoneNumberId);
        await docRef.set(routeData, { merge: true });
        this.routes.set(phoneNumberId, routeData);
        return { success: true, phoneNumberId };
      } catch (err: any) {
        this.handleProductionError('registerDefaultRoute', err);
      }
    }

    // Development / preview memory mode
    this.routes.set(phoneNumberId, routeData);
    if (this.adminDbAvailable) {
      try {
        const docRef = adminDb.collection('whatsapp_phone_routes').doc(phoneNumberId);
        await docRef.set(routeData, { merge: true });
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    return { success: true, phoneNumberId };
  }

  /**
   * 3. Persist durable webhook event to Firestore
   * Idempotent by deterministic ID: incoming_<wamid> or status_<wamid>_<status>
   * In production: must successfully persist to Firestore.
   */
  async persistWebhookEvent(event: DurableWebhookEvent): Promise<void> {
    if (isProduction) {
      try {
        const docRef = adminDb.collection('whatsapp_webhook_events').doc(event.id);
        await docRef.set(event, { merge: true });
        this.webhookEvents.set(event.id, event);
        return;
      } catch (err: any) {
        this.handleProductionError('persistWebhookEvent', err);
      }
    }

    // Development / preview memory mode
    this.webhookEvents.set(event.id, event);
    if (this.adminDbAvailable) {
      try {
        const docRef = adminDb.collection('whatsapp_webhook_events').doc(event.id);
        await docRef.set(event, { merge: true });
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }
  }

  /**
   * 4. Retrieve durable webhook events from Firestore or memory store
   */
  async getDurableWebhookEvents(params: {
    since?: string;
    clientId?: string;
    limit?: number;
  }): Promise<DurableWebhookEvent[]> {
    if (isProduction) {
      try {
        let queryRef: any = adminDb.collection('whatsapp_webhook_events');

        if (params.clientId) {
          queryRef = queryRef.where('clientId', '==', params.clientId);
        }

        if (params.since) {
          queryRef = queryRef.where('receivedAt', '>=', params.since);
        }

        const limitCount = Math.min(params.limit || 100, 500);
        queryRef = queryRef.orderBy('receivedAt', 'asc').limit(limitCount);

        const snap = await queryRef.get();
        return snap.docs.map((d: any) => d.data() as DurableWebhookEvent);
      } catch (err: any) {
        this.handleProductionError('getDurableWebhookEvents', err);
      }
    }

    // Development / preview: check Firestore first if available, else memory
    if (this.adminDbAvailable) {
      try {
        let queryRef: any = adminDb.collection('whatsapp_webhook_events');

        if (params.clientId) {
          queryRef = queryRef.where('clientId', '==', params.clientId);
        }

        if (params.since) {
          queryRef = queryRef.where('receivedAt', '>=', params.since);
        }

        const limitCount = Math.min(params.limit || 100, 500);
        queryRef = queryRef.orderBy('receivedAt', 'asc').limit(limitCount);

        const snap = await queryRef.get();
        return snap.docs.map((d: any) => d.data() as DurableWebhookEvent);
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    // Memory store fallback for development
    let events = Array.from(this.webhookEvents.values());
    if (params.clientId) {
      events = events.filter((e) => e.clientId === params.clientId);
    }
    if (params.since) {
      events = events.filter((e) => (e.receivedAt || e.eventTimestamp) >= params.since!);
    }
    events.sort(
      (a, b) =>
        new Date(a.receivedAt || a.eventTimestamp).getTime() -
        new Date(b.receivedAt || b.eventTimestamp).getTime()
    );
    const limitCount = Math.min(params.limit || 100, 500);
    return events.slice(0, limitCount);
  }

  /**
   * 5. Find or create Contact in Firestore using normalizedPhone
   * Replaces scanning entire client contacts with indexed query:
   * organizationId ==, clientId ==, normalizedPhone ==
   */
  async findOrCreateInboundContact(params: {
    organizationId: string;
    clientId: string;
    phone: string;
    profileName?: string;
    timestamp?: string;
  }): Promise<{ id: string; phone: string; normalizedPhone: string; firstName: string; lastName: string; isNew: boolean }> {
    const { organizationId, clientId, phone, profileName, timestamp } = params;
    const normalized = normalizeE164(phone);
    const now = timestamp || new Date().toISOString();
    const memKey = `${organizationId}_${clientId}_${normalized}`;

    if (isProduction) {
      try {
        const matchSnap = await adminDb
          .collection('contacts')
          .where('organizationId', '==', organizationId)
          .where('clientId', '==', clientId)
          .where('normalizedPhone', '==', normalized)
          .limit(1)
          .get();

        if (!matchSnap.empty) {
          const doc = matchSnap.docs[0];
          const data = doc.data();
          const result = {
            id: doc.id,
            phone: data.phone || normalized,
            normalizedPhone: data.normalizedPhone || normalized,
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            isNew: false,
          };
          this.contacts.set(memKey, result);
          return result;
        }

        const legacySnap = await adminDb
          .collection('contacts')
          .where('organizationId', '==', organizationId)
          .where('clientId', '==', clientId)
          .get();

        for (const doc of legacySnap.docs) {
          const data = doc.data();
          if (arePhoneNumbersEqual(data.phone, normalized)) {
            await doc.ref.update({
              normalizedPhone: normalized,
              updatedAt: now,
            });
            const result = {
              id: doc.id,
              phone: data.phone || normalized,
              normalizedPhone: normalized,
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              isNew: false,
            };
            this.contacts.set(memKey, result);
            return result;
          }
        }

        const id = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newContact = {
          id,
          organizationId,
          clientId,
          firstName: profileName || 'WhatsApp',
          lastName: profileName ? '' : 'Contact',
          phone: normalized,
          normalizedPhone: normalized,
          email: '',
          company: '',
          tags: ['Live Inbound'],
          groups: [],
          whatsappOptIn: false,
          marketingOptIn: false,
          transactionalOptIn: false,
          optOut: false,
          status: 'Active',
          createdAt: now,
          updatedAt: now,
        };

        await adminDb.collection('contacts').doc(id).set(newContact);
        const result = {
          id,
          phone: normalized,
          normalizedPhone: normalized,
          firstName: newContact.firstName,
          lastName: newContact.lastName,
          isNew: true,
        };
        this.contacts.set(memKey, result);
        return result;
      } catch (err: any) {
        this.handleProductionError('findOrCreateInboundContact', err);
      }
    }

    // Development / preview mode
    if (this.adminDbAvailable) {
      try {
        const matchSnap = await adminDb
          .collection('contacts')
          .where('organizationId', '==', organizationId)
          .where('clientId', '==', clientId)
          .where('normalizedPhone', '==', normalized)
          .limit(1)
          .get();

        if (!matchSnap.empty) {
          const doc = matchSnap.docs[0];
          const data = doc.data();
          const result = {
            id: doc.id,
            phone: data.phone || normalized,
            normalizedPhone: data.normalizedPhone || normalized,
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            isNew: false,
          };
          this.contacts.set(memKey, result);
          return result;
        }

        const id = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newContact = {
          id,
          organizationId,
          clientId,
          firstName: profileName || 'WhatsApp',
          lastName: profileName ? '' : 'Contact',
          phone: normalized,
          normalizedPhone: normalized,
          email: '',
          company: '',
          tags: ['Live Inbound'],
          groups: [],
          whatsappOptIn: false,
          marketingOptIn: false,
          transactionalOptIn: false,
          optOut: false,
          status: 'Active',
          createdAt: now,
          updatedAt: now,
        };

        await adminDb.collection('contacts').doc(id).set(newContact);
        const result = {
          id,
          phone: normalized,
          normalizedPhone: normalized,
          firstName: newContact.firstName,
          lastName: newContact.lastName,
          isNew: true,
        };
        this.contacts.set(memKey, result);
        return result;
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    // Memory fallback
    const cachedContact = this.contacts.get(memKey);
    if (cachedContact) {
      return { ...cachedContact, isNew: false };
    }

    const id = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const createdContact = {
      id,
      phone: normalized,
      normalizedPhone: normalized,
      firstName: profileName || 'WhatsApp',
      lastName: profileName ? '' : 'Contact',
      isNew: true,
    };
    this.contacts.set(memKey, createdContact);
    return createdContact;
  }

  /**
   * 6. Find or create Conversation in Firestore using normalizedPhone
   */
  async findOrCreateConversation(params: {
    organizationId: string;
    clientId: string;
    contactId: string;
    contactPhone: string;
    contactName: string;
    lastMessage: string;
    lastMessageAt: string;
  }): Promise<{ id: string; unreadCount: number }> {
    const { organizationId, clientId, contactId, contactPhone, contactName, lastMessage, lastMessageAt } = params;
    const normalized = normalizeE164(contactPhone);
    const cleanPhoneDigits = normalized.replace(/\D/g, '') || contactPhone.replace(/\D/g, '');
    const memKey = `${organizationId}_${clientId}_${cleanPhoneDigits}`;

    if (isProduction) {
      try {
        const matchSnap = await adminDb
          .collection('conversations')
          .where('organizationId', '==', organizationId)
          .where('clientId', '==', clientId)
          .where('normalizedPhone', '==', normalized)
          .limit(1)
          .get();

        if (!matchSnap.empty) {
          const doc = matchSnap.docs[0];
          const data = doc.data();
          const nextUnread = (data.unreadCount || 0) + 1;
          await doc.ref.update({
            lastMessage,
            lastMessageAt,
            lastIncomingMessageAt: lastMessageAt,
            unreadCount: nextUnread,
            status: 'Open',
          });
          const res = { id: doc.id, unreadCount: nextUnread };
          this.conversations.set(memKey, res);
          return res;
        }

        const id = `cnv_${clientId}_${cleanPhoneDigits}`;
        const newConv = {
          id,
          organizationId,
          clientId,
          contactId,
          contactPhone: normalized || contactPhone,
          normalizedPhone: normalized,
          contactName: contactName || normalized || contactPhone,
          lastMessage,
          lastMessageAt,
          lastIncomingMessageAt: lastMessageAt,
          unreadCount: 1,
          status: 'Open',
          createdAt: lastMessageAt,
        };

        await adminDb.collection('conversations').doc(id).set(newConv, { merge: true });
        const res = { id, unreadCount: 1 };
        this.conversations.set(memKey, res);
        return res;
      } catch (err: any) {
        this.handleProductionError('findOrCreateConversation', err);
      }
    }

    // Development / preview mode
    if (this.adminDbAvailable) {
      try {
        const matchSnap = await adminDb
          .collection('conversations')
          .where('organizationId', '==', organizationId)
          .where('clientId', '==', clientId)
          .where('normalizedPhone', '==', normalized)
          .limit(1)
          .get();

        if (!matchSnap.empty) {
          const doc = matchSnap.docs[0];
          const data = doc.data();
          const nextUnread = (data.unreadCount || 0) + 1;
          await doc.ref.update({
            lastMessage,
            lastMessageAt,
            lastIncomingMessageAt: lastMessageAt,
            unreadCount: nextUnread,
            status: 'Open',
          });
          const res = { id: doc.id, unreadCount: nextUnread };
          this.conversations.set(memKey, res);
          return res;
        }

        const id = `cnv_${clientId}_${cleanPhoneDigits}`;
        const newConv = {
          id,
          organizationId,
          clientId,
          contactId,
          contactPhone: normalized || contactPhone,
          normalizedPhone: normalized,
          contactName: contactName || normalized || contactPhone,
          lastMessage,
          lastMessageAt,
          lastIncomingMessageAt: lastMessageAt,
          unreadCount: 1,
          status: 'Open',
          createdAt: lastMessageAt,
        };

        await adminDb.collection('conversations').doc(id).set(newConv, { merge: true });
        const res = { id, unreadCount: 1 };
        this.conversations.set(memKey, res);
        return res;
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    // Memory fallback
    const cached = this.conversations.get(memKey);
    if (cached) {
      cached.unreadCount += 1;
      return cached;
    }

    const id = `cnv_${clientId}_${cleanPhoneDigits}`;
    const newConv = { id, unreadCount: 1 };
    this.conversations.set(memKey, newConv);
    return newConv;
  }

  /**
   * 7. Concurrency-safe atomic transaction for inbound message processing:
   * - Checks incoming_<wamid> event
   * - Finds or creates conversation and atomically increments unread
   * - Persists inbound message
   * - Persists incoming durable event with full payload shape
   * Returns { alreadyProcessed: boolean, conversationId: string, unreadCount: number }
   */
  async processInboundMessageTransaction(params: {
    wamid: string;
    organizationId: string;
    clientId: string;
    phoneNumberId: string;
    contactId: string;
    contactPhone: string;
    contactName: string;
    text: string;
    timestamp: string;
    profileName?: string;
  }): Promise<{ alreadyProcessed: boolean; conversationId: string; unreadCount: number }> {
    const { wamid, organizationId, clientId, phoneNumberId, contactId, contactPhone, contactName, text, timestamp, profileName } = params;
    const normalized = normalizeE164(contactPhone);
    const cleanPhoneDigits = normalized.replace(/\D/g, '') || contactPhone.replace(/\D/g, '');
    const eventId = `incoming_${wamid}`;
    const sanitizedWamid = wamid.replace(/[^a-zA-Z0-9]/g, '_');
    const msgId = `msg_wamid_${sanitizedWamid}`;
    const memConvKey = `${organizationId}_${clientId}_${cleanPhoneDigits}`;

    // Payload adheres strictly to required minimum shape:
    // { wamid, fromPhone, text, profileName, timestamp }
    const eventPayload = {
      wamid,
      fromPhone: normalized || contactPhone,
      text,
      profileName: profileName || contactName || 'WhatsApp User',
      timestamp,
      conversationId: `cnv_${clientId}_${cleanPhoneDigits}`,
      unreadCount: 1,
    };

    if (isProduction) {
      try {
        const eventRef = adminDb.collection('whatsapp_webhook_events').doc(eventId);
        const msgRef = adminDb.collection('messages').doc(msgId);

        return await adminDb.runTransaction(async (transaction) => {
          const eventDoc = await transaction.get(eventRef);
          if (eventDoc.exists) {
            const evtData = eventDoc.data();
            return {
              alreadyProcessed: true,
              conversationId: evtData?.payload?.conversationId || `cnv_${clientId}_${cleanPhoneDigits}`,
              unreadCount: evtData?.payload?.unreadCount || 0,
            };
          }

          const convQuery = adminDb
            .collection('conversations')
            .where('organizationId', '==', organizationId)
            .where('clientId', '==', clientId)
            .where('normalizedPhone', '==', normalized)
            .limit(1);

          const convQuerySnap = await transaction.get(convQuery);
          let convRef: any;
          let nextUnread = 1;

          if (!convQuerySnap.empty) {
            const doc = convQuerySnap.docs[0];
            convRef = doc.ref;
            const convData = doc.data();
            nextUnread = (convData.unreadCount || 0) + 1;
            transaction.update(convRef, {
              lastMessage: text,
              lastMessageAt: timestamp,
              lastIncomingMessageAt: timestamp,
              unreadCount: nextUnread,
              status: 'Open',
              normalizedPhone: normalized,
            });
          } else {
            const convId = `cnv_${clientId}_${cleanPhoneDigits}`;
            convRef = adminDb.collection('conversations').doc(convId);
            const convData = {
              id: convId,
              organizationId,
              clientId,
              contactId,
              contactPhone: normalized || contactPhone,
              normalizedPhone: normalized,
              contactName: contactName || normalized || contactPhone,
              lastMessage: text,
              lastMessageAt: timestamp,
              lastIncomingMessageAt: timestamp,
              unreadCount: 1,
              status: 'Open',
              createdAt: timestamp,
            };
            transaction.set(convRef, convData, { merge: true });
          }

          const msgData = {
            id: msgId,
            conversationId: convRef.id,
            organizationId,
            clientId,
            contactId,
            direction: 'incoming',
            senderType: 'customer',
            messageType: 'text',
            body: text,
            status: 'Delivered',
            whatsappMessageId: wamid,
            timestamp,
            createdAt: timestamp,
            isDemo: false,
          };
          transaction.set(msgRef, msgData, { merge: true });

          const eventData: DurableWebhookEvent = {
            id: eventId,
            organizationId,
            clientId,
            phoneNumberId,
            type: 'incoming_message',
            wamid,
            eventTimestamp: timestamp,
            receivedAt: new Date().toISOString(),
            payload: {
              ...eventPayload,
              conversationId: convRef.id,
              unreadCount: nextUnread,
            },
          };
          transaction.set(eventRef, eventData, { merge: true });

          this.webhookEvents.set(eventId, eventData);
          this.conversations.set(memConvKey, { id: convRef.id, unreadCount: nextUnread });

          return {
            alreadyProcessed: false,
            conversationId: convRef.id,
            unreadCount: nextUnread,
          };
        });
      } catch (err: any) {
        this.handleProductionError('processInboundMessageTransaction', err);
      }
    }

    // Development / preview mode:
    if (this.webhookEvents.has(eventId)) {
      const existingEvt = this.webhookEvents.get(eventId)!;
      return {
        alreadyProcessed: true,
        conversationId: existingEvt.payload?.conversationId || `cnv_${clientId}_${cleanPhoneDigits}`,
        unreadCount: existingEvt.payload?.unreadCount || 0,
      };
    }

    if (this.adminDbAvailable) {
      try {
        const eventRef = adminDb.collection('whatsapp_webhook_events').doc(eventId);
        const msgRef = adminDb.collection('messages').doc(msgId);

        return await adminDb.runTransaction(async (transaction) => {
          const eventDoc = await transaction.get(eventRef);
          if (eventDoc.exists) {
            const evtData = eventDoc.data();
            return {
              alreadyProcessed: true,
              conversationId: evtData?.payload?.conversationId || `cnv_${clientId}_${cleanPhoneDigits}`,
              unreadCount: evtData?.payload?.unreadCount || 0,
            };
          }

          const convId = `cnv_${clientId}_${cleanPhoneDigits}`;
          const convRef = adminDb.collection('conversations').doc(convId);
          const nextUnread = 1;

          const msgData = {
            id: msgId,
            conversationId: convId,
            organizationId,
            clientId,
            contactId,
            direction: 'incoming',
            senderType: 'customer',
            messageType: 'text',
            body: text,
            status: 'Delivered',
            whatsappMessageId: wamid,
            timestamp,
            createdAt: timestamp,
            isDemo: false,
          };
          transaction.set(msgRef, msgData, { merge: true });

          const eventData: DurableWebhookEvent = {
            id: eventId,
            organizationId,
            clientId,
            phoneNumberId,
            type: 'incoming_message',
            wamid,
            eventTimestamp: timestamp,
            receivedAt: new Date().toISOString(),
            payload: {
              ...eventPayload,
              conversationId: convId,
              unreadCount: nextUnread,
            },
          };
          transaction.set(eventRef, eventData, { merge: true });

          this.webhookEvents.set(eventId, eventData);
          return { alreadyProcessed: false, conversationId: convId, unreadCount: nextUnread };
        });
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    // Memory fallback transaction
    const convId = `cnv_${clientId}_${cleanPhoneDigits}`;
    const cachedConv = this.conversations.get(memConvKey);
    const nextUnread = cachedConv ? cachedConv.unreadCount + 1 : 1;
    this.conversations.set(memConvKey, { id: convId, unreadCount: nextUnread });

    const eventData: DurableWebhookEvent = {
      id: eventId,
      organizationId,
      clientId,
      phoneNumberId,
      type: 'incoming_message',
      wamid,
      eventTimestamp: timestamp,
      receivedAt: new Date().toISOString(),
      payload: {
        ...eventPayload,
        conversationId: convId,
        unreadCount: nextUnread,
      },
    };
    this.webhookEvents.set(eventId, eventData);

    const msgData = {
      id: msgId,
      conversationId: convId,
      organizationId,
      clientId,
      contactId,
      direction: 'incoming',
      senderType: 'customer',
      messageType: 'text',
      body: text,
      status: 'Delivered',
      whatsappMessageId: wamid,
      timestamp,
      createdAt: timestamp,
      isDemo: false,
    };
    this.messages.set(msgId, msgData);

    return {
      alreadyProcessed: false,
      conversationId: convId,
      unreadCount: nextUnread,
    };
  }

  /**
   * 8. Persist Outgoing Message to Firestore (automation replies, broadcasts, manual sends)
   */
  async persistOutgoingMessage(params: {
    conversationId: string;
    organizationId: string;
    clientId: string;
    contactId?: string;
    recipient?: string;
    wamid?: string;
    text: string;
    senderType: 'agent' | 'automation' | 'broadcast';
    messageType?: 'text' | 'template';
    templateName?: string;
    status?: string;
    timestamp?: string;
  }): Promise<string> {
    const now = params.timestamp || new Date().toISOString();
    const sanitizedWamid = params.wamid ? params.wamid.replace(/[^a-zA-Z0-9]/g, '_') : '';
    const msgId = params.wamid ? `msg_wamid_${sanitizedWamid}` : `msg_out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const msgData = {
      id: msgId,
      conversationId: params.conversationId,
      organizationId: params.organizationId,
      clientId: params.clientId,
      contactId: params.contactId || '',
      recipient: params.recipient || '',
      direction: 'outgoing',
      senderType: params.senderType,
      messageType: params.messageType || 'text',
      templateName: params.templateName || '',
      body: params.text,
      status: params.status || 'submitted',
      whatsappMessageId: params.wamid || '',
      submittedAt: now,
      timestamp: now,
      createdAt: now,
      isDemo: false,
    };

    if (isProduction) {
      try {
        await adminDb.collection('messages').doc(msgId).set(msgData, { merge: true });

        if (params.conversationId) {
          await adminDb.collection('conversations').doc(params.conversationId).set(
            {
              lastMessage: params.text,
              lastMessageAt: now,
              lastOutgoingMessageAt: now,
            },
            { merge: true }
          );
        }
        this.messages.set(msgId, msgData);
        return msgId;
      } catch (err: any) {
        this.handleProductionError('persistOutgoingMessage', err);
      }
    }

    // Development / preview mode
    this.messages.set(msgId, msgData);
    if (this.adminDbAvailable) {
      try {
        await adminDb.collection('messages').doc(msgId).set(msgData, { merge: true });

        if (params.conversationId) {
          await adminDb.collection('conversations').doc(params.conversationId).set(
            {
              lastMessage: params.text,
              lastMessageAt: now,
              lastOutgoingMessageAt: now,
            },
            { merge: true }
          );
        }
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    return msgId;
  }

  /**
   * 9. Monotonic Message Delivery Status Update
   */
  async updateMessageDeliveryStatus(
    wamid: string,
    rawStatus: 'sent' | 'delivered' | 'read' | 'failed',
    eventTimestamp: string,
    failureReason?: string
  ): Promise<boolean> {
    const mappedStatus =
      rawStatus === 'read' ? 'Read' : rawStatus === 'delivered' ? 'Delivered' : rawStatus === 'failed' ? 'Failed' : 'Sent';
    const newRank = STATUS_RANK[mappedStatus] || 0;

    if (isProduction) {
      try {
        const snap = await adminDb.collection('messages').where('whatsappMessageId', '==', wamid).get();
        if (!snap.empty) {
          for (const doc of snap.docs) {
            const currentData = doc.data();
            const currentRank = STATUS_RANK[currentData.status] || 0;

            if (mappedStatus === 'Failed' || newRank >= currentRank) {
              const updatePayload: Record<string, any> = {
                status: mappedStatus,
                updatedAt: eventTimestamp,
              };
              if (failureReason) updatePayload.failureReason = failureReason;
              if (rawStatus === 'delivered') updatePayload.deliveredAt = eventTimestamp;
              if (rawStatus === 'read') updatePayload.readAt = eventTimestamp;
              if (rawStatus === 'failed') updatePayload.failedAt = eventTimestamp;

              await doc.ref.update(updatePayload);
            }
          }
        }
        return true;
      } catch (err: any) {
        this.handleProductionError('updateMessageDeliveryStatus', err);
      }
    }

    // Development / preview mode
    for (const [id, msg] of this.messages.entries()) {
      if (msg.whatsappMessageId === wamid) {
        const curRank = STATUS_RANK[msg.status] || 0;
        if (mappedStatus === 'Failed' || newRank >= curRank) {
          msg.status = mappedStatus;
          msg.updatedAt = eventTimestamp;
          if (failureReason) msg.failureReason = failureReason;
          if (rawStatus === 'delivered') msg.deliveredAt = eventTimestamp;
          if (rawStatus === 'read') msg.readAt = eventTimestamp;
          if (rawStatus === 'failed') msg.failedAt = eventTimestamp;
          this.messages.set(id, msg);
        }
      }
    }

    if (this.adminDbAvailable) {
      try {
        const snap = await adminDb.collection('messages').where('whatsappMessageId', '==', wamid).get();
        if (!snap.empty) {
          for (const doc of snap.docs) {
            const currentData = doc.data();
            const currentRank = STATUS_RANK[currentData.status] || 0;

            if (mappedStatus === 'Failed' || newRank >= currentRank) {
              const updatePayload: Record<string, any> = {
                status: mappedStatus,
                updatedAt: eventTimestamp,
              };
              if (failureReason) updatePayload.failureReason = failureReason;
              if (rawStatus === 'delivered') updatePayload.deliveredAt = eventTimestamp;
              if (rawStatus === 'read') updatePayload.readAt = eventTimestamp;
              if (rawStatus === 'failed') updatePayload.failedAt = eventTimestamp;

              await doc.ref.update(updatePayload);
            }
          }
        }
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    return true;
  }

  /**
   * 10. Update Campaign Recipient Status and Recalculate Aggregates
   */
  async updateCampaignRecipientStatus(
    wamid: string,
    rawStatus: 'sent' | 'delivered' | 'read' | 'failed',
    eventTimestamp: string,
    failureReason?: string
  ): Promise<boolean> {
    if (isProduction) {
      try {
        const snap = await adminDb.collection('campaign_recipients').where('whatsappMessageId', '==', wamid).get();
        if (!snap.empty) {
          for (const doc of snap.docs) {
            const currentData = doc.data();
            if (currentData.status === 'read' && rawStatus !== 'read' && rawStatus !== 'failed') {
              continue;
            }

            const updatePayload: Record<string, any> = {
              status: rawStatus,
              updatedAt: eventTimestamp,
            };
            if (rawStatus === 'delivered') updatePayload.deliveredAt = eventTimestamp;
            if (rawStatus === 'read') updatePayload.readAt = eventTimestamp;
            if (rawStatus === 'failed') {
              updatePayload.failedAt = eventTimestamp;
              if (failureReason) updatePayload.failureReason = failureReason;
            }

            await doc.ref.update(updatePayload);

            if (currentData.campaignId) {
              await this.updateCampaignAggregates(currentData.campaignId);
            }
          }
        }
        return true;
      } catch (err: any) {
        this.handleProductionError('updateCampaignRecipientStatus', err);
      }
    }

    // Development / preview mode
    for (const [id, rec] of this.campaignRecipients.entries()) {
      if (rec.whatsappMessageId === wamid) {
        if (rec.status === 'read' && rawStatus !== 'read' && rawStatus !== 'failed') continue;
        rec.status = rawStatus;
        rec.updatedAt = eventTimestamp;
        if (rawStatus === 'delivered') rec.deliveredAt = eventTimestamp;
        if (rawStatus === 'read') rec.readAt = eventTimestamp;
        if (rawStatus === 'failed') {
          rec.failedAt = eventTimestamp;
          if (failureReason) rec.failureReason = failureReason;
        }
        this.campaignRecipients.set(id, rec);
      }
    }

    if (this.adminDbAvailable) {
      try {
        const snap = await adminDb.collection('campaign_recipients').where('whatsappMessageId', '==', wamid).get();
        if (!snap.empty) {
          for (const doc of snap.docs) {
            const currentData = doc.data();
            if (currentData.status === 'read' && rawStatus !== 'read' && rawStatus !== 'failed') {
              continue;
            }

            const updatePayload: Record<string, any> = {
              status: rawStatus,
              updatedAt: eventTimestamp,
            };
            if (rawStatus === 'delivered') updatePayload.deliveredAt = eventTimestamp;
            if (rawStatus === 'read') updatePayload.readAt = eventTimestamp;
            if (rawStatus === 'failed') {
              updatePayload.failedAt = eventTimestamp;
              if (failureReason) updatePayload.failureReason = failureReason;
            }

            await doc.ref.update(updatePayload);

            if (currentData.campaignId) {
              await this.updateCampaignAggregates(currentData.campaignId);
            }
          }
        }
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    return true;
  }

  /**
   * 11. Recalculate Campaign Aggregates from Persisted Recipients
   */
  async updateCampaignAggregates(campaignId: string): Promise<void> {
    if (isProduction) {
      try {
        const recsSnap = await adminDb
          .collection('campaign_recipients')
          .where('campaignId', '==', campaignId)
          .get();

        if (!recsSnap.empty) {
          const recs = recsSnap.docs.map((d) => d.data());
          const sentCount = recs.filter((r) => r.status === 'sent' || r.status === 'delivered' || r.status === 'read').length;
          const deliveredCount = recs.filter((r) => r.status === 'delivered' || r.status === 'read').length;
          const readCount = recs.filter((r) => r.status === 'read').length;
          const failedCount = recs.filter((r) => r.status === 'failed').length;

          await adminDb.collection('campaigns').doc(campaignId).set(
            {
              sentCount,
              deliveredCount,
              readCount,
              failedCount,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
        return;
      } catch (err: any) {
        this.handleProductionError('updateCampaignAggregates', err);
      }
    }

    // Development / preview mode
    if (this.adminDbAvailable) {
      try {
        const recsSnap = await adminDb
          .collection('campaign_recipients')
          .where('campaignId', '==', campaignId)
          .get();

        if (!recsSnap.empty) {
          const recs = recsSnap.docs.map((d) => d.data());
          const sentCount = recs.filter((r) => r.status === 'sent' || r.status === 'delivered' || r.status === 'read').length;
          const deliveredCount = recs.filter((r) => r.status === 'delivered' || r.status === 'read').length;
          const readCount = recs.filter((r) => r.status === 'read').length;
          const failedCount = recs.filter((r) => r.status === 'failed').length;

          await adminDb.collection('campaigns').doc(campaignId).set(
            {
              sentCount,
              deliveredCount,
              readCount,
              failedCount,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }
  }

  /**
   * 12. Retrieve Active Automation Rules for resolved Org & Client
   */
  async getAutomationRules(organizationId: string, clientId: string): Promise<any[]> {
    if (isProduction) {
      try {
        const snap = await adminDb
          .collection('automation_rules')
          .where('organizationId', '==', organizationId)
          .where('clientId', '==', clientId)
          .get();

        return snap.docs
          .map((d) => d.data())
          .filter((r) => r.active !== false && (r.status === 'active' || r.status === 'Active' || !r.status));
      } catch (err: any) {
        this.handleProductionError('getAutomationRules', err);
      }
    }

    if (this.adminDbAvailable) {
      try {
        const snap = await adminDb
          .collection('automation_rules')
          .where('organizationId', '==', organizationId)
          .where('clientId', '==', clientId)
          .get();

        return snap.docs
          .map((d) => d.data())
          .filter((r) => r.active !== false && (r.status === 'active' || r.status === 'Active' || !r.status));
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }

    const key = `${organizationId}_${clientId}`;
    return this.automationRules.get(key) || [];
  }

  /**
   * Cache automation rules from sync-rules endpoint
   */
  updateAutomationRulesCache(organizationId: string, clientId: string, rules: any[]) {
    this.automationRules.set(`${organizationId}_${clientId}`, rules);
  }

  /**
   * 13. Durable Server-Side STOP / Opt-Out Handling
   * Consent-history idempotency based on incoming wamid
   */
  async updateContactOptOut(params: {
    contactId: string;
    organizationId: string;
    clientId: string;
    phone: string;
    optOutDate: string;
    source: string;
    wamid?: string;
    notes?: string;
  }): Promise<void> {
    const normalized = normalizeE164(params.phone);
    this.optOuts.set(normalized, true);

    const consentId = params.wamid
      ? `opt_out_${params.wamid.replace(/[^a-zA-Z0-9]/g, '_')}`
      : `opt_out_${params.contactId}_${params.optOutDate.substring(0, 10)}`;

    if (isProduction) {
      try {
        const contactRef = adminDb.collection('contacts').doc(params.contactId);
        await contactRef.set(
          {
            optOut: true,
            marketingOptIn: false,
            transactionalOptIn: false,
            status: 'Opted Out',
            optOutDate: params.optOutDate,
            optOutSource: params.source,
            updatedAt: params.optOutDate,
          },
          { merge: true }
        );

        const consentRef = adminDb.collection('opt_in_history').doc(consentId);
        await consentRef.set(
          {
            id: consentId,
            organizationId: params.organizationId,
            clientId: params.clientId,
            contactId: params.contactId,
            phone: params.phone,
            previousStatus: 'Active',
            newStatus: 'Opted Out',
            source: params.source,
            sourceWamid: params.wamid || '',
            changedByUserId: 'whatsapp_server',
            timestamp: params.optOutDate,
            notes: params.notes || 'Inbound WhatsApp STOP Command',
            event: 'opt_out',
          },
          { merge: true }
        );
        return;
      } catch (err: any) {
        this.handleProductionError('updateContactOptOut', err);
      }
    }

    // Development / preview mode
    if (this.adminDbAvailable) {
      try {
        const contactRef = adminDb.collection('contacts').doc(params.contactId);
        await contactRef.set(
          {
            optOut: true,
            marketingOptIn: false,
            transactionalOptIn: false,
            status: 'Opted Out',
            optOutDate: params.optOutDate,
            optOutSource: params.source,
            updatedAt: params.optOutDate,
          },
          { merge: true }
        );

        const consentRef = adminDb.collection('opt_in_history').doc(consentId);
        await consentRef.set(
          {
            id: consentId,
            organizationId: params.organizationId,
            clientId: params.clientId,
            contactId: params.contactId,
            phone: params.phone,
            previousStatus: 'Active',
            newStatus: 'Opted Out',
            source: params.source,
            sourceWamid: params.wamid || '',
            changedByUserId: 'whatsapp_server',
            timestamp: params.optOutDate,
            notes: params.notes || 'Inbound WhatsApp STOP Command',
            event: 'opt_out',
          },
          { merge: true }
        );
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }
  }

  /**
   * 14. Durable Server-Side START / Opt-In Handling
   */
  async updateContactOptIn(params: {
    contactId: string;
    organizationId: string;
    clientId: string;
    phone: string;
    timestamp: string;
    source: string;
    wamid?: string;
  }): Promise<void> {
    const normalized = normalizeE164(params.phone);
    this.optOuts.set(normalized, false);

    const consentId = params.wamid
      ? `opt_in_${params.wamid.replace(/[^a-zA-Z0-9]/g, '_')}`
      : `opt_in_${params.contactId}_${params.timestamp.substring(0, 10)}`;

    if (isProduction) {
      try {
        const contactRef = adminDb.collection('contacts').doc(params.contactId);
        await contactRef.set(
          {
            optOut: false,
            marketingOptIn: true,
            status: 'Active',
            optInDate: params.timestamp,
            optInSource: params.source,
            updatedAt: params.timestamp,
          },
          { merge: true }
        );

        const consentRef = adminDb.collection('opt_in_history').doc(consentId);
        await consentRef.set(
          {
            id: consentId,
            organizationId: params.organizationId,
            clientId: params.clientId,
            contactId: params.contactId,
            phone: params.phone,
            previousStatus: 'Opted Out',
            newStatus: 'Marketing Consented',
            source: params.source,
            sourceWamid: params.wamid || '',
            changedByUserId: 'whatsapp_server',
            timestamp: params.timestamp,
            notes: 'Inbound WhatsApp START Command',
            event: 'opt_in',
          },
          { merge: true }
        );
        return;
      } catch (err: any) {
        this.handleProductionError('updateContactOptIn', err);
      }
    }

    // Development / preview mode
    if (this.adminDbAvailable) {
      try {
        const contactRef = adminDb.collection('contacts').doc(params.contactId);
        await contactRef.set(
          {
            optOut: false,
            marketingOptIn: true,
            status: 'Active',
            optInDate: params.timestamp,
            optInSource: params.source,
            updatedAt: params.timestamp,
          },
          { merge: true }
        );

        const consentRef = adminDb.collection('opt_in_history').doc(consentId);
        await consentRef.set(
          {
            id: consentId,
            organizationId: params.organizationId,
            clientId: params.clientId,
            contactId: params.contactId,
            phone: params.phone,
            previousStatus: 'Opted Out',
            newStatus: 'Marketing Consented',
            source: params.source,
            sourceWamid: params.wamid || '',
            changedByUserId: 'whatsapp_server',
            timestamp: params.timestamp,
            notes: 'Inbound WhatsApp START Command',
            event: 'opt_in',
          },
          { merge: true }
        );
      } catch (err: any) {
        this.handleDevAdminNotice(err);
      }
    }
  }
}

export const whatsappDataRepository = new WhatsAppDataRepository();
