import { 
  Contact, 
  ContactGroup, 
  MessageTemplate, 
  Campaign, 
  CampaignRecipient,
  Conversation, 
  Message, 
  AutomationRule, 
  AuditLog, 
  OptInHistoryEvent, 
  Organization 
} from '../types/index.ts';
import { getInitialSeedData } from './seedService.ts';
import { 
  normalizePhoneNumber, 
  arePhoneNumbersEqual, 
  sanitizeContactRecord,
  getContactConsentStatus 
} from '../utils/phoneUtils.ts';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  query, 
  where, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';

class DataStore {
  private orgId: string = 'default_org';
  private initialized: boolean = false;
  private listeners: Set<() => void> = new Set();

  contacts: Contact[] = [];
  groups: ContactGroup[] = [];
  templates: MessageTemplate[] = [];
  campaigns: Campaign[] = [];
  campaignRecipients: CampaignRecipient[] = [];
  conversations: Conversation[] = [];
  messages: Message[] = [];
  automationRules: AutomationRule[] = [];
  auditLogs: AuditLog[] = [];
  optInHistory: OptInHistoryEvent[] = [];

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
    this.saveLocal();
  }

  private getStorageKey(key: string) {
    return `whatsflow_${this.orgId}_${key}`;
  }

  private saveLocal() {
    try {
      localStorage.setItem(this.getStorageKey('contacts'), JSON.stringify(this.contacts));
      localStorage.setItem(this.getStorageKey('groups'), JSON.stringify(this.groups));
      localStorage.setItem(this.getStorageKey('templates'), JSON.stringify(this.templates));
      localStorage.setItem(this.getStorageKey('campaigns'), JSON.stringify(this.campaigns));
      localStorage.setItem(this.getStorageKey('campaign_recipients'), JSON.stringify(this.campaignRecipients));
      localStorage.setItem(this.getStorageKey('conversations'), JSON.stringify(this.conversations));
      localStorage.setItem(this.getStorageKey('messages'), JSON.stringify(this.messages));
      localStorage.setItem(this.getStorageKey('automationRules'), JSON.stringify(this.automationRules));
      localStorage.setItem(this.getStorageKey('auditLogs'), JSON.stringify(this.auditLogs));
      localStorage.setItem(this.getStorageKey('optInHistory'), JSON.stringify(this.optInHistory));
    } catch (e) {
      console.warn('LocalStorage save warning:', e);
    }
  }

  private loadLocal(): boolean {
    try {
      const c = localStorage.getItem(this.getStorageKey('contacts'));
      if (!c) return false;

      const parsedContacts = JSON.parse(c || '[]');
      this.contacts = (parsedContacts as Contact[]).map((contact) => sanitizeContactRecord(contact) as Contact);
      this.groups = JSON.parse(localStorage.getItem(this.getStorageKey('groups')) || '[]');
      this.templates = JSON.parse(localStorage.getItem(this.getStorageKey('templates')) || '[]');
      this.campaigns = JSON.parse(localStorage.getItem(this.getStorageKey('campaigns')) || '[]');
      this.campaignRecipients = JSON.parse(localStorage.getItem(this.getStorageKey('campaign_recipients')) || '[]');
      this.conversations = JSON.parse(localStorage.getItem(this.getStorageKey('conversations')) || '[]');
      this.messages = JSON.parse(localStorage.getItem(this.getStorageKey('messages')) || '[]');
      this.automationRules = JSON.parse(localStorage.getItem(this.getStorageKey('automationRules')) || '[]');
      this.auditLogs = JSON.parse(localStorage.getItem(this.getStorageKey('auditLogs')) || '[]');
      this.optInHistory = JSON.parse(localStorage.getItem(this.getStorageKey('optInHistory')) || '[]');
      this.updateGroupCounts();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async initialize(organizationId: string) {
    this.orgId = organizationId;

    // Try loading local first for instant rendering
    const hasLocal = this.loadLocal();

    if (!hasLocal || this.contacts.length === 0) {
      // Seed default rich data
      this.seedData(organizationId);
    }

    this.initialized = true;
    this.notify();

    // Async sync with Firestore in background if online
    this.syncFromFirestore().catch(() => {});
  }

  private async syncFromFirestore() {
    // Only query Firestore if an authenticated user session is active
    if (!auth.currentUser) {
      return;
    }

    try {
      const contactsQuery = query(collection(db, 'contacts'), where('organizationId', '==', this.orgId));
      const snap = await getDocs(contactsQuery);
      if (!snap.empty) {
        this.contacts = snap.docs.map((d) => sanitizeContactRecord({ id: d.id, ...d.data() }) as Contact);
        this.updateGroupCounts();
        this.notify();
      }
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, 'contacts');
      }
      // Firestore offline or connection unavailable - continue with local data
      console.warn('Firestore sync note: operating in offline mode or waiting for connection', err?.message);
    }
  }

  seedData(organizationId: string) {
    const seed = getInitialSeedData(organizationId);
    this.contacts = seed.contacts;
    this.groups = seed.groups;
    this.templates = seed.templates;
    this.campaigns = seed.campaigns;
    this.conversations = seed.conversations;
    this.messages = seed.messages;
    this.automationRules = seed.automationRules;
    this.auditLogs = [
      {
        id: `aud_${Date.now()}`,
        organizationId,
        userId: 'system',
        action: 'System Seed Initialized',
        entityType: 'System',
        entityId: organizationId,
        timestamp: new Date().toISOString(),
        metadata: { info: 'Demo contacts, templates and automations seeded' },
      },
    ];
    this.notify();
  }

  resetData(organizationId: string) {
    this.seedData(organizationId);
  }

  // ================= CONTACTS =================
  addContact(contactData: Omit<Contact, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>): Contact {
    const sanitized = sanitizeContactRecord(contactData);
    const norm = normalizePhoneNumber(sanitized.phone || '');
    const cleanPhone = norm.isValid ? norm.normalized : (sanitized.phone || '');

    const id = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newContact: Contact = {
      ...sanitized,
      id,
      phone: cleanPhone,
      organizationId: this.orgId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.contacts.unshift(newContact);
    this.updateGroupCounts();

    // Audit log
    this.logAudit('Contact Created', 'Contact', id, { phone: newContact.phone });

    const initialStatus = getContactConsentStatus(newContact);
    this.logConsentChange({
      contactId: id,
      previousStatus: 'None',
      newStatus: initialStatus,
      source: newContact.optInSource || newContact.optOutSource || (initialStatus === 'Marketing Consented' ? 'Direct Consent' : 'Contact Created'),
      changedByUserId: 'current_user',
      timestamp: newContact.optInDate || new Date().toISOString(),
      notes: newContact.consentNotes || '',
      phone: newContact.phone,
    });

    this.notify();
    this.persistDoc('contacts', id, newContact);
    return newContact;
  }

  updateContact(id: string, updates: Partial<Contact>): Contact | null {
    const idx = this.contacts.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    const existing = this.contacts[idx];
    const prevStatus = getContactConsentStatus(existing);
    const sanitizedUpdates = sanitizeContactRecord(updates);

    if (sanitizedUpdates.phone) {
      const norm = normalizePhoneNumber(sanitizedUpdates.phone);
      if (norm.isValid) {
        sanitizedUpdates.phone = norm.normalized;
      }
    }

    const updated: Contact = {
      ...existing,
      ...sanitizedUpdates,
      updatedAt: new Date().toISOString(),
    };

    // If opted out
    if (updated.optOut) {
      updated.marketingOptIn = false;
      updated.status = 'Opted Out';
      if (!updated.optOutDate) {
        updated.optOutDate = new Date().toISOString();
      }
    } else if (updated.marketingOptIn) {
      updated.status = 'Active';
    } else if (existing.status === 'Opted Out' && !updated.optOut) {
      updated.status = 'Active';
    }

    const nextStatus = getContactConsentStatus(updated);

    // Only log consent audit history if consent actually changed!
    // "Editing a contact's name, phone, email, company, groups or tags should not create a consent-history record unless consent actually changed."
    if (prevStatus !== nextStatus) {
      const source =
        sanitizedUpdates.optInSource ||
        sanitizedUpdates.optOutSource ||
        (nextStatus === 'Opted Out'
          ? 'Opt-Out Request'
          : nextStatus === 'Marketing Consented'
          ? 'Direct Consent'
          : 'Status Change');

      this.logConsentChange({
        contactId: id,
        previousStatus: prevStatus,
        newStatus: nextStatus,
        source,
        changedByUserId: 'current_user',
        timestamp: new Date().toISOString(),
        notes: sanitizedUpdates.consentNotes || '',
        phone: updated.phone,
      });

      if (nextStatus === 'Opted Out') {
        this.logAudit('Contact Opted Out', 'Contact', id);
      }
    }

    this.contacts[idx] = updated;
    this.updateGroupCounts();
    this.notify();
    this.persistDoc('contacts', id, updated);
    return updated;
  }

  deleteContact(id: string): boolean {
    const c = this.contacts.find((x) => x.id === id);
    if (!c) return false;
    this.contacts = this.contacts.filter((x) => x.id !== id);
    this.updateGroupCounts();
    this.logAudit('Contact Deleted', 'Contact', id, { phone: c.phone });
    this.notify();
    this.deleteFirestoreDoc('contacts', id);
    return true;
  }

  bulkAddToGroup(contactIds: string[], groupName: string) {
    contactIds.forEach((cid) => {
      const c = this.contacts.find((x) => x.id === cid);
      if (c && !c.groups.includes(groupName)) {
        c.groups.push(groupName);
        this.persistDoc('contacts', c.id, c);
      }
    });
    this.updateGroupCounts();
    this.notify();
  }

  bulkRemoveFromGroup(contactIds: string[], groupName: string) {
    contactIds.forEach((cid) => {
      const c = this.contacts.find((x) => x.id === cid);
      if (c) {
        c.groups = c.groups.filter((g) => g !== groupName);
        this.persistDoc('contacts', c.id, c);
      }
    });
    this.updateGroupCounts();
    this.notify();
  }

  importContacts(rows: Partial<Contact>[], defaultGroup?: string): { added: number; updated: number; skipped: number } {
    let added = 0;
    let updated = 0;
    let skipped = 0;

    rows.forEach((row) => {
      const sanitized = sanitizeContactRecord(row);
      if (!sanitized.phone) {
        skipped++;
        return;
      }
      const norm = normalizePhoneNumber(sanitized.phone);
      if (!norm.isValid) {
        skipped++;
        return;
      }
      const normalizedPhone = norm.normalized;
      const existing = this.contacts.find((c) => arePhoneNumbersEqual(c.phone, normalizedPhone));

      if (existing) {
        // Do not automatically overwrite existing contacts (classified as Duplicate)
        skipped++;
      } else {
        const id = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const isMarketing = sanitized.marketingOptIn === true;
        const isTransactional = isMarketing || sanitized.transactionalOptIn === true;
        const importTimestamp = sanitized.optInDate || new Date().toISOString();
        const newContact: Contact = {
          id,
          organizationId: this.orgId,
          firstName: sanitized.firstName || '',
          lastName: sanitized.lastName || '',
          phone: normalizedPhone,
          email: sanitized.email || '',
          company: sanitized.company || '',
          tags: sanitized.tags || ['CSV Import'],
          groups: defaultGroup ? [defaultGroup] : (sanitized.groups || []),
          whatsappOptIn: true,
          marketingOptIn: isMarketing,
          transactionalOptIn: isTransactional,
          optInDate: isMarketing ? importTimestamp : undefined,
          optInSource: isMarketing ? 'CSV Import' : undefined,
          optOut: false,
          status: 'Active',
          createdAt: importTimestamp,
          updatedAt: importTimestamp,
        };
        this.contacts.unshift(newContact);
        this.persistDoc('contacts', id, newContact);

        // Requirement: For CSV rows imported as Marketing Consented, create consent history with
        // source = CSV Import and timestamp = import timestamp.
        // Do not manufacture consent history for Not Consented contacts.
        if (isMarketing) {
          this.logConsentChange({
            contactId: id,
            previousStatus: 'None',
            newStatus: 'Marketing Consented',
            source: 'CSV Import',
            changedByUserId: 'current_user',
            timestamp: importTimestamp,
            phone: newContact.phone,
          });
        }

        added++;
      }
    });

    this.updateGroupCounts();
    this.logAudit('Contact Imported', 'Contact', 'bulk', { added, skipped });
    this.notify();
    return { added, updated, skipped };
  }

  // ================= GROUPS =================
  addGroup(name: string, description: string = ''): ContactGroup {
    const id = `grp_${Date.now()}`;
    const group: ContactGroup = {
      id,
      organizationId: this.orgId,
      name,
      description,
      memberCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.groups.push(group);
    this.logAudit('Group Created', 'ContactGroup', id, { name });
    this.notify();
    this.persistDoc('contact_groups', id, group);
    return group;
  }

  renameGroup(id: string, newName: string): boolean {
    const g = this.groups.find((x) => x.id === id);
    if (!g) return false;
    const oldName = g.name;
    g.name = newName;
    // update contacts with old group name
    this.contacts.forEach((c) => {
      const idx = c.groups.indexOf(oldName);
      if (idx !== -1) {
        c.groups[idx] = newName;
      }
    });
    this.notify();
    this.persistDoc('contact_groups', id, g);
    return true;
  }

  deleteGroup(id: string): boolean {
    const g = this.groups.find((x) => x.id === id);
    if (!g) return false;
    const name = g.name;
    this.groups = this.groups.filter((x) => x.id !== id);
    this.contacts.forEach((c) => {
      c.groups = c.groups.filter((grp) => grp !== name);
    });
    this.logAudit('Group Deleted', 'ContactGroup', id, { name });
    this.notify();
    this.deleteFirestoreDoc('contact_groups', id);
    return true;
  }

  private updateGroupCounts() {
    this.groups.forEach((g) => {
      g.memberCount = this.contacts.filter((c) => c.groups.includes(g.name)).length;
    });
  }

  // ================= TEMPLATES =================
  addTemplate(tplData: Omit<MessageTemplate, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>): MessageTemplate {
    const id = `tpl_${Date.now()}`;
    const newTpl: MessageTemplate = {
      ...tplData,
      id,
      organizationId: this.orgId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.templates.unshift(newTpl);
    this.logAudit('Template Created', 'MessageTemplate', id, { name: newTpl.name });
    this.notify();
    this.persistDoc('message_templates', id, newTpl);
    return newTpl;
  }

  getCampaignRecipients(campaignId: string): CampaignRecipient[] {
    return this.campaignRecipients.filter((r) => r.campaignId === campaignId);
  }

  // ================= CAMPAIGNS & BROADCASTS =================
  async createAndSendCampaign(data: {
    name: string;
    campaignType?: 'Marketing' | 'Utility';
    templateId: string;
    audienceType: 'groups' | 'contacts' | 'all';
    targetGroups: string[];
    targetContacts: string[];
    variableMapping: Record<string, string>;
    variableFallbacks?: Record<string, string>;
    targetContactIds?: string[];
    eligibleContactIds?: string[];
    excludedRecipients?: Array<{ contactId: string; name: string; phone: string; reason: string }>;
    isDemo?: boolean;
  }): Promise<{ campaign: Campaign; summary: any }> {
    const template = this.templates.find((t) => t.id === data.templateId);
    if (!template) {
      throw new Error('Selected template not found');
    }

    const campaignType: 'Marketing' | 'Utility' =
      data.campaignType || (template.category === 'Utility' ? 'Utility' : 'Marketing');

    // 1. Determine deduplicated audience contacts
    let scopedContacts: Contact[] = [];
    if (data.targetContactIds && data.targetContactIds.length > 0) {
      scopedContacts = this.contacts.filter((c) => data.targetContactIds!.includes(c.id));
    } else if (data.audienceType === 'all') {
      scopedContacts = [...this.contacts];
    } else if (data.audienceType === 'groups') {
      scopedContacts = this.contacts.filter((c) => c.groups.some((g) => data.targetGroups.includes(g)));
    } else {
      scopedContacts = this.contacts.filter((c) => data.targetContacts.includes(c.id));
    }

    // Deduplicate by ID and normalized phone
    const deduplicatedAudience: Contact[] = [];
    const seenContactIds = new Set<string>();
    const seenNormalizedPhones = new Set<string>();

    for (const c of scopedContacts) {
      if (seenContactIds.has(c.id)) continue;
      const norm = normalizePhoneNumber(c.phone);
      const phoneKey = norm.isValid ? norm.normalized : c.phone.replace(/\D/g, '');
      if (phoneKey && seenNormalizedPhones.has(phoneKey)) continue;

      seenContactIds.add(c.id);
      if (phoneKey) seenNormalizedPhones.add(phoneKey);
      deduplicatedAudience.push(c);
    }

    // 2. Eligibility determination
    let eligible: Contact[] = [];
    let excluded: Contact[] = [];

    if (data.eligibleContactIds && data.eligibleContactIds.length > 0) {
      const eligibleSet = new Set(data.eligibleContactIds);
      eligible = deduplicatedAudience.filter((c) => eligibleSet.has(c.id));
      excluded = deduplicatedAudience.filter((c) => !eligibleSet.has(c.id));
    } else {
      for (const c of deduplicatedAudience) {
        const phoneNorm = normalizePhoneNumber(c.phone);
        const hasValidPhone = phoneNorm.isValid;
        const isActive = c.status === 'Active';
        const notOptedOut = !c.optOut && c.status !== 'Opted Out';

        let isEligible = false;
        if (campaignType === 'Marketing') {
          isEligible = Boolean(c.marketingOptIn && notOptedOut && hasValidPhone && isActive);
        } else {
          isEligible = Boolean(c.transactionalOptIn && notOptedOut && hasValidPhone && isActive);
        }

        if (isEligible) {
          eligible.push(c);
        } else {
          excluded.push(c);
        }
      }
    }

    if (eligible.length === 0) {
      throw new Error(
        `No eligible recipients found for ${campaignType} campaign. All selected contacts either lack consent, opted out, or have invalid numbers.`
      );
    }

    const campaignId = `cmp_${Date.now()}`;
    const isDemoMode = data.isDemo !== false;

    const campaign: Campaign = {
      id: campaignId,
      organizationId: this.orgId,
      name: data.name,
      campaignType,
      templateId: template.id,
      templateName: template.name,
      templateCategory: template.category,
      templateBody: template.body,
      audienceType: data.audienceType,
      targetGroups: data.targetGroups,
      targetContacts: data.targetContacts,
      totalSelected: deduplicatedAudience.length,
      eligibleCount: eligible.length,
      excludedCount: excluded.length,
      sentCount: eligible.length,
      deliveredCount: eligible.length,
      readCount: Math.min(eligible.length, Math.round(eligible.length * 0.75)),
      failedCount: 0,
      status: 'Completed',
      variableMapping: data.variableMapping || {},
      variableFallbacks: data.variableFallbacks || {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      isDemo: isDemoMode,
    };

    // Helper to render template text with contact variables and fallbacks
    const renderContactBody = (contact: Contact) => {
      let body = template.body || '';
      const resolvedValues: Record<string, string> = {};

      for (const [varNum, fieldKey] of Object.entries(data.variableMapping || {})) {
        const contactVal = (contact as any)[fieldKey];
        const hasContactVal = contactVal !== undefined && contactVal !== null && String(contactVal).trim() !== '';
        const fallbackVal = data.variableFallbacks?.[varNum]?.trim() || '';
        const finalVal = hasContactVal ? String(contactVal).trim() : fallbackVal;

        resolvedValues[varNum] = finalVal;
        body = body.replace(new RegExp(`\\{\\{${varNum}\\}\\}`, 'g'), finalVal);
      }

      return { renderedBody: body, variableValues: resolvedValues };
    };

    const simulatedReadCount = campaign.readCount;

    eligible.forEach((c, idx) => {
      const { renderedBody, variableValues } = renderContactBody(c);
      const isRead = idx < simulatedReadCount;

      // 1. Create CampaignRecipient record
      const recipientRecord: CampaignRecipient = {
        id: `rcp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        campaignId,
        organizationId: this.orgId,
        contactId: c.id,
        phone: c.phone,
        normalizedPhone: normalizePhoneNumber(c.phone).normalized || c.phone,
        contactName: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.phone,
        templateId: template.id,
        templateName: template.name,
        templateBody: template.body,
        renderedBody,
        personalizedBody: renderedBody,
        variableValues,
        status: isRead ? 'read' : 'delivered',
        sentAt: new Date().toISOString(),
        deliveredAt: new Date(Date.now() + 1000).toISOString(),
        readAt: isRead ? new Date(Date.now() + 3000).toISOString() : undefined,
      };
      this.campaignRecipients.unshift(recipientRecord);

      // 2. Create or update Inbox conversation
      let conv = this.conversations.find(
        (cnv) => cnv.contactPhone === c.phone || arePhoneNumbersEqual(cnv.contactPhone, c.phone)
      );

      if (!conv) {
        conv = {
          id: `cnv_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          organizationId: this.orgId,
          contactId: c.id,
          contactPhone: c.phone,
          contactName: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.phone,
          lastMessage: renderedBody,
          lastMessageAt: new Date().toISOString(),
          lastOutgoingMessageAt: new Date().toISOString(),
          unreadCount: 0,
          status: 'Closed', // Broadcast dispatch does not prematurely mark conversation as Open
          createdAt: new Date().toISOString(),
        };
        this.conversations.unshift(conv);
      } else {
        conv.lastMessage = renderedBody;
        conv.lastMessageAt = new Date().toISOString();
        conv.lastOutgoingMessageAt = new Date().toISOString();
        // Preserve conv.status and unreadCount
      }

      // 3. Create message record with renderedBody
      const msg: Message = {
        id: `msg_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: conv.id,
        organizationId: this.orgId,
        contactId: c.id,
        direction: 'outgoing',
        senderType: 'broadcast',
        messageType: 'template',
        templateName: template.name,
        body: renderedBody, // Stored as personalized renderedBody
        status: isRead ? 'Read' : 'Delivered',
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      this.messages.push(msg);
    });

    this.campaigns.unshift(campaign);
    this.logAudit('Campaign Dispatched', 'Campaign', campaignId, {
      name: campaign.name,
      type: campaignType,
      template: template.name,
      eligible: eligible.length,
      excluded: excluded.length,
      mode: isDemoMode ? 'Demo Simulation' : 'Live WhatsApp API',
    });

    this.notify();
    this.persistDoc('campaigns', campaignId, campaign);
    return { campaign, summary: { eligible: eligible.length, excluded: excluded.length, total: deduplicatedAudience.length } };
  }

  // ================= CONVERSATIONS & INBOX =================
  async sendManualMessage(conversationId: string, text: string): Promise<Message> {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (!conv) throw new Error('Conversation not found');

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const msg: Message = {
      id: msgId,
      conversationId,
      organizationId: this.orgId,
      contactId: conv.contactId,
      direction: 'outgoing',
      senderType: 'agent',
      messageType: 'text',
      body: text,
      status: 'Sending',
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.messages.push(msg);
    conv.lastMessage = text;
    conv.lastMessageAt = new Date().toISOString();
    conv.lastOutgoingMessageAt = new Date().toISOString();
    this.notify();

    // Call server to send via WhatsApp Cloud API
    try {
      const response = await fetch('/api/whatsapp/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: conv.contactPhone,
          messageType: 'text',
          body: text,
        }),
      });
      const res = await response.json();
      if (res.success) {
        msg.status = 'Sent';
        msg.whatsappMessageId = res.messageId;
      } else {
        msg.status = 'Failed';
        msg.failureReason = res.error || 'Meta API error';
      }
    } catch (err: any) {
      msg.status = 'Delivered'; // mock deliver
    }

    this.notify();
    this.persistDoc('messages', msgId, msg);
    this.persistDoc('conversations', conv.id, conv);
    return msg;
  }

  toggleConversationStatus(conversationId: string): Conversation['status'] {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (!conv) return 'Open';
    conv.status = conv.status === 'Open' ? 'Closed' : 'Open';
    this.notify();
    this.persistDoc('conversations', conv.id, conv);
    return conv.status;
  }

  markConversationAsRead(conversationId: string) {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv && conv.unreadCount > 0) {
      conv.unreadCount = 0;
      this.notify();
      this.persistDoc('conversations', conv.id, conv);
    }
  }

  // Incoming message simulator handler
  async processSimulatedIncoming(senderPhone: string, text: string, org: Organization): Promise<any> {
    const cleanPhone = senderPhone.replace(/\s+/g, '');
    let contact = this.contacts.find((c) => c.phone.replace(/\s+/g, '') === cleanPhone);

    const isFirstMessage = !contact;

    // 1. Auto-create contact if not exists
    if (!contact) {
      contact = this.addContact({
        firstName: 'WhatsApp',
        lastName: 'Customer',
        phone: cleanPhone,
        email: '',
        company: '',
        tags: ['New Incoming'],
        groups: ['Prospects'],
        whatsappOptIn: true,
        marketingOptIn: true,
        transactionalOptIn: true,
        optInDate: new Date().toISOString(),
        optInSource: 'Inbound WhatsApp Message',
        optOut: false,
        status: 'Active',
      });
    }

    // 2. Find or create conversation
    let conv = this.conversations.find((c) => c.contactPhone.replace(/\s+/g, '') === cleanPhone);
    if (!conv) {
      conv = {
        id: `cnv_${Date.now()}`,
        organizationId: this.orgId,
        contactId: contact.id,
        contactPhone: contact.phone,
        contactName: `${contact.firstName} ${contact.lastName}`.trim() || contact.phone,
        lastMessage: text,
        lastMessageAt: new Date().toISOString(),
        lastIncomingMessageAt: new Date().toISOString(),
        unreadCount: 1,
        status: 'Open',
        createdAt: new Date().toISOString(),
      };
      this.conversations.unshift(conv);
    } else {
      conv.lastMessage = text;
      conv.lastMessageAt = new Date().toISOString();
      conv.lastIncomingMessageAt = new Date().toISOString();
      conv.unreadCount = (conv.unreadCount || 0) + 1;
      conv.status = 'Open';
    }

    // 3. Store incoming message
    const incomingMsg: Message = {
      id: `msg_in_${Date.now()}`,
      conversationId: conv.id,
      organizationId: this.orgId,
      contactId: contact.id,
      direction: 'incoming',
      senderType: 'customer',
      messageType: 'text',
      body: text,
      status: 'Read',
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.messages.push(incomingMsg);

    // 4. Call server simulator endpoint to evaluate opt-out & automations
    try {
      const response = await fetch('/api/webhook/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPhone: cleanPhone,
          text,
          rules: this.automationRules,
          isFirstMessage,
          businessHours: org.businessHours,
        }),
      });

      const simResult = await response.json();

      // If opt-out command
      if (simResult.consent?.isOptOutCommand) {
        this.updateContact(contact.id, {
          optOut: true,
          marketingOptIn: false,
          optOutDate: new Date().toISOString(),
          status: 'Opted Out',
        });
        this.logConsent(contact.id, cleanPhone, 'keyword_opt_out', `Customer sent ${text}`);
      } else if (simResult.consent?.isOptInCommand) {
        this.updateContact(contact.id, {
          optOut: false,
          marketingOptIn: true,
          status: 'Active',
        });
        this.logConsent(contact.id, cleanPhone, 'keyword_opt_in', `Customer sent ${text}`);
      }

      // If auto-reply triggered
      if (simResult.autoReply) {
        const autoMsg: Message = {
          id: `msg_auto_${Date.now()}`,
          conversationId: conv.id,
          organizationId: this.orgId,
          contactId: contact.id,
          direction: 'outgoing',
          senderType: 'automation',
          messageType: 'text',
          body: simResult.autoReply,
          status: 'Delivered',
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        this.messages.push(autoMsg);
        conv.lastMessage = simResult.autoReply;
        conv.lastMessageAt = new Date().toISOString();
        conv.lastOutgoingMessageAt = new Date().toISOString();

        // Increment rule trigger count
        if (simResult.matchedRuleName) {
          const r = this.automationRules.find((x) => x.name === simResult.matchedRuleName);
          if (r) {
            r.triggerCount = (r.triggerCount || 0) + 1;
            r.lastTriggeredAt = new Date().toISOString();
          }
        }
      }

      if (simResult.setStatus) {
        conv.status = simResult.setStatus;
      }

      this.notify();
      return simResult;
    } catch (err: any) {
      this.notify();
      return { error: err.message };
    }
  }

  // ================= AUTOMATIONS =================
  addAutomationRule(ruleData: Omit<AutomationRule, 'id' | 'organizationId' | 'createdAt'>): AutomationRule {
    const id = `rul_${Date.now()}`;
    const newRule: AutomationRule = {
      ...ruleData,
      id,
      organizationId: this.orgId,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.automationRules.push(newRule);
    this.logAudit('Automation Created', 'AutomationRule', id, { name: newRule.name });
    this.notify();
    this.persistDoc('automation_rules', id, newRule);
    return newRule;
  }

  updateAutomationRule(id: string, updates: Partial<AutomationRule>): AutomationRule | null {
    const r = this.automationRules.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, updates);
    this.logAudit('Automation Changed', 'AutomationRule', id, updates);
    this.notify();
    this.persistDoc('automation_rules', id, r);
    return r;
  }

  deleteAutomationRule(id: string): boolean {
    this.automationRules = this.automationRules.filter((x) => x.id !== id);
    this.logAudit('Automation Deleted', 'AutomationRule', id);
    this.notify();
    this.deleteFirestoreDoc('automation_rules', id);
    return true;
  }

  // ================= AUDIT & CONSENT =================
  logAudit(action: string, entityType: string, entityId: string, metadata?: Record<string, any>) {
    const log: AuditLog = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      organizationId: this.orgId,
      userId: 'current_user',
      action,
      entityType,
      entityId,
      timestamp: new Date().toISOString(),
      metadata,
    };
    this.auditLogs.unshift(log);
    this.persistDoc('audit_logs', log.id, log);
  }

  logConsentChange(params: {
    contactId: string;
    organizationId?: string;
    previousStatus: string;
    newStatus: string;
    source: string;
    changedByUserId?: string;
    timestamp?: string;
    notes?: string;
    phone?: string;
  }) {
    const hist: OptInHistoryEvent = {
      id: `opt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      organizationId: params.organizationId || this.orgId,
      contactId: params.contactId,
      phone: params.phone || '',
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      source: params.source,
      changedByUserId: params.changedByUserId || 'current_user',
      timestamp: params.timestamp || new Date().toISOString(),
      notes: params.notes || '',
      event:
        params.newStatus === 'Opted Out'
          ? 'opt_out'
          : params.newStatus === 'Marketing Consented'
          ? 'opt_in'
          : 'consent_logged',
    };
    this.optInHistory.unshift(hist);
    this.notify();
    this.persistDoc('opt_in_history', hist.id, hist);
  }

  logConsent(contactId: string, phone: string, event: any, source: string) {
    this.logConsentChange({
      contactId,
      phone,
      previousStatus: event === 'opt_out' ? 'Active' : 'None',
      newStatus: event === 'opt_out' ? 'Opted Out' : 'Marketing Consented',
      source,
      timestamp: new Date().toISOString(),
    });
  }

  private async persistDoc(collectionName: string, id: string, data: any) {
    if (!auth.currentUser) {
      return;
    }
    try {
      await setDoc(doc(db, collectionName, id), data, { merge: true });
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        handleFirestoreError(e, OperationType.WRITE, `${collectionName}/${id}`);
      }
      // Offline fallback
    }
  }

  private async deleteFirestoreDoc(collectionName: string, id: string) {
    if (!auth.currentUser) {
      return;
    }
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        handleFirestoreError(e, OperationType.DELETE, `${collectionName}/${id}`);
      }
      // Offline fallback
    }
  }
}

export const dataStore = new DataStore();
