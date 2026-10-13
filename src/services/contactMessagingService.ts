import type { Contact, Conversation } from '../types/index.ts';
import { dataStore } from './dataStore.ts';
import { arePhoneNumbersEqual, normalizePhoneNumber } from '../utils/phoneUtils.ts';

/**
 * Returns the existing Client-scoped Conversation for a Contact or creates one.
 *
 * This deliberately reuses the existing DataStore persistence primitives so all
 * later sends continue through sendManualMessage/sendManualTemplateMessage.
 */
export function ensureConversationForContact(contact: Contact): Conversation {
  const existing = dataStore.conversations.find(
    (conv) =>
      conv.clientId === contact.clientId &&
      (
        conv.contactId === contact.id ||
        arePhoneNumbersEqual(conv.contactPhone || '', contact.phone || '')
      )
  );

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const normalizedPhone = normalizePhoneNumber(contact.phone || '').normalized || contact.phone;
  const displayName =
    `${contact.firstName || ''} ${contact.lastName || ''}`.trim() ||
    contact.company ||
    contact.phone;

  const conversation: Conversation = {
    id: `cnv_contact_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    organizationId: contact.organizationId,
    clientId: contact.clientId,
    contactId: contact.id,
    contactPhone: contact.phone,
    normalizedPhone,
    contactName: displayName,
    lastMessage: '',
    lastMessageAt: now,
    unreadCount: 0,
    status: 'Closed',
    createdAt: now,
  };

  dataStore.conversations.unshift(conversation);

  // DataStore's persistence helpers are intentionally kept private. Reuse them
  // here without duplicating Firestore configuration or creating a second store.
  const store = dataStore as any;
  if (typeof store.persistDoc === 'function') {
    store.persistDoc('conversations', conversation.id, conversation);
  }
  if (typeof store.notify === 'function') {
    store.notify();
  }

  return conversation;
}

export function isConversationWindowOpen(conversation?: Conversation | null): boolean {
  if (!conversation?.lastIncomingMessageAt) return false;

  const lastIncoming = new Date(conversation.lastIncomingMessageAt).getTime();
  if (!Number.isFinite(lastIncoming) || lastIncoming <= 0) return false;

  return Date.now() - lastIncoming < 24 * 60 * 60 * 1000;
}
