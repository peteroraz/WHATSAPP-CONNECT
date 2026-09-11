export type UserRole = 'owner' | 'admin' | 'agent';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  currentOrgId: string;
  createdAt: string;
}

export interface BusinessHours {
  enabled: boolean;
  timezone: string;
  days: number[]; // 1 = Monday, 7 = Sunday
  startTime: string; // "08:00"
  endTime: string; // "17:00"
  outOfHoursMessage: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  timezone: string;
  businessHours: BusinessHours;
  whatsappConnected: boolean;
  whatsappBusinessAccountId?: string;
  whatsappPhoneNumberId?: string;
  whatsappPhoneNumber?: string;
  whatsappApiVersion?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: UserRole;
  userEmail: string;
  userName: string;
  createdAt: string;
}

export type ContactStatus = 'Active' | 'Opted Out' | 'Invalid' | 'Blocked';

export type ConsentStatus = 'Not Consented' | 'Marketing Consented' | 'Transactional Only' | 'Opted Out';

export interface Contact {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  phone: string; // E.164 format (+234...)
  email: string;
  company: string;
  tags: string[];
  groups: string[];
  whatsappOptIn: boolean;
  marketingOptIn: boolean;
  transactionalOptIn: boolean;
  optInDate?: string;
  optInSource?: string;
  consentNotes?: string;
  optOut: boolean;
  optOutDate?: string;
  optOutSource?: string;
  status: ContactStatus;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface ContactGroup {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  memberCount: number;
  createdAt: string;
  isDemo?: boolean;
}

export type TemplateCategory = 'Marketing' | 'Utility' | 'Authentication';
export type TemplateStatus = 'Approved' | 'Pending' | 'Rejected' | 'Paused';

export interface MessageTemplate {
  id: string;
  organizationId: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  body: string;
  header?: string;
  footer?: string;
  variables: string[]; // e.g. ["1", "2"]
  whatsappTemplateId?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type CampaignStatus = 
  | 'Draft' 
  | 'Scheduled' 
  | 'Queued' 
  | 'Sending' 
  | 'Completed' 
  | 'Partially Completed' 
  | 'Cancelled';

export type CampaignType = 'Marketing' | 'Utility';

export interface Campaign {
  id: string;
  organizationId: string;
  name: string;
  campaignType?: CampaignType;
  templateId: string;
  templateName: string;
  templateCategory?: TemplateCategory;
  templateBody?: string;
  audienceType: 'groups' | 'contacts' | 'all';
  targetGroups: string[];
  targetContacts: string[];
  totalSelected: number;
  eligibleCount: number;
  excludedCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  status: CampaignStatus;
  variableMapping: Record<string, string>; // e.g. { "1": "firstName", "2": "company" }
  variableFallbacks?: Record<string, string>; // e.g. { "2": "our organization" }
  createdAt: string;
  completedAt?: string;
  isDemo?: boolean;
}

export type RecipientStatus = 
  | 'pending' 
  | 'queued' 
  | 'sent' 
  | 'delivered' 
  | 'read' 
  | 'failed' 
  | 'skipped';

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  organizationId: string;
  contactId: string;
  phone: string;
  normalizedPhone?: string;
  contactName: string;
  templateId?: string;
  templateName?: string;
  templateBody?: string;
  renderedBody?: string;
  personalizedBody: string;
  variableValues?: Record<string, string>;
  whatsappMessageId?: string;
  status: RecipientStatus;
  failureReason?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
}

export type ConversationStatus = 'Open' | 'Closed';

export interface Conversation {
  id: string;
  organizationId: string;
  contactId: string;
  contactPhone: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: string;
  lastIncomingMessageAt?: string;
  lastOutgoingMessageAt?: string;
  unreadCount: number;
  status: ConversationStatus;
  assignedUserId?: string;
  createdAt: string;
  isDemo?: boolean;
}

export type MessageDirection = 'incoming' | 'outgoing';
export type MessageSenderType = 'customer' | 'agent' | 'automation' | 'broadcast';
export type MessageDeliveryStatus = 'Sending' | 'Sent' | 'Delivered' | 'Read' | 'Failed';

export interface Message {
  id: string;
  conversationId: string;
  organizationId: string;
  contactId: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  body: string;
  messageType: 'text' | 'template';
  templateName?: string;
  status: MessageDeliveryStatus;
  failureReason?: string;
  whatsappMessageId?: string;
  timestamp: string;
  createdAt: string;
  isDemo?: boolean;
}

export type AutomationTrigger = 
  | 'incoming_message' 
  | 'welcome' 
  | 'keyword' 
  | 'outside_business_hours';

export type ConditionType = 'contains' | 'equals' | 'starts_with';

export type AutomationAction = 
  | 'send_text' 
  | 'send_template' 
  | 'mark_open' 
  | 'mark_closed';

export interface AutomationRule {
  id: string;
  organizationId: string;
  name: string;
  trigger: AutomationTrigger;
  conditionType: ConditionType;
  conditionValue: string;
  actionType: AutomationAction;
  actionPayload: string; // text body or template ID
  priority: number; // 1 (highest) to 10
  status: 'active' | 'inactive';
  lastTriggeredAt?: string;
  triggerCount?: number;
  createdAt: string;
  isDemo?: boolean;
}

export interface OptInHistoryEvent {
  id: string;
  organizationId: string;
  contactId: string;
  phone: string;
  previousStatus?: string;
  newStatus?: string;
  source: string;
  changedByUserId?: string;
  timestamp: string;
  notes?: string;
  event?: 'opt_in' | 'opt_out' | 'consent_logged' | 'keyword_opt_out' | 'keyword_opt_in' | 'status_change';
  reason?: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  userId: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface WhatsAppConfig {
  wabaId: string;
  phoneNumberId: string;
  businessPhoneNumber: string;
  apiVersion: string;
  webhookVerifyToken: string;
  status: 'Not Configured' | 'Configured' | 'Connected' | 'Connection Error';
  lastTestedAt?: string;
  errorMessage?: string;
}
