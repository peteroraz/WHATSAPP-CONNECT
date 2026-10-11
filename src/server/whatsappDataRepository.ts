import { adminDb } from './firebaseAdmin.ts';

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

function normalizeE164(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function arePhoneNumbersEqual(p1: string, p2: string): boolean {
  const d1 = (p1 || '').replace(/\D/g, '');
  const d2 = (p2 || '').replace(/\D/g, '');
  return Boolean(d1 && d2 && (d1 === d2 || d1.endsWith(d2) || d2.endsWith(d1)));
}

export class WhatsAppDataRepository {
  /**
   * 1. Resolve phone route from Meta phone_number_id
   * Resolves: phone_number_id -> { organizationId, clientId }
   */
  async resolvePhoneRoute(phoneNumberId: string): Promise<WhatsAppPhoneRoute | null> {
    if (!phoneNumberId) return null;
    try {
      const docRef = adminDb.collection('whatsapp_phone_routes').doc(phoneNumberId);
      const snap = await docRef.get();
      if (snap.exists) {
        const data = snap.data() as WhatsAppPhoneRoute;
        if (data.active !== false) {
          return data;
        }
      }

      // Fallback: Check if this phoneNumberId is configured in environment
      const envPhoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
      if (envPhoneId && envPhoneId === phoneNumberId) {
        // Query organizations collection to find existing organization if route not yet written
        const orgsSnap = await adminDb.collection('organizations').limit(1).get();
        if (!orgsSnap.empty) {
          const org = orgsSnap.docs[0];
          const orgId = org.id;
          const defaultClientId = `client_default_${orgId}`;
          return {
            phoneNumberId,
            organizationId: orgId,
            clientId: defaultClientId,
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      }
    } catch (err) {
      console.error('[WhatsAppRepo] Error resolving phone route:', err);
    }
    return null;
  }

  /**
   * 2. Register or update the default route for current environment WHATSAPP_PHONE_NUMBER_ID
   */
  async registerDefaultRoute(organizationId: string, clientId: string): Promise<{ success: boolean; phoneNumberId?: string; error?: string }> {
    const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    if (!phoneNumberId) {
      return { success: false, error: 'WHATSAPP_PHONE_NUMBER_ID environment variable is not configured.' };
    }

    try {
      const now = new Date().toISOString();
      const docRef = adminDb.collection('whatsapp_phone_routes').doc(phoneNumberId);
      const existing = await docRef.get();

      const routeData: WhatsAppPhoneRoute = {
        phoneNumberId,
        organizationId,
        clientId,
        active: true,
        createdAt: existing.exists ? (existing.data()?.createdAt || now) : now,
        updatedAt: now,
      };

      await docRef.set(routeData, { merge: true });
      return { success: true, phoneNumberId };
    } catch (err: any) {
      console.error('[WhatsAppRepo] Error registering default route:', err?.message);
      return { success: false, error: err?.message || 'Failed to persist route' };
    }
  }

  /**
   * 3. Persist durable webhook event to Firestore
   * Idempotent by deterministic ID: incoming_<wamid> or status_<wamid>_<status>
   */
  async persistWebhookEvent(event: DurableWebhookEvent): Promise<void> {
    try {
      const docRef = adminDb.collection('whatsapp_webhook_events').doc(event.id);
      await docRef.set(event, { merge: true });
    } catch (err) {
      console.error('[WhatsAppRepo] Error persisting webhook event:', err);
    }
  }

  /**
   * 4. Retrieve durable webhook events from Firestore
   */
  async getDurableWebhookEvents(params: {
    since?: string;
    clientId?: string;
    limit?: number;
  }): Promise<DurableWebhookEvent[]> {
    try {
      let queryRef = adminDb.collection('whatsapp_webhook_events').asQuery();

      if (params.clientId) {
        queryRef = queryRef.where('clientId', '==', params.clientId);
      }

      if (params.since) {
        queryRef = queryRef.where('receivedAt', '>=', params.since);
      }

      const limitCount = Math.min(params.limit || 100, 500);
      queryRef = queryRef.orderBy('receivedAt', 'asc').limit(limitCount);

      const snap = await queryRef.get();
      return snap.docs.map((d) => d.data() as DurableWebhookEvent);
    } catch (err) {
      console.error('[WhatsAppRepo] Error getting durable webhook events:', err);
      // Fallback: without composite index, fetch latest and sort in memory
      try {
        let fallbackQuery = adminDb.collection('whatsapp_webhook_events').asQuery();
        if (params.clientId) {
          fallbackQuery = fallbackQuery.where('clientId', '==', params.clientId);
        }
        const snap = await fallbackQuery.limit(Math.min(params.limit || 100, 500)).get();
        let events = snap.docs.map((d) => d.data() as DurableWebhookEvent);
        if (params.since) {
          events = events.filter((e) => e.receivedAt >= params.since! || e.eventTimestamp >= params.since!);
        }
        events.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
        return events;
      } catch (innerErr) {
        console.error('[WhatsAppRepo] Fallback get events failed:', innerErr);
        return [];
      }
    }
  }

  /**
   * 5. Find or create Contact in Firestore (default 'Not Consented')
   */
  async findOrCreateInboundContact(params: {
    organizationId: string;
    clientId: string;
    phone: string;
    profileName?: string;
    timestamp?: string;
  }): Promise<{ id: string; phone: string; firstName: string; lastName: string; isNew: boolean }> {
    const { organizationId, clientId, phone, profileName, timestamp } = params;
    const normalized = normalizeE164(phone);
    const now = timestamp || new Date().toISOString();

    // Query contacts for this org and client
    const contactsSnap = await adminDb
      .collection('contacts')
      .where('organizationId', '==', organizationId)
      .where('clientId', '==', clientId)
      .get();

    for (const doc of contactsSnap.docs) {
      const data = doc.data();
      if (arePhoneNumbersEqual(data.phone, normalized)) {
        return {
          id: doc.id,
          phone: data.phone || normalized,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          isNew: false,
        };
      }
    }

    // Create new contact
    const id = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newContact = {
      id,
      organizationId,
      clientId,
      firstName: profileName || 'WhatsApp',
      lastName: profileName ? '' : 'Contact',
      phone: normalized,
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
    return {
      id,
      phone: normalized,
      firstName: newContact.firstName,
      lastName: newContact.lastName,
      isNew: true,
    };
  }

  /**
   * 6. Find or create Conversation in Firestore
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
    const cleanPhoneDigits = contactPhone.replace(/\D/g, '');

    const convSnap = await adminDb
      .collection('conversations')
      .where('organizationId', '==', organizationId)
      .where('clientId', '==', clientId)
      .get();

    for (const doc of convSnap.docs) {
      const data = doc.data();
      if (arePhoneNumbersEqual(data.contactPhone, contactPhone)) {
        const nextUnread = (data.unreadCount || 0) + 1;
        await doc.ref.update({
          lastMessage,
          lastMessageAt,
          lastIncomingMessageAt: lastMessageAt,
          unreadCount: nextUnread,
          status: 'Open',
        });
        return { id: doc.id, unreadCount: nextUnread };
      }
    }

    // Deterministic ID for newly created webhook conversations
    const id = `cnv_${clientId}_${cleanPhoneDigits}`;
    const newConv = {
      id,
      organizationId,
      clientId,
      contactId,
      contactPhone,
      contactName: contactName || contactPhone,
      lastMessage,
      lastMessageAt,
      lastIncomingMessageAt: lastMessageAt,
      unreadCount: 1,
      status: 'Open',
      createdAt: lastMessageAt,
    };

    await adminDb.collection('conversations').doc(id).set(newConv, { merge: true });
    return { id, unreadCount: 1 };
  }

  /**
   * 7. Persist Inbound Message to Firestore with idempotent ID
   */
  async persistInboundMessage(params: {
    conversationId: string;
    organizationId: string;
    clientId: string;
    contactId: string;
    wamid: string;
    text: string;
    timestamp: string;
  }): Promise<void> {
    const sanitizedWamid = params.wamid.replace(/[^a-zA-Z0-9]/g, '_');
    const msgId = `msg_wamid_${sanitizedWamid}`;
    const docRef = adminDb.collection('messages').doc(msgId);

    const msgData = {
      id: msgId,
      conversationId: params.conversationId,
      organizationId: params.organizationId,
      clientId: params.clientId,
      contactId: params.contactId,
      direction: 'incoming',
      senderType: 'customer',
      messageType: 'text',
      body: params.text,
      status: 'Delivered',
      whatsappMessageId: params.wamid,
      timestamp: params.timestamp,
      createdAt: params.timestamp,
      isDemo: false,
    };

    await docRef.set(msgData, { merge: true });
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

    await adminDb.collection('messages').doc(msgId).set(msgData, { merge: true });

    // Update conversation last message & outgoing time
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

    return msgId;
  }

  /**
   * 9. Monotonic Message Delivery Status Update in Firestore
   * Never allow a lower rank status (e.g. Sent) to downgrade Delivered or Read!
   */
  async updateMessageDeliveryStatus(
    wamid: string,
    rawStatus: 'sent' | 'delivered' | 'read' | 'failed',
    eventTimestamp: string,
    failureReason?: string
  ): Promise<boolean> {
    try {
      const snap = await adminDb.collection('messages').where('whatsappMessageId', '==', wamid).get();
      if (snap.empty) return false;

      const mappedStatus =
        rawStatus === 'read' ? 'Read' : rawStatus === 'delivered' ? 'Delivered' : rawStatus === 'failed' ? 'Failed' : 'Sent';

      const newRank = STATUS_RANK[mappedStatus] || 0;

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
      return true;
    } catch (err) {
      console.error('[WhatsAppRepo] Error updating message status:', err);
      return false;
    }
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
    try {
      const snap = await adminDb.collection('campaign_recipients').where('whatsappMessageId', '==', wamid).get();
      if (snap.empty) return false;

      for (const doc of snap.docs) {
        const currentData = doc.data();
        // If already read, do not downgrade to delivered or sent
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

        // Recalculate campaign aggregates safely
        if (currentData.campaignId) {
          await this.updateCampaignAggregates(currentData.campaignId);
        }
      }
      return true;
    } catch (err) {
      console.error('[WhatsAppRepo] Error updating campaign recipient status:', err);
      return false;
    }
  }

  /**
   * 11. Recalculate Campaign Aggregates from Persisted Recipients
   */
  async updateCampaignAggregates(campaignId: string): Promise<void> {
    try {
      const recsSnap = await adminDb
        .collection('campaign_recipients')
        .where('campaignId', '==', campaignId)
        .get();

      if (recsSnap.empty) return;

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
    } catch (err) {
      console.error('[WhatsAppRepo] Error updating campaign aggregates:', err);
    }
  }

  /**
   * 12. Retrieve Active Automation Rules from Firestore for resolved Org & Client
   */
  async getAutomationRules(organizationId: string, clientId: string): Promise<any[]> {
    try {
      const snap = await adminDb
        .collection('automation_rules')
        .where('organizationId', '==', organizationId)
        .where('clientId', '==', clientId)
        .get();

      return snap.docs
        .map((d) => d.data())
        .filter((r) => r.active !== false && (r.status === 'active' || r.status === 'Active' || !r.status));
    } catch (err) {
      console.error('[WhatsAppRepo] Error getting automation rules:', err);
      return [];
    }
  }

  /**
   * 13. Durable Server-Side STOP / Opt-Out Handling
   */
  async updateContactOptOut(params: {
    contactId: string;
    organizationId: string;
    clientId: string;
    phone: string;
    optOutDate: string;
    source: string;
    notes?: string;
  }): Promise<void> {
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

      // Idempotently create ONE consent record derived from contactId + date
      const dateKey = params.optOutDate.substring(0, 10);
      const consentId = `opt_out_${params.contactId}_${dateKey}`;
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
          changedByUserId: 'whatsapp_server',
          timestamp: params.optOutDate,
          notes: params.notes || 'Inbound WhatsApp STOP Command',
          event: 'opt_out',
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[WhatsAppRepo] Error updating contact opt-out:', err);
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
  }): Promise<void> {
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

      const dateKey = params.timestamp.substring(0, 10);
      const consentId = `opt_in_${params.contactId}_${dateKey}`;
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
          changedByUserId: 'whatsapp_server',
          timestamp: params.timestamp,
          notes: 'Inbound WhatsApp START Command',
          event: 'opt_in',
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[WhatsAppRepo] Error updating contact opt-in:', err);
    }
  }
}

export const whatsappDataRepository = new WhatsAppDataRepository();
