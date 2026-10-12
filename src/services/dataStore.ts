import type { 
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
  Organization,
  Client,
  WhatsAppConnection
} from '../types/index.ts';
import { getInitialSeedData } from './seedService.ts';
import { 
  normalizePhoneNumber, 
  arePhoneNumbersEqual, 
  sanitizeContactRecord,
  getContactConsentStatus 
} from '../utils/phoneUtils.ts';
import { db, auth, handleFirestoreError, OperationType, onAuthStateChanged } from '../lib/firebase.ts';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  query, 
  where, 
  deleteDoc, 
  updateDoc,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';

class DataStore {
  private orgId: string = 'default_org';
  private initialized: boolean = false;
  private listeners: Set<() => void> = new Set();
  private clientEventCursors: Map<string, string> = new Map();
  private conversationsUnsub: Unsubscribe | null = null;
  private messagesUnsub: Unsubscribe | null = null;
  private eventSyncTimer: any = null;
  private processedEventIds: Set<string> = new Set();
  private isPolling: boolean = false;
  private focusListenerCleanup: (() => void) | null = null;
  activeConversationId: string | null = null;

  serverWhatsAppStatus: 'Not Configured' | 'Testing' | 'Connected' | 'Connection Error' = (() => {
    try {
      const cached = localStorage.getItem('whatsflow_server_whatsapp_status');
      if (cached === 'Connected' || cached === 'Not Configured' || cached === 'Connection Error' || cached === 'Testing') {
        return cached as any;
      }
    } catch {}
    return 'Not Configured';
  })();

  constructor() {
    this.checkServerWhatsAppStatus().catch(() => {});
    try {
      onAuthStateChanged(auth, (fbUser) => {
        if (fbUser && this.orgId && this.activeClientId) {
          this.subscribeClientFirestore(this.orgId, this.activeClientId);
        } else if (!fbUser) {
          this.unsubscribeClientFirestore();
        }
      });
    } catch {}
  }

  get isLiveWhatsAppConnected(): boolean {
    return this.serverWhatsAppStatus === 'Connected';
  }

  clients: Client[] = [];
  whatsappConnections: WhatsAppConnection[] = [];
  activeClientId: string = '';

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

  setActiveClient(clientId: string) {
    const client = this.clients.find((c) => c.id === clientId);
    if (!client || client.status !== 'Active') {
      console.warn(`Cannot set inactive or non-existent client: ${clientId}`);
      return;
    }
    this.activeClientId = clientId;
    try {
      localStorage.setItem(`watsmanager_${this.orgId}_active_client`, clientId);
    } catch {}

    // Switch Firestore subscriptions to the new Client
    this.subscribeClientFirestore(this.orgId, clientId);

    // Poll events for new client with client-specific cursor
    this.pollEvents();

    this.notify();
  }

  getActiveClient(): Client | null {
    return this.clients.find((c) => c.id === this.activeClientId) || null;
  }

  private requireActiveClientId(): string {
    const client = this.clients.find(
      (c) => c.id === this.activeClientId && c.status === 'Active'
    );

    if (!client) {
      throw new Error(
        'Please select an active Client before creating this record.'
      );
    }

    return client.id;
  }

  getDefaultWhatsAppClientId(): string {
    const defaultConn = this.whatsappConnections.find((c) => c.isDefault);
    if (defaultConn && defaultConn.clientId) {
      return defaultConn.clientId;
    }
    const defaultClient = this.clients.find((c) => c.code === 'DEFAULT');
    if (defaultClient) {
      return defaultClient.id;
    }
    const fallbackId = `client_default_${this.orgId}`;
    const fallbackClient = this.clients.find((c) => c.id === fallbackId);
    if (fallbackClient) {
      return fallbackClient.id;
    }
    return this.clients[0]?.id || fallbackId;
  }

  addClient(clientData: Omit<Client, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>): Client {
    const id = `client_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newClient: Client = {
      ...clientData,
      id,
      organizationId: this.orgId,
      code: (clientData.code || 'CLIENT').toUpperCase().trim(),
      status: clientData.status || 'Active',
      createdAt: now,
      updatedAt: now,
    };
    this.clients.push(newClient);
    this.logAudit('Client Created', 'Client', id, { name: newClient.name, code: newClient.code });
    this.notify();
    this.persistDoc('clients', id, newClient);
    return newClient;
  }

  updateClient(id: string, updates: Partial<Client>): Client | null {
    const client = this.clients.find((c) => c.id === id);
    if (!client) return null;
    Object.assign(client, updates, { updatedAt: new Date().toISOString() });
    this.logAudit('Client Updated', 'Client', id, updates);
    this.notify();
    this.persistDoc('clients', id, client);
    return client;
  }

  toggleClientStatus(id: string): Client | null {
    const client = this.clients.find((c) => c.id === id);
    if (!client) return null;
    client.status = client.status === 'Active' ? 'Inactive' : 'Active';
    client.updatedAt = new Date().toISOString();
    
    // If currently active client was deactivated, switch to first active client
    if (client.id === this.activeClientId && client.status === 'Inactive') {
      const firstActive = this.clients.find((c) => c.status === 'Active');
      if (firstActive) {
        this.activeClientId = firstActive.id;
        try {
          localStorage.setItem(`watsmanager_${this.orgId}_active_client`, firstActive.id);
        } catch {}
      }
    }
    this.logAudit('Client Status Changed', 'Client', id, { status: client.status });
    this.notify();
    this.persistDoc('clients', id, client);
    return client;
  }

  deleteClient(id: string): boolean {
    const client = this.clients.find((c) => c.id === id);
    if (!client) return false;

    // Rule: Do not allow deleting a Client that already owns contacts, campaigns, messages or conversations. Use Deactivate instead.
    const ownsContacts = this.contacts.some((c) => c.clientId === id);
    const ownsCampaigns = this.campaigns.some((c) => c.clientId === id);
    const ownsConversations = this.conversations.some((c) => c.clientId === id);
    const ownsMessages = this.messages.some((m) => m.clientId === id);

    if (ownsContacts || ownsCampaigns || ownsConversations || ownsMessages) {
      throw new Error('Cannot delete a Client with existing contacts, campaigns, messages, or conversations. Please deactivate the Client instead.');
    }

    this.clients = this.clients.filter((c) => c.id !== id);
    if (this.activeClientId === id) {
      const firstActive = this.clients.find((c) => c.status === 'Active');
      this.activeClientId = firstActive ? firstActive.id : '';
      try {
        if (this.activeClientId) {
          localStorage.setItem(`watsmanager_${this.orgId}_active_client`, this.activeClientId);
        }
      } catch {}
    }
    this.logAudit('Client Deleted', 'Client', id, { name: client.name });
    this.notify();
    this.deleteFirestoreDoc('clients', id);
    return true;
  }

  // Client-scoped data helper methods (Requirement 17)
  getClientContacts(clientId?: string): Contact[] {
    const targetId = clientId || this.activeClientId;
    return this.contacts.filter((c) => c.clientId === targetId);
  }

  getClientGroups(clientId?: string): ContactGroup[] {
    const targetId = clientId || this.activeClientId;
    return this.groups.filter((g) => g.clientId === targetId);
  }

  getClientTemplates(clientId?: string): MessageTemplate[] {
    const targetId = clientId || this.activeClientId;
    return this.templates.filter((t) => t.clientId === targetId);
  }

  getClientCampaigns(clientId?: string): Campaign[] {
    const targetId = clientId || this.activeClientId;
    return this.campaigns.filter((c) => c.clientId === targetId);
  }

  getClientCampaignRecipients(clientId?: string): CampaignRecipient[] {
    const targetId = clientId || this.activeClientId;
    return this.campaignRecipients.filter((r) => r.clientId === targetId);
  }

  getClientConversations(clientId?: string): Conversation[] {
    const targetId = clientId || this.activeClientId;
    return this.conversations.filter((c) => c.clientId === targetId);
  }

  getClientMessages(clientId?: string): Message[] {
    const targetId = clientId || this.activeClientId;
    return this.messages.filter((m) => m.clientId === targetId);
  }

  getClientAutomationRules(clientId?: string): AutomationRule[] {
    const targetId = clientId || this.activeClientId;
    return this.automationRules.filter((r) => r.clientId === targetId);
  }

  setActiveConversationId(id: string | null) {
    this.activeConversationId = id;
    if (id) {
      this.markConversationAsRead(id);
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.clients = [...this.clients];
    this.whatsappConnections = [...this.whatsappConnections];
    this.contacts = [...this.contacts];
    this.groups = [...this.groups];
    this.templates = [...this.templates];
    this.campaigns = [...this.campaigns];
    this.campaignRecipients = [...this.campaignRecipients];
    this.conversations = [...this.conversations];
    this.messages = [...this.messages];
    this.automationRules = [...this.automationRules];
    this.auditLogs = [...this.auditLogs];
    this.optInHistory = [...this.optInHistory];

    this.listeners.forEach((l) => l());
    this.saveLocal();
  }

  private getStorageKey(key: string) {
    return `whatsflow_${this.orgId}_${key}`;
  }

  private getApiUrl(endpoint: string): string {
    if (typeof window !== 'undefined') return endpoint;
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}${endpoint}`;
  }

  private saveLocal() {
    try {
      localStorage.setItem(this.getStorageKey('clients'), JSON.stringify(this.clients));
      localStorage.setItem(this.getStorageKey('whatsapp_connections'), JSON.stringify(this.whatsappConnections));
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
      this.clients = JSON.parse(localStorage.getItem(this.getStorageKey('clients')) || '[]');
      this.whatsappConnections = JSON.parse(localStorage.getItem(this.getStorageKey('whatsapp_connections')) || '[]');
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

  private migrateMissingClientIds(defaultClientId: string) {
    const patchRecords = <T extends { id: string; clientId?: string }>(
      records: T[],
      collectionName: string
    ) => {
      records.forEach((record) => {
        if (!record.clientId) {
          record.clientId = defaultClientId;
          this.persistDoc(collectionName, record.id, { clientId: defaultClientId });
        }
      });
    };

    patchRecords(this.contacts, 'contacts');
    patchRecords(this.groups, 'contact_groups');
    patchRecords(this.templates, 'message_templates');
    patchRecords(this.campaigns, 'campaigns');
    patchRecords(this.campaignRecipients, 'campaign_recipients');
    patchRecords(this.conversations, 'conversations');
    patchRecords(this.messages, 'messages');
    patchRecords(this.automationRules, 'automation_rules');
    patchRecords(this.auditLogs, 'audit_logs');
    patchRecords(this.optInHistory, 'opt_in_history');

    // Populate normalizedPhone for existing contacts & conversations where missing
    this.contacts.forEach((contact) => {
      if (!contact.normalizedPhone && contact.phone) {
        const norm = normalizePhoneNumber(contact.phone);
        contact.normalizedPhone = norm.isValid ? norm.normalized : (contact.phone.startsWith('+') ? contact.phone : `+${contact.phone.replace(/\D/g, '')}`);
        this.persistDoc('contacts', contact.id, { normalizedPhone: contact.normalizedPhone });
      }
    });

    this.conversations.forEach((conv) => {
      if (!conv.normalizedPhone && conv.contactPhone) {
        const norm = normalizePhoneNumber(conv.contactPhone);
        conv.normalizedPhone = norm.isValid ? norm.normalized : (conv.contactPhone.startsWith('+') ? conv.contactPhone : `+${conv.contactPhone.replace(/\D/g, '')}`);
        this.persistDoc('conversations', conv.id, { normalizedPhone: conv.normalizedPhone });
      }
    });

    // Purge any stale hard-coded placeholder strings from existing connections
    this.whatsappConnections.forEach((conn) => {
      let changed = false;
      if (conn.displayPhoneNumber === '+234 806 862 0081' || conn.displayPhoneNumber === '+2348068620081') {
        conn.displayPhoneNumber = undefined;
        changed = true;
      }
      if (conn.verifiedDisplayName === 'Official Cloud API') {
        conn.verifiedDisplayName = undefined;
        changed = true;
      }
      if (conn.wabaIdMasked === '••••••••3563') {
        conn.wabaIdMasked = undefined;
        changed = true;
      }
      if (conn.phoneNumberIdMasked === '••••••••3367') {
        conn.phoneNumberIdMasked = undefined;
        changed = true;
      }
      if (conn.apiVersion === 'v25.0') {
        conn.apiVersion = undefined;
        changed = true;
      }
      if (changed) {
        this.persistDoc('whatsapp_connections', conn.id, conn);
      }
    });
  }

  async initialize(organizationId: string) {
    this.orgId = organizationId;

    // Try loading local first for instant rendering
    const hasLocal = this.loadLocal();

    if (!hasLocal || this.contacts.length === 0) {
      // Seed default rich data
      this.seedData(organizationId);
    }

    // Ensure Client layer and Default Client exist (Requirement 4 & 5)
    const defaultClientId = `client_default_${organizationId}`;
    let defaultClient = this.clients.find((c) => c.code === 'DEFAULT' || c.id === defaultClientId);
    if (!defaultClient) {
      defaultClient = {
        id: defaultClientId,
        organizationId,
        name: 'Default Client',
        code: 'DEFAULT',
        status: 'Active',
        description: 'Primary business client workspace',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.clients.unshift(defaultClient);
      this.persistDoc('clients', defaultClient.id, defaultClient);
    }

    const effectiveDefaultClientId = defaultClient.id;

    // Safe, idempotent migration: assign Default Client ID to every existing record without a clientId
    this.migrateMissingClientIds(effectiveDefaultClientId);

    // Default WhatsApp connection metadata (non-sensitive only, no hardcoded recipient or phone numbers)
    if (this.whatsappConnections.length === 0) {
      const isConnected = this.serverWhatsAppStatus === 'Connected';
      const defaultConn: WhatsAppConnection = {
        id: `conn_default_${organizationId}`,
        organizationId,
        clientId: effectiveDefaultClientId,
        label: 'Production WhatsApp Cloud API',
        connectionStatus: isConnected ? 'Connected' : 'Not Configured',
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.whatsappConnections.push(defaultConn);
      this.persistDoc('whatsapp_connections', defaultConn.id, defaultConn);
    }

    // Set activeClientId (Requirement 5)
    // Persist the selected Client in localStorage per organization: watsmanager_<organizationId>_active_client
    const storedClient = localStorage.getItem(`watsmanager_${organizationId}_active_client`);
    const activeClientExists = this.clients.find((c) => c.id === storedClient && c.status === 'Active');

    if (activeClientExists) {
      this.activeClientId = activeClientExists.id;
    } else {
      const firstActive = this.clients.find((c) => c.status === 'Active') || defaultClient;
      this.activeClientId = firstActive ? firstActive.id : effectiveDefaultClientId;
      try {
        localStorage.setItem(`watsmanager_${organizationId}_active_client`, this.activeClientId);
      } catch {}
    }

    // Ensure official Meta hello_world template is available and scoped to Default Client
    const hwIdx = this.templates.findIndex((t) => t.clientId === effectiveDefaultClientId && t.name === 'hello_world');
    if (hwIdx >= 0) {
      this.templates[hwIdx].isLiveMeta = true;
      this.templates[hwIdx].isDemo = false;
      this.templates[hwIdx].status = 'Approved';
      if (!this.templates[hwIdx].clientId) {
        this.templates[hwIdx].clientId = effectiveDefaultClientId;
      }
    } else {
      this.templates.unshift({
        id: `tpl_hello_world_${organizationId}`,
        organizationId,
        clientId: effectiveDefaultClientId,
        name: 'hello_world',
        language: 'en_US',
        category: 'Utility',
        status: 'Approved',
        header: 'Official Meta Template',
        body: 'Hello World',
        variables: [],
        whatsappTemplateId: 'meta_hello_world',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDemo: false,
        isLiveMeta: true,
      });
    }

    // Ensure verified test recipient +2348068620081 is present only under Default Client (Requirement 7)
    let testContact = this.contacts.find((c) => c.clientId === effectiveDefaultClientId && arePhoneNumbersEqual(c.phone, '+2348068620081'));
    if (!testContact) {
      testContact = {
        id: `cnt_verified_test_${organizationId}`,
        organizationId,
        clientId: effectiveDefaultClientId,
        firstName: 'Verified Test',
        lastName: 'Recipient',
        phone: '+2348068620081',
        email: 'verified.test@watsmanager.io',
        company: 'Meta Test Number',
        tags: ['Verified Test', 'Meta Sandbox'],
        groups: ['Customers', 'VIP'],
        whatsappOptIn: true,
        marketingOptIn: true,
        transactionalOptIn: true,
        optInDate: new Date().toISOString(),
        optInSource: 'Meta Developer Dashboard',
        optOut: false,
        status: 'Active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDemo: false,
      };
      this.contacts.unshift(testContact);
    } else if (!testContact.clientId) {
      testContact.clientId = effectiveDefaultClientId;
    }

    // Ensure test conversation is scoped to Default Client (Requirement 7)
    let testConv = this.conversations.find((c) => c.clientId === effectiveDefaultClientId && arePhoneNumbersEqual(c.contactPhone, '+2348068620081'));
    if (!testConv) {
      const past25Hours = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
      testConv = {
        id: `cnv_verified_test_${organizationId}`,
        organizationId,
        clientId: effectiveDefaultClientId,
        contactId: testContact.id,
        contactPhone: '+2348068620081',
        contactName: 'Verified Test Recipient',
        lastMessage: 'Ready for Meta Live Test',
        lastMessageAt: past25Hours,
        lastIncomingMessageAt: past25Hours,
        unreadCount: 0,
        status: 'Open',
        createdAt: past25Hours,
        isDemo: false,
      };
      this.conversations.unshift(testConv);
    } else if (!testConv.clientId) {
      testConv.clientId = effectiveDefaultClientId;
    }
    this.saveLocal();

    this.initialized = true;
    this.notify();

    // Start client Firestore inbox real-time listeners for active client
    if (this.activeClientId) {
      this.subscribeClientFirestore(organizationId, this.activeClientId);
    }

    // Start background webhook event polling and rules synchronization
    this.startEventPolling();
    this.syncAutomationRulesToServer();
    this.checkServerWhatsAppStatus().then(() => {
      // Once organization is known, default client exists, and server WhatsApp is connected, register default route idempotently
      if (this.serverWhatsAppStatus === 'Connected') {
        fetch(this.getApiUrl('/api/whatsapp/register-default-route'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            clientId: effectiveDefaultClientId,
          }),
        }).catch((err) => {
          console.warn('[DataStore] Default route registration note:', err?.message || err);
        });
      }
    });

    // Async sync with Firestore in background if online
    this.syncFromFirestore().catch(() => {});
  }

  async checkServerWhatsAppStatus(): Promise<string> {
    try {
      const res = await fetch(this.getApiUrl('/api/whatsapp/status'));
      if (res.ok) {
        const data = await res.json();
        const isConnected =
          data.status === 'Connected' ||
          data.connected === true ||
          (data.configured === true && data.status !== 'Connection Error');
        this.serverWhatsAppStatus = isConnected ? 'Connected' : (data.status || 'Not Configured');
        try {
          localStorage.setItem('whatsflow_server_whatsapp_status', this.serverWhatsAppStatus);
        } catch {}

        // For the current Default WhatsApp Client only, synchronize connection metadata from authoritative server status
        const defaultClientId = this.getDefaultWhatsAppClientId();
        const defaultConn = this.whatsappConnections.find((c) => c.clientId === defaultClientId && c.isDefault);
        if (defaultConn) {
          defaultConn.connectionStatus = isConnected ? 'Connected' : 'Not Configured';
          if (data.apiVersion) defaultConn.apiVersion = data.apiVersion;
          if (data.phoneNumberId) defaultConn.phoneNumberIdMasked = data.phoneNumberId;
          if (data.wabaId) defaultConn.wabaIdMasked = data.wabaId;
          if (data.displayPhoneNumber) defaultConn.displayPhoneNumber = data.displayPhoneNumber;
          if (data.verifiedDisplayName) defaultConn.verifiedDisplayName = data.verifiedDisplayName;
          defaultConn.updatedAt = new Date().toISOString();
          this.persistDoc('whatsapp_connections', defaultConn.id, defaultConn);
        }

        // Idempotently ensure default route registration when connected
        if (isConnected && this.orgId) {
          fetch(this.getApiUrl('/api/whatsapp/register-default-route'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organizationId: this.orgId,
              clientId: defaultClientId,
            }),
          }).catch(() => {});
        }

        this.notify();
        return this.serverWhatsAppStatus;
      }
    } catch {}
    return this.serverWhatsAppStatus;
  }

  startEventPolling() {
    if (this.eventSyncTimer) return;
    this.pollEvents();
    this.eventSyncTimer = setInterval(() => {
      this.pollEvents();
    }, 2500);

    if (typeof window !== 'undefined') {
      const handleFocus = () => {
        this.pollEvents();
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          this.pollEvents();
        }
      };

      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      this.focusListenerCleanup = () => {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }

  stopEventPolling() {
    if (this.eventSyncTimer) {
      clearInterval(this.eventSyncTimer);
      this.eventSyncTimer = null;
    }
    if (this.focusListenerCleanup) {
      this.focusListenerCleanup();
      this.focusListenerCleanup = null;
    }
    this.unsubscribeClientFirestore();
  }

  unsubscribeClientFirestore() {
    if (this.conversationsUnsub) {
      try { this.conversationsUnsub(); } catch {}
      this.conversationsUnsub = null;
    }
    if (this.messagesUnsub) {
      try { this.messagesUnsub(); } catch {}
      this.messagesUnsub = null;
    }
  }

  subscribeClientFirestore(orgId: string, clientId: string) {
    this.unsubscribeClientFirestore();
    if (!orgId || !clientId) return;
    if (!auth.currentUser) {
      return;
    }

    try {
      // 1. Conversations real-time listener for current org and active client
      const convQuery = query(
        collection(db, 'conversations'),
        where('organizationId', '==', orgId),
        where('clientId', '==', clientId)
      );

      this.conversationsUnsub = onSnapshot(convQuery, (snapshot) => {
        let changed = false;
        snapshot.docChanges().forEach((change) => {
          const docData = change.doc.data() as Conversation;
          const idx = this.conversations.findIndex((c) => c.id === change.doc.id);

          if (change.type === 'added') {
            if (idx === -1) {
              this.conversations.unshift(docData);
              changed = true;
            } else {
              this.conversations[idx] = { ...this.conversations[idx], ...docData };
              changed = true;
            }
          } else if (change.type === 'modified') {
            if (idx !== -1) {
              this.conversations[idx] = { ...this.conversations[idx], ...docData };
              changed = true;
            } else {
              this.conversations.unshift(docData);
              changed = true;
            }
          } else if (change.type === 'removed') {
            if (idx !== -1) {
              this.conversations.splice(idx, 1);
              changed = true;
            }
          }
        });

        if (changed) {
          this.notify();
        }
      }, (err) => {
        if (auth.currentUser && err?.code !== 'permission-denied') {
          console.warn('[DataStore] Conversations snapshot listener notice:', err?.message || err);
        }
      });

      // 2. Messages real-time listener for current org and active client
      const msgQuery = query(
        collection(db, 'messages'),
        where('organizationId', '==', orgId),
        where('clientId', '==', clientId)
      );

      this.messagesUnsub = onSnapshot(msgQuery, (snapshot) => {
        let changed = false;
        snapshot.docChanges().forEach((change) => {
          const docData = change.doc.data() as Message;
          const idx = this.messages.findIndex((m) => m.id === change.doc.id);

          if (change.type === 'added') {
            if (idx === -1) {
              this.messages.push(docData);
              changed = true;
            } else {
              this.messages[idx] = { ...this.messages[idx], ...docData };
              changed = true;
            }
          } else if (change.type === 'modified') {
            if (idx !== -1) {
              this.messages[idx] = { ...this.messages[idx], ...docData };
              changed = true;
            } else {
              this.messages.push(docData);
              changed = true;
            }
          } else if (change.type === 'removed') {
            if (idx !== -1) {
              this.messages.splice(idx, 1);
              changed = true;
            }
          }
        });

        if (changed) {
          this.notify();
        }
      }, (err) => {
        if (auth.currentUser && err?.code !== 'permission-denied') {
          console.warn('[DataStore] Messages snapshot listener notice:', err?.message || err);
        }
      });
    } catch (err: any) {
      if (auth.currentUser && err?.code !== 'permission-denied') {
        console.warn('[DataStore] Error setting up client Firestore listeners:', err?.message || err);
      }
    }
  }

  public async pollEvents() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const activeClient = this.activeClientId;
      const lastCursor = activeClient ? (this.clientEventCursors.get(activeClient) || '') : '';
      const params = new URLSearchParams();
      if (lastCursor) params.append('since', lastCursor);
      if (activeClient) params.append('clientId', activeClient);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(this.getApiUrl(`/api/whatsapp/events${queryString}`));
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.events) || data.events.length === 0) return;

      let changed = false;

      for (const event of data.events) {
        if (event.id && this.processedEventIds.has(event.id)) {
          continue;
        }
        if (event.id) {
          this.processedEventIds.add(event.id);
        }

        const eventTime = event.receivedAt || event.timestamp || event.eventTimestamp;
        if (activeClient && eventTime) {
          const currentClientCursor = this.clientEventCursors.get(activeClient) || '';
          if (!currentClientCursor || eventTime > currentClientCursor) {
            this.clientEventCursors.set(activeClient, eventTime);
          }
        }

        if (event.type === 'status_update') {
          const wamid = event.payload?.wamid || event.wamid;
          const status = event.payload?.status || event.status;
          const failureReason = event.payload?.failureReason || event.failureReason;
          const eventTimestamp = event.payload?.eventTimestamp || event.eventTimestamp || eventTime;

          // 1. Update matching message in local store for fast UI response
          // Notice: Local update only. Server webhook is authoritative writer.
          const msg = this.messages.find((m) => m.whatsappMessageId === wamid);
          if (msg) {
            const statusRank: Record<string, number> = {
              submitted: 1,
              Sending: 2,
              Sent: 3,
              Delivered: 4,
              Read: 5,
              Failed: 6,
            };

            const mappedStatus: Message['status'] =
              status === 'read' ? 'Read' : status === 'delivered' ? 'Delivered' : status === 'failed' ? 'Failed' : 'Sent';

            const currentRank = statusRank[msg.status] || 0;
            const newRank = statusRank[mappedStatus] || 0;

            if (mappedStatus === 'Failed' || newRank >= currentRank) {
              msg.status = mappedStatus;
              if (failureReason) msg.failureReason = failureReason;
              changed = true;
            }
          }

          // 2. Update matching campaign recipient in local store
          const rcp = this.campaignRecipients.find((r) => r.whatsappMessageId === wamid);
          if (rcp) {
            if (rcp.status !== 'read' || status === 'read') {
              rcp.status = status;
              if (status === 'delivered') rcp.deliveredAt = eventTimestamp;
              if (status === 'read') rcp.readAt = eventTimestamp;
              if (status === 'failed') {
                rcp.failedAt = eventTimestamp;
                rcp.failureReason = failureReason;
              }
              changed = true;

              // Recompute campaign aggregates locally
              const cmp = this.campaigns.find((c) => c.id === rcp.campaignId);
              if (cmp) {
                const recs = this.campaignRecipients.filter((r) => r.campaignId === cmp.id);
                cmp.deliveredCount = recs.filter((r) => r.status === 'delivered' || r.status === 'read').length;
                cmp.readCount = recs.filter((r) => r.status === 'read').length;
                cmp.failedCount = recs.filter((r) => r.status === 'failed').length;
              }
            }
          }
        } else if (event.type === 'incoming_message') {
          const wamid = event.payload?.wamid || event.wamid;
          const fromPhone = event.payload?.fromPhone || event.fromPhone;
          const text = event.payload?.text || event.text;
          const profileName = event.payload?.profileName || event.profileName;
          const timestamp = event.payload?.timestamp || event.timestamp || eventTime;
          const consentEvaluation = event.payload?.consentEvaluation;
          const autoReplySent = event.payload?.autoReplySent;

          if (this.messages.some((m) => m.whatsappMessageId === wamid)) {
            continue;
          }

          const inboundClientId = event.clientId || this.getDefaultWhatsAppClientId();

          let contact = this.contacts.find((c) => c.clientId === inboundClientId && arePhoneNumbersEqual(c.phone, fromPhone));
          if (!contact) {
            contact = this.addContact({
              clientId: inboundClientId,
              firstName: profileName || 'WhatsApp',
              lastName: profileName ? '' : 'Contact',
              phone: fromPhone,
              email: '',
              company: '',
              tags: ['Live Inbound'],
              groups: [],
              whatsappOptIn: false,
              marketingOptIn: false,
              transactionalOptIn: false,
              optOut: false,
              status: 'Active',
            });
          }

          let conv = this.conversations.find((c) => c.clientId === inboundClientId && arePhoneNumbersEqual(c.contactPhone, fromPhone));
          const isCurrentlyActive = Boolean(conv && this.activeConversationId === conv.id);

          if (!conv) {
            conv = {
              id: `cnv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              organizationId: this.orgId,
              clientId: inboundClientId,
              contactId: contact.id,
              contactPhone: fromPhone,
              contactName: `${contact.firstName} ${contact.lastName}`.trim() || fromPhone,
              lastMessage: text,
              lastMessageAt: timestamp,
              lastIncomingMessageAt: timestamp,
              unreadCount: 1,
              status: 'Open',
              createdAt: timestamp,
            };
            this.conversations.unshift(conv);
            this.logAudit('Inbound Conversation Created', 'Conversation', conv.id, { contactPhone: fromPhone }, inboundClientId);
          } else {
            conv.lastMessage = text;
            conv.lastMessageAt = timestamp;
            conv.lastIncomingMessageAt = timestamp;
            if (isCurrentlyActive) {
              conv.unreadCount = 0;
            } else {
              conv.unreadCount = (conv.unreadCount || 0) + 1;
            }
            conv.status = 'Open';
          }

          const inMsg: Message = {
            id: `msg_wamid_${wamid.replace(/[^a-zA-Z0-9]/g, '_')}`,
            conversationId: conv.id,
            organizationId: this.orgId,
            clientId: inboundClientId,
            contactId: contact.id,
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
          this.messages.push(inMsg);
          this.logAudit('Inbound Message Received', 'Message', inMsg.id, { from: fromPhone, wamid }, inboundClientId);
          changed = true;

          if (consentEvaluation?.isOptOutCommand) {
            this.updateContact(contact.id, {
              optOut: true,
              status: 'Opted Out',
              optOutDate: timestamp,
              optOutSource: 'WhatsApp Inbound STOP Command',
            });
          }

          if (autoReplySent) {
            const outMsg: Message = {
              id: `msg_auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              conversationId: conv.id,
              organizationId: this.orgId,
              clientId: inboundClientId,
              contactId: contact.id,
              direction: 'outgoing',
              senderType: 'automation',
              messageType: 'text',
              body: autoReplySent,
              status: 'Sent',
              timestamp: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              isDemo: false,
            };
            this.messages.push(outMsg);
            this.logAudit('Inbound Auto-Reply Sent', 'Message', outMsg.id, { to: fromPhone }, inboundClientId);
            conv.lastMessage = autoReplySent;
            conv.lastMessageAt = outMsg.timestamp;
            conv.lastOutgoingMessageAt = outMsg.timestamp;
          }
        }
      }

      if (changed) {
        this.notify();
      }
    } catch {
      // Background poll silently catches transient fetch errors
    } finally {
      this.isPolling = false;
    }
  }

  async syncAutomationRulesToServer() {
    try {
      const defaultClientId = this.getDefaultWhatsAppClientId();
      const rulesToSync = this.automationRules.filter((r) => r.clientId === defaultClientId);
      await fetch('/api/whatsapp/sync-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: rulesToSync,
          organizationId: this.orgId,
          clientId: defaultClientId,
        }),
      });
    } catch {}
  }

  async syncTemplatesFromMeta(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const res = await fetch('/api/whatsapp/sync-templates');
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, count: 0, error: data.error || 'Failed to fetch templates from Meta' };
      }

      const metaTemplates: MessageTemplate[] = data.templates || [];
      if (metaTemplates.length === 0) {
        return { success: true, count: 0 };
      }

      const defaultWhatsAppClientId = this.getDefaultWhatsAppClientId();

      for (const tpl of metaTemplates) {
        // Scoped matching logic: only match existing templates belonging to defaultWhatsAppClientId
        const existingIdx = this.templates.findIndex(
          (t) =>
            t.clientId === defaultWhatsAppClientId &&
            (t.whatsappTemplateId === tpl.whatsappTemplateId || t.name === tpl.name)
        );
        const metaTpl: MessageTemplate = {
          ...tpl,
          clientId: defaultWhatsAppClientId,
          organizationId: this.orgId,
          isLiveMeta: true,
          isDemo: false,
        };
        if (existingIdx >= 0) {
          this.templates[existingIdx] = { ...this.templates[existingIdx], ...metaTpl };
          this.persistDoc('message_templates', this.templates[existingIdx].id, this.templates[existingIdx]);
        } else {
          this.templates.unshift(metaTpl);
          this.persistDoc('message_templates', metaTpl.id, metaTpl);
        }
      }

      this.notify();
      return { success: true, count: metaTemplates.length };
    } catch (err: any) {
      return { success: false, count: 0, error: err?.message || 'Network error syncing templates' };
    }
  }

  private async syncFromFirestore() {
    // Only query Firestore if an authenticated user session is active
    if (!auth.currentUser) {
      return;
    }

    try {
      interface CollectionResult<T> {
        success: boolean;
        data: T[];
      }

      const loadCollection = async <T>(collectionName: string): Promise<CollectionResult<T>> => {
        try {
          const q = query(collection(db, collectionName), where('organizationId', '==', this.orgId));
          const snap = await getDocs(q);
          const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
          return { success: true, data };
        } catch (err: any) {
          if (err?.code === 'permission-denied') {
            handleFirestoreError(err, OperationType.LIST, collectionName);
          }
          return { success: false, data: [] };
        }
      };

      const [
        clientsRes,
        connsRes,
        contactsRes,
        groupsRes,
        templatesRes,
        campaignsRes,
        recipientsRes,
        conversationsRes,
        messagesRes,
        rulesRes,
        optInRes,
        auditLogsRes,
      ] = await Promise.all([
        loadCollection<Client>('clients'),
        loadCollection<WhatsAppConnection>('whatsapp_connections'),
        loadCollection<Contact>('contacts'),
        loadCollection<ContactGroup>('contact_groups'),
        loadCollection<MessageTemplate>('message_templates'),
        loadCollection<Campaign>('campaigns'),
        loadCollection<CampaignRecipient>('campaign_recipients'),
        loadCollection<Conversation>('conversations'),
        loadCollection<Message>('messages'),
        loadCollection<AutomationRule>('automation_rules'),
        loadCollection<OptInHistoryEvent>('opt_in_history'),
        loadCollection<AuditLog>('audit_logs'),
      ]);

      let changed = false;

      // Successful queries replace local cache (even when empty). Failed queries retain cached data.
      if (clientsRes.success) {
        this.clients = clientsRes.data;
        changed = true;
      }
      if (connsRes.success) {
        this.whatsappConnections = connsRes.data;
        changed = true;
      }
      if (contactsRes.success) {
        this.contacts = contactsRes.data.map((c) => sanitizeContactRecord(c) as Contact);
        changed = true;
      }
      if (groupsRes.success) {
        this.groups = groupsRes.data;
        changed = true;
      }
      if (templatesRes.success) {
        this.templates = templatesRes.data;
        changed = true;
      }
      if (campaignsRes.success) {
        this.campaigns = campaignsRes.data;
        changed = true;
      }
      if (recipientsRes.success) {
        this.campaignRecipients = recipientsRes.data;
        changed = true;
      }
      if (conversationsRes.success) {
        this.conversations = conversationsRes.data;
        changed = true;
      }
      if (messagesRes.success) {
        this.messages = messagesRes.data;
        changed = true;
      }
      if (rulesRes.success) {
        this.automationRules = rulesRes.data;
        changed = true;
      }
      if (optInRes.success) {
        this.optInHistory = optInRes.data;
        changed = true;
      }
      if (auditLogsRes.success) {
        this.auditLogs = auditLogsRes.data;
        changed = true;
      }

      // Ensure Default Client exists (preserve bootstrap default client)
      const defaultClientId = `client_default_${this.orgId}`;
      let defaultClient = this.clients.find((c) => c.code === 'DEFAULT' || c.id === defaultClientId);
      if (!defaultClient) {
        defaultClient = {
          id: defaultClientId,
          organizationId: this.orgId,
          name: 'Default Client',
          code: 'DEFAULT',
          status: 'Active',
          description: 'Primary business client workspace',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.clients.unshift(defaultClient);
        this.persistDoc('clients', defaultClient.id, defaultClient);
        changed = true;
      }

      const effectiveDefaultClientId = defaultClient.id;

      // Ensure Default WhatsApp connection exists for Default Client
      if (this.whatsappConnections.length === 0) {
        const isConnected = this.serverWhatsAppStatus === 'Connected';
        const defaultConn: WhatsAppConnection = {
          id: `conn_default_${this.orgId}`,
          organizationId: this.orgId,
          clientId: effectiveDefaultClientId,
          label: 'Production WhatsApp Cloud API',
          connectionStatus: isConnected ? 'Connected' : 'Not Configured',
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.whatsappConnections.push(defaultConn);
        this.persistDoc('whatsapp_connections', defaultConn.id, defaultConn);
        changed = true;
      }

      // Run migration after Firestore hydration
      this.migrateMissingClientIds(effectiveDefaultClientId);

      // Validate or update activeClientId
      if (!this.clients.some((c) => c.id === this.activeClientId && c.status === 'Active')) {
        const firstActive = this.clients.find((c) => c.status === 'Active') || defaultClient;
        this.activeClientId = firstActive.id;
        try {
          localStorage.setItem(`watsmanager_${this.orgId}_active_client`, this.activeClientId);
        } catch {}
      }

      this.updateGroupCounts();

      if (changed) {
        this.notify();
      }
    } catch (err: any) {
      // Firestore offline or connection unavailable - continue with local data
      console.warn('Firestore sync note: operating in offline mode or waiting for connection', err?.message);
    }
  }

  seedData(organizationId: string) {
    const defaultClientId = `client_default_${organizationId}`;
    const seed = getInitialSeedData(organizationId, defaultClientId);
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
        clientId: defaultClientId,
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
  addContact(contactData: Omit<Contact, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'clientId'> & { clientId?: string }): Contact {
    const sanitized = sanitizeContactRecord(contactData);
    const norm = normalizePhoneNumber(sanitized.phone || '');
    const cleanPhone = norm.isValid ? norm.normalized : (sanitized.phone || '');

    const clientId = sanitized.clientId || this.requireActiveClientId();
    const id = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const normalizedPhone = norm.isValid ? norm.normalized : (cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone.replace(/\D/g, '')}`);
    const newContact: Contact = {
      ...sanitized,
      id,
      phone: cleanPhone,
      normalizedPhone,
      organizationId: this.orgId,
      clientId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.contacts.unshift(newContact);
    this.updateGroupCounts();

    // Audit log
    this.logAudit('Contact Created', 'Contact', id, { phone: newContact.phone }, newContact.clientId);

    const initialStatus = getContactConsentStatus(newContact);
    this.logConsentChange({
      contactId: id,
      clientId: newContact.clientId,
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
        clientId: updated.clientId,
        previousStatus: prevStatus,
        newStatus: nextStatus,
        source,
        changedByUserId: 'current_user',
        timestamp: new Date().toISOString(),
        notes: sanitizedUpdates.consentNotes || '',
        phone: updated.phone,
      });

      if (nextStatus === 'Opted Out') {
        this.logAudit('Contact Opted Out', 'Contact', id, undefined, updated.clientId);
      }
    } else {
      this.logAudit('Contact Updated', 'Contact', id, { fields: Object.keys(sanitizedUpdates) }, updated.clientId);
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
    this.logAudit('Contact Deleted', 'Contact', id, { phone: c.phone }, c.clientId);
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
    const activeClientId = this.requireActiveClientId();
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
      const existing = this.contacts.find((c) => c.clientId === activeClientId && arePhoneNumbersEqual(c.phone, normalizedPhone));

      if (existing) {
        // Do not automatically overwrite existing contacts (classified as Duplicate within same Client)
        skipped++;
      } else {
        const id = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const isMarketing = sanitized.marketingOptIn === true;
        const isTransactional = isMarketing || sanitized.transactionalOptIn === true;
        const importTimestamp = sanitized.optInDate || new Date().toISOString();
        const newContact: Contact = {
          id,
          organizationId: this.orgId,
          clientId: activeClientId,
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

        if (isMarketing) {
          this.logConsentChange({
            contactId: id,
            clientId: activeClientId,
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
    this.logAudit('Contact Imported', 'Contact', 'bulk', { added, skipped }, activeClientId);
    this.notify();
    return { added, updated, skipped };
  }

  // ================= GROUPS =================
  addGroup(name: string, description: string = ''): ContactGroup {
    const clientId = this.requireActiveClientId();
    const id = `grp_${Date.now()}`;
    const group: ContactGroup = {
      id,
      organizationId: this.orgId,
      clientId,
      name,
      description,
      memberCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.groups.push(group);
    this.logAudit('Group Created', 'ContactGroup', id, { name }, group.clientId);
    this.notify();
    this.persistDoc('contact_groups', id, group);
    return group;
  }

  renameGroup(id: string, newName: string): boolean {
    const g = this.groups.find((x) => x.id === id);
    if (!g) return false;
    const oldName = g.name;
    g.name = newName;
    // update contacts with old group name only for this group's client
    this.contacts.forEach((c) => {
      if (c.clientId === g.clientId) {
        const idx = c.groups.indexOf(oldName);
        if (idx !== -1) {
          c.groups[idx] = newName;
          this.persistDoc('contacts', c.id, c);
        }
      }
    });
    this.logAudit('Group Renamed', 'ContactGroup', id, { oldName, newName }, g.clientId);
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
      if (c.clientId === g.clientId && c.groups.includes(name)) {
        c.groups = c.groups.filter((grp) => grp !== name);
        this.persistDoc('contacts', c.id, c);
      }
    });
    this.logAudit('Group Deleted', 'ContactGroup', id, { name }, g.clientId);
    this.notify();
    this.deleteFirestoreDoc('contact_groups', id);
    return true;
  }

  private updateGroupCounts() {
    this.groups.forEach((g) => {
      g.memberCount = this.contacts.filter((c) => c.clientId === g.clientId && c.groups.includes(g.name)).length;
    });
  }

  // ================= TEMPLATES =================
  addTemplate(tplData: Omit<MessageTemplate, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>): MessageTemplate {
    const clientId = (tplData as any).clientId || this.requireActiveClientId();
    const id = `tpl_${Date.now()}`;
    const newTpl: MessageTemplate = {
      ...tplData,
      id,
      organizationId: this.orgId,
      clientId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.templates.unshift(newTpl);
    this.logAudit('Template Created', 'MessageTemplate', id, { name: newTpl.name }, newTpl.clientId);
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
    const clientId = this.requireActiveClientId();
    const template = this.templates.find((t) => t.id === data.templateId);
    if (!template) {
      throw new Error('Selected template not found');
    }

    if (template.clientId && template.clientId !== clientId) {
      throw new Error("A campaign cannot use another Client's template.");
    }

    const campaignType: 'Marketing' | 'Utility' =
      data.campaignType || (template.category === 'Utility' ? 'Utility' : 'Marketing');

    const clientContacts = this.contacts.filter((c) => c.clientId === clientId);

    // 1. Determine deduplicated audience contacts strictly within active Client
    let scopedContacts: Contact[] = [];
    if (data.targetContactIds && data.targetContactIds.length > 0) {
      scopedContacts = clientContacts.filter((c) => data.targetContactIds!.includes(c.id));
    } else if (data.audienceType === 'all') {
      scopedContacts = [...clientContacts];
    } else if (data.audienceType === 'groups') {
      scopedContacts = clientContacts.filter((c) => c.groups.some((g) => data.targetGroups.includes(g)));
    } else {
      scopedContacts = clientContacts.filter((c) => data.targetContacts.includes(c.id));
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
    const isServerConnected = this.serverWhatsAppStatus === 'Connected';

    // Safeguard: if live connection detected but demo mode was requested
    if (data.isDemo === true && isServerConnected) {
      throw new Error('Live WhatsApp connection detected. Simulated sending is disabled.');
    }

    const isDemoMode = isServerConnected ? false : (data.isDemo !== false);

    if (isDemoMode && isServerConnected) {
      throw new Error('Live WhatsApp connection detected. Simulated sending is disabled.');
    }

    if (!isDemoMode) {
      // LIVE MODE: Send approved templates through server-side Cloud API
      const isApproved = (template.status || '').toUpperCase() === 'APPROVED';
      if (!isApproved) {
        throw new Error(
          `Template "${template.name}" is "${template.status}". In Live Mode, Meta WhatsApp Cloud API requires APPROVED templates.`
        );
      }

      const res = await fetch(this.getApiUrl('/api/whatsapp/send-broadcast'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: data.name,
          template,
          recipients: deduplicatedAudience,
          variableMapping: data.variableMapping || {},
          variableFallbacks: data.variableFallbacks || {},
          isLiveMode: true,
        }),
      });

      const serverRes = await res.json();
      if (!res.ok || !serverRes.success) {
        throw new Error(serverRes.error || 'Server failed to process live broadcast dispatch');
      }

      const summary = serverRes.summary;
      const returnedRecipients: any[] = serverRes.recipients || [];

      const liveCampaign: Campaign = {
        id: campaignId,
        organizationId: this.orgId,
        clientId,
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
        eligibleCount: summary.eligibleProcessed,
        excludedCount: summary.skipped,
        sentCount: summary.sent,
        deliveredCount: 0, // In Live Mode, NEVER simulate delivery!
        readCount: 0, // In Live Mode, NEVER simulate read!
        failedCount: summary.failed,
        status: summary.failed === 0 ? 'Completed' : 'Partially Completed',
        variableMapping: data.variableMapping || {},
        variableFallbacks: data.variableFallbacks || {},
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        isDemo: false,
      };

      returnedRecipients.forEach((rcp, idx) => {
        const recipientRecord: CampaignRecipient = {
          id: `rcp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          campaignId,
          organizationId: this.orgId,
          clientId,
          contactId: rcp.contactId,
          phone: rcp.phone,
          normalizedPhone: rcp.normalizedPhone,
          contactName: rcp.contactName,
          templateId: template.id,
          templateName: template.name,
          templateBody: template.body,
          renderedBody: rcp.personalizedBody,
          personalizedBody: rcp.personalizedBody,
          variableValues: rcp.variableValues,
          whatsappMessageId: rcp.whatsappMessageId,
          status: rcp.status,
          failureReason: rcp.failureReason,
          sentAt: rcp.sentAt,
        };
        this.campaignRecipients.unshift(recipientRecord);
        this.persistDoc('campaign_recipients', recipientRecord.id, recipientRecord);

        if (rcp.status === 'sent') {
          let conv = this.conversations.find(
            (cnv) => cnv.clientId === clientId && (cnv.contactPhone === rcp.phone || arePhoneNumbersEqual(cnv.contactPhone, rcp.phone))
          );
          if (!conv) {
            conv = {
              id: `cnv_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
              organizationId: this.orgId,
              clientId,
              contactId: rcp.contactId,
              contactPhone: rcp.phone,
              normalizedPhone: rcp.normalizedPhone,
              contactName: rcp.contactName,
              lastMessage: rcp.personalizedBody,
              lastMessageAt: new Date().toISOString(),
              lastOutgoingMessageAt: new Date().toISOString(),
              unreadCount: 0,
              status: 'Closed',
              createdAt: new Date().toISOString(),
            };
            this.conversations.unshift(conv);
          } else {
            conv.lastMessage = rcp.personalizedBody;
            conv.lastMessageAt = new Date().toISOString();
            conv.lastOutgoingMessageAt = new Date().toISOString();
          }
          this.persistDoc('conversations', conv.id, conv);

          const msg: Message = {
            id: `msg_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
            conversationId: conv.id,
            organizationId: this.orgId,
            clientId,
            contactId: rcp.contactId,
            direction: 'outgoing',
            senderType: 'broadcast',
            messageType: 'template',
            templateName: template.name,
            body: rcp.personalizedBody,
            status: 'Sent',
            whatsappMessageId: rcp.whatsappMessageId,
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            isDemo: false,
          };
          this.messages.push(msg);
          this.persistDoc('messages', msg.id, msg);
        }
      });

      this.campaigns.unshift(liveCampaign);
      this.logAudit('Live Campaign Dispatched', 'Campaign', campaignId, {
        name: liveCampaign.name,
        type: campaignType,
        template: template.name,
        sent: summary.sent,
        failed: summary.failed,
        skipped: summary.skipped,
        mode: 'Live WhatsApp Cloud API',
      }, clientId);

      this.notify();
      this.persistDoc('campaigns', campaignId, liveCampaign);
      return { campaign: liveCampaign, summary };
    }

    const campaign: Campaign = {
      id: campaignId,
      organizationId: this.orgId,
      clientId,
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
        clientId,
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
      this.persistDoc('campaign_recipients', recipientRecord.id, recipientRecord);

      // 2. Create or update Inbox conversation
      let conv = this.conversations.find(
        (cnv) => cnv.clientId === clientId && (cnv.contactPhone === c.phone || arePhoneNumbersEqual(cnv.contactPhone, c.phone))
      );

      if (!conv) {
        conv = {
          id: `cnv_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          organizationId: this.orgId,
          clientId,
          contactId: c.id,
          contactPhone: c.phone,
          normalizedPhone: normalizePhoneNumber(c.phone).normalized || c.phone,
          contactName: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.phone,
          lastMessage: renderedBody,
          lastMessageAt: new Date().toISOString(),
          lastOutgoingMessageAt: new Date().toISOString(),
          unreadCount: 0,
          status: 'Closed', // Broadcast dispatch does not prematurely mark conversation as Open
          createdAt: new Date().toISOString(),
          isDemo: isDemoMode,
        };
        this.conversations.unshift(conv);
      } else {
        conv.lastMessage = renderedBody;
        conv.lastMessageAt = new Date().toISOString();
        conv.lastOutgoingMessageAt = new Date().toISOString();
        if (conv.normalizedPhone === undefined) {
          conv.normalizedPhone = normalizePhoneNumber(c.phone).normalized || c.phone;
        }
      }
      this.persistDoc('conversations', conv.id, conv);

      // 3. Create message record with renderedBody
      const msg: Message = {
        id: `msg_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: conv.id,
        organizationId: this.orgId,
        clientId,
        contactId: c.id,
        direction: 'outgoing',
        senderType: 'broadcast',
        messageType: 'template',
        templateName: template.name,
        body: renderedBody, // Stored as personalized renderedBody
        status: isRead ? 'Read' : 'Delivered',
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        isDemo: isDemoMode,
      };
      this.messages.push(msg);
      this.persistDoc('messages', msg.id, msg);
    });

    this.campaigns.unshift(campaign);
    this.logAudit('Campaign Dispatched', 'Campaign', campaignId, {
      name: campaign.name,
      type: campaignType,
      template: template.name,
      eligible: eligible.length,
      excluded: excluded.length,
      mode: isDemoMode ? 'Demo Simulation' : 'Live WhatsApp API',
    }, clientId);

    this.notify();
    this.persistDoc('campaigns', campaignId, campaign);
    return { campaign, summary: { eligible: eligible.length, excluded: excluded.length, total: deduplicatedAudience.length } };
  }

  // ================= CONVERSATIONS & INBOX =================
  async sendManualMessage(conversationId: string, text: string, isLiveModeParam?: boolean): Promise<Message> {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (!conv) throw new Error('Conversation not found');

    const cleanPhone = (conv.contactPhone || '').replace(/\D/g, '');
    if (!cleanPhone) throw new Error('Conversation contact has no valid phone number');

    const isServerConnected = this.serverWhatsAppStatus === 'Connected';

    // Safeguard: if server is Connected but demo mode was explicitly requested
    if (isLiveModeParam === false && isServerConnected) {
      throw new Error('Live WhatsApp connection detected. Simulated sending is disabled.');
    }

    // Determine live mode authoritatively from server connection status
    const isLiveMode = isServerConnected || Boolean(isLiveModeParam);

    // Enforce 24h customer window in Live Mode
    if (isLiveMode) {
      const incomingMsgs = this.messages.filter(
        (m) => m.conversationId === conversationId && m.direction === 'incoming'
      );
      const latestIncomingMsgTime = incomingMsgs.length > 0
        ? new Date(incomingMsgs[incomingMsgs.length - 1].timestamp || incomingMsgs[incomingMsgs.length - 1].createdAt).getTime()
        : 0;
      const convLastIncoming = conv.lastIncomingMessageAt ? new Date(conv.lastIncomingMessageAt).getTime() : 0;
      const effectiveLastIncomingTime = Math.max(latestIncomingMsgTime, convLastIncoming);
      const isWindowOpen = effectiveLastIncomingTime > 0 && Date.now() - effectiveLastIncomingTime < 24 * 60 * 60 * 1000;

      if (!isWindowOpen) {
        throw new Error(
          'Outside 24-hour customer service window: Meta WhatsApp Cloud API requires sending an approved template to message customers after 24 hours of inactivity.'
        );
      }
    }

    const clientId = conv.clientId || this.requireActiveClientId();

    if (isLiveMode) {
      // LIVE MODE: Call Meta WhatsApp Cloud API via server endpoint. Do NOT create message locally until Meta returns success and real wamid
      const response = await fetch(this.getApiUrl('/api/whatsapp/send-message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanPhone,
          messageType: 'text',
          body: text,
        }),
      });

      const res = await response.json().catch(() => ({}));
      if (!response.ok || !res || !res.success || !res.messageId) {
        // Return visible error instead of creating a fake local message
        throw new Error(res?.error || 'Meta WhatsApp Cloud API rejected message');
      }

      const now = new Date().toISOString();
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const msg: Message = {
        id: msgId,
        conversationId,
        organizationId: this.orgId,
        clientId,
        contactId: conv.contactId,
        recipient: cleanPhone,
        direction: 'outgoing',
        senderType: 'agent',
        messageType: 'text',
        body: text,
        status: 'submitted', // Meta API success + real wamid -> initial status submitted
        whatsappMessageId: res.messageId, // Real Meta wamid
        submittedAt: now,
        timestamp: now,
        createdAt: now,
        isDemo: false,
      };

      this.messages.push(msg);
      conv.lastMessage = text;
      conv.lastMessageAt = now;
      conv.lastOutgoingMessageAt = now;
      this.notify();
      this.persistDoc('messages', msgId, msg);
      this.persistDoc('conversations', conv.id, conv);
      this.logAudit('Manual Message Sent', 'Message', msgId, { recipient: cleanPhone, live: true }, clientId);

      // Trigger immediate event poll to pick up rapid 'sent' or 'delivered' status webhooks
      this.pollEvents().catch(() => {});

      return msg;
    } else {
      // SAFEGUARD: If live connection detected but a send would enter Demo Mode, block operation
      if (this.serverWhatsAppStatus === 'Connected' || localStorage.getItem('whatsflow_server_whatsapp_status') === 'Connected') {
        throw new Error('Live WhatsApp connection detected. Simulated sending is disabled.');
      }

      // DEMO MODE: Simulate sending (Only Demo/Developer Sandbox mode may create wamid.demo.* messages)
      const now = new Date().toISOString();
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const mockWamid = `wamid.demo.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;
      const msg: Message = {
        id: msgId,
        conversationId,
        organizationId: this.orgId,
        clientId,
        contactId: conv.contactId,
        recipient: cleanPhone,
        direction: 'outgoing',
        senderType: 'agent',
        messageType: 'text',
        body: text,
        status: 'Sent',
        whatsappMessageId: mockWamid,
        submittedAt: now,
        timestamp: now,
        createdAt: now,
        isDemo: true,
      };

      this.messages.push(msg);
      conv.lastMessage = text;
      conv.lastMessageAt = now;
      conv.lastOutgoingMessageAt = now;
      this.notify();
      this.persistDoc('messages', msgId, msg);
      this.persistDoc('conversations', conv.id, conv);
      this.logAudit('Manual Message Sent', 'Message', msgId, { recipient: cleanPhone, live: false }, clientId);
      return msg;
    }
  }

  async sendManualTemplateMessage(
    conversationId: string,
    template: MessageTemplate,
    variables?: Record<string, string>,
    isLiveModeParam?: boolean
  ): Promise<Message> {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (!conv) throw new Error('Conversation not found');

    const cleanPhone = (conv.contactPhone || '').replace(/\D/g, '');
    if (!cleanPhone) throw new Error('Conversation contact has no valid phone number');

    const isServerConnected = this.serverWhatsAppStatus === 'Connected';

    // Safeguard: if server is Connected but demo mode was requested
    if (isLiveModeParam === false && isServerConnected) {
      throw new Error('Live WhatsApp connection detected. Simulated sending is disabled.');
    }

    // Determine live mode authoritatively from server connection status
    const isLiveMode = isServerConnected || Boolean(isLiveModeParam);

    const isApproved = (template.status || '').toUpperCase() === 'APPROVED';
    if (!isApproved) {
      throw new Error(`Template "${template.name}" is ${template.status}. Only APPROVED templates can be sent.`);
    }

    if (isLiveMode && template.isDemo && !template.isLiveMeta && template.name !== 'hello_world') {
      throw new Error(
        `Template "${template.name}" is a demo template. In Live Mode, only Meta Live Templates synchronized from Meta can be dispatched.`
      );
    }

    let rendered = template.body || '';
    if (variables) {
      for (const [k, v] of Object.entries(variables)) {
        rendered = rendered.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
      }
    }

    const templateParameters = variables
      ? Object.keys(variables)
          .sort((a, b) => Number(a) - Number(b))
          .map((num) => ({
            type: 'text' as const,
            text: variables[num] || '',
          }))
      : undefined;

    const components =
      templateParameters && templateParameters.length > 0
        ? [
            {
              type: 'body' as const,
              parameters: templateParameters,
            },
          ]
        : undefined;

    const clientId = conv.clientId || this.requireActiveClientId();

    if (isLiveMode) {
      // LIVE MODE: Call server WhatsApp service. Do not create fake local message beforehand.
      const response = await fetch(this.getApiUrl('/api/whatsapp/send-message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanPhone,
          messageType: 'template',
          templateName: template.name,
          languageCode: template.language || 'en_US',
          components,
        }),
      });

      const res = await response.json().catch(() => ({}));
      if (!response.ok || !res || !res.success || !res.messageId) {
        throw new Error(res?.error || 'Meta WhatsApp Cloud API rejected template message');
      }

      const now = new Date().toISOString();
      const msgId = `msg_tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const msg: Message = {
        id: msgId,
        conversationId,
        organizationId: this.orgId,
        clientId,
        contactId: conv.contactId,
        recipient: cleanPhone,
        direction: 'outgoing',
        senderType: 'agent',
        messageType: 'template',
        templateName: template.name,
        body: rendered,
        status: 'submitted', // Stored as 'submitted'; webhooks update to delivered/read/failed
        whatsappMessageId: res.messageId, // Real Meta wamid
        submittedAt: now,
        timestamp: now,
        createdAt: now,
        isDemo: false,
      };

      this.messages.push(msg);
      conv.lastMessage = rendered;
      conv.lastMessageAt = now;
      conv.lastOutgoingMessageAt = now;
      this.notify();
      this.persistDoc('messages', msgId, msg);
      this.persistDoc('conversations', conv.id, conv);
      this.logAudit('Manual Template Message Sent', 'Message', msgId, { template: template.name, recipient: cleanPhone, live: true }, clientId);

      this.pollEvents().catch(() => {});

      return msg;
    } else {
      // SAFEGUARD: If live connection detected but a send would enter Demo Mode, block operation
      if (this.serverWhatsAppStatus === 'Connected' || localStorage.getItem('whatsflow_server_whatsapp_status') === 'Connected') {
        throw new Error('Live WhatsApp connection detected. Simulated sending is disabled.');
      }

      // DEMO MODE: Simulate sending (Only Demo/Developer Sandbox mode may create wamid.demo.* messages)
      const now = new Date().toISOString();
      const msgId = `msg_tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const mockWamid = `wamid.demo.template.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;
      const msg: Message = {
        id: msgId,
        conversationId,
        organizationId: this.orgId,
        clientId,
        contactId: conv.contactId,
        recipient: cleanPhone,
        direction: 'outgoing',
        senderType: 'agent',
        messageType: 'template',
        templateName: template.name,
        body: rendered,
        status: 'Sent',
        whatsappMessageId: mockWamid,
        submittedAt: now,
        timestamp: now,
        createdAt: now,
        isDemo: true,
      };

      this.messages.push(msg);
      conv.lastMessage = rendered;
      conv.lastMessageAt = now;
      conv.lastOutgoingMessageAt = now;
      this.notify();
      this.persistDoc('messages', msgId, msg);
      this.persistDoc('conversations', conv.id, conv);
      this.logAudit('Manual Template Message Sent', 'Message', msgId, { template: template.name, recipient: cleanPhone, live: false }, clientId);
      return msg;
    }
  }

  /**
   * Diagnostic live-send function for Settings -> WhatsApp Cloud API.
   * Sends the official Meta hello_world template and records the outgoing message if successful.
   */
  async sendDiagnosticHelloWorld(recipientPhone: string): Promise<any> {
    const normRecipient = (recipientPhone || '').replace(/\D/g, '');
    if (!normRecipient) {
      throw new Error('Recipient phone number is required and must contain digits.');
    }

    const res = await fetch('/api/whatsapp/test-send-hello-world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientPhone: normRecipient }),
    });

    const data = await res.json().catch(() => ({
      success: false,
      httpStatus: res.status,
      errorMessage: 'Invalid JSON response from server',
    }));

    if (data.success && data.wamid) {
      // 1. Store returned wamid
      // 2. Create / update outgoing message record with initial status 'submitted'
      // Do not mark Delivered or Read until webhook status events are received.
      const defaultClientId = this.getDefaultWhatsAppClientId();
      let contact = this.contacts.find((c) => c.clientId === defaultClientId && arePhoneNumbersEqual(c.phone, normRecipient));
      if (!contact) {
        contact = this.addContact({
          clientId: defaultClientId,
          firstName: 'WhatsApp',
          lastName: 'Contact',
          phone: `+${normRecipient}`,
          email: '',
          company: '',
          tags: ['Diagnostic Test'],
          groups: [],
          whatsappOptIn: true,
          marketingOptIn: false,
          transactionalOptIn: true,
          optOut: false,
          status: 'Active',
        });
      }

      let conv = this.conversations.find((c) => c.clientId === defaultClientId && arePhoneNumbersEqual(c.contactPhone, normRecipient));
      const now = new Date().toISOString();
      if (!conv) {
        conv = {
          id: `cnv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          organizationId: this.orgId,
          clientId: defaultClientId,
          contactId: contact.id,
          contactPhone: `+${normRecipient}`,
          contactName: `${contact.firstName} ${contact.lastName}`.trim() || `+${normRecipient}`,
          lastMessage: 'hello_world (Meta Template)',
          lastMessageAt: now,
          lastOutgoingMessageAt: now,
          unreadCount: 0,
          status: 'Open',
          createdAt: now,
        };
        this.conversations.unshift(conv);
      } else {
        conv.lastMessage = 'hello_world (Meta Template)';
        conv.lastMessageAt = now;
        conv.lastOutgoingMessageAt = now;
      }

      const msg: Message = {
        id: `msg_hello_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: conv.id,
        organizationId: this.orgId,
        clientId: defaultClientId,
        contactId: contact.id,
        direction: 'outgoing',
        senderType: 'agent',
        messageType: 'template',
        templateName: 'hello_world',
        body: 'Hello World (Official Meta Template)',
        status: 'submitted', // Initial status MUST be submitted!
        whatsappMessageId: data.wamid,
        timestamp: now,
        createdAt: now,
        isDemo: false,
      };
      this.messages.push(msg);

      this.logAudit('Diagnostic hello_world Sent', 'Message', msg.id, {
        recipient: normRecipient,
        wamid: data.wamid,
        status: 'submitted',
      }, defaultClientId);

      this.notify();
      this.persistDoc('messages', msg.id, msg);
      this.persistDoc('conversations', conv.id, conv);
    }

    return data;
  }

  toggleConversationStatus(conversationId: string): Conversation['status'] {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (!conv) return 'Open';
    conv.status = conv.status === 'Open' ? 'Closed' : 'Open';
    this.logAudit('Conversation Status Changed', 'Conversation', conv.id, { status: conv.status }, conv.clientId);
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
    const activeClientId = this.requireActiveClientId();
    const cleanPhone = senderPhone.replace(/\s+/g, '');
    let contact = this.contacts.find((c) => c.clientId === activeClientId && arePhoneNumbersEqual(c.phone, cleanPhone));

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
        clientId: activeClientId,
      });
    }

    // 2. Find or create conversation
    let conv = this.conversations.find((c) => c.clientId === activeClientId && arePhoneNumbersEqual(c.contactPhone, cleanPhone));
    if (!conv) {
      conv = {
        id: `cnv_${Date.now()}`,
        organizationId: this.orgId,
        clientId: activeClientId,
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
      clientId: activeClientId,
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

    // 4. Call server simulator endpoint to evaluate opt-out & automations (scoped to active client's rules)
    try {
      const response = await fetch('/api/webhook/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPhone: cleanPhone,
          text,
          rules: this.automationRules.filter((r) => r.clientId === activeClientId),
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
          optOutSource: 'Simulation STOP Command',
          status: 'Opted Out',
        });
      } else if (simResult.consent?.isOptInCommand) {
        this.updateContact(contact.id, {
          optOut: false,
          marketingOptIn: true,
          optInSource: 'Simulation START Command',
          status: 'Active',
        });
      }

      // If auto-reply triggered
      if (simResult.autoReply) {
        const autoMsg: Message = {
          id: `msg_auto_${Date.now()}`,
          conversationId: conv.id,
          organizationId: this.orgId,
          clientId: activeClientId,
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
    const clientId = (ruleData as any).clientId || this.requireActiveClientId();
    const id = `rul_${Date.now()}`;
    const newRule: AutomationRule = {
      ...ruleData,
      id,
      organizationId: this.orgId,
      clientId,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.automationRules.push(newRule);
    this.logAudit('Automation Created', 'AutomationRule', id, { name: newRule.name }, newRule.clientId);
    this.notify();
    this.persistDoc('automation_rules', id, newRule);
    return newRule;
  }

  updateAutomationRule(id: string, updates: Partial<AutomationRule>): AutomationRule | null {
    const r = this.automationRules.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, updates);
    this.logAudit('Automation Changed', 'AutomationRule', id, updates, r.clientId);
    this.notify();
    this.persistDoc('automation_rules', id, r);
    return r;
  }

  deleteAutomationRule(id: string): boolean {
    const r = this.automationRules.find((x) => x.id === id);
    if (!r) return false;
    this.automationRules = this.automationRules.filter((x) => x.id !== id);
    this.logAudit('Automation Deleted', 'AutomationRule', id, undefined, r.clientId);
    this.notify();
    this.deleteFirestoreDoc('automation_rules', id);
    return true;
  }

  // ================= AUDIT & CONSENT =================
  logAudit(
    action: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, any>,
    clientId?: string
  ) {
    let effectiveClientId = clientId;
    if (!effectiveClientId) {
      effectiveClientId = this.activeClientId;
    }
    if (!effectiveClientId || !this.clients.some((c) => c.id === effectiveClientId)) {
      effectiveClientId = this.getDefaultWhatsAppClientId();
    }
    const log: AuditLog = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      organizationId: this.orgId,
      clientId: effectiveClientId,
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
    clientId?: string;
    previousStatus: string;
    newStatus: string;
    source: string;
    changedByUserId?: string;
    timestamp?: string;
    notes?: string;
    phone?: string;
  }) {
    let clientId = params.clientId;
    if (!clientId) {
      const contact = this.contacts.find((c) => c.id === params.contactId);
      clientId = contact?.clientId;
    }
    if (!clientId || !this.clients.some((c) => c.id === clientId)) {
      clientId = (this.activeClientId && this.clients.some((c) => c.id === this.activeClientId))
        ? this.activeClientId
        : this.getDefaultWhatsAppClientId();
    }
    const hist: OptInHistoryEvent = {
      id: `opt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      organizationId: params.organizationId || this.orgId,
      clientId,
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
