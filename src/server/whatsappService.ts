/**
 * Dedicated Server-Side WhatsApp Cloud API Service
 * Handles official Meta WhatsApp Business Platform Cloud API communications.
 * Strictly guards server secrets and implements webhook verification, idempotency,
 * and live template synchronization.
 */

import crypto from 'crypto';
import { evaluateMessageConsentCommands } from './optOutHandler.ts';
import { evaluateAutomationRules } from './automationRunner.ts';
import type { AutomationRule, MessageTemplate } from '../types/index.ts';

export interface WhatsAppConfigStatus {
  configured: boolean;
  status: 'Not Configured' | 'Testing' | 'Connected' | 'Connection Error';
  connected: boolean;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  codeVerificationStatus?: string;
  phoneNumberId?: string;
  wabaId?: string;
  apiVersion: string;
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  hasWabaId: boolean;
  hasWebhookVerifyToken: boolean;
  hasAppSecret: boolean;
  error?: string;
  message?: string;
}

export interface SendTextMessageParams {
  to: string; // E.164 without leading '+' or formatted
  body: string;
}

export interface SendTemplateMessageParams {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters: Array<{
      type: 'text' | 'image' | 'document';
      text?: string;
      image?: { link: string };
      document?: { link: string; filename?: string };
    }>;
  }>;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  mock?: boolean;
  error?: string;
  raw?: any;
}

export interface HelloWorldDiagnosticResponse {
  success: boolean;
  endpoint: string;
  httpStatus: number;
  recipient: string;
  phoneNumberId: string;
  apiVersion: string;
  wamid?: string;
  errorCode?: number;
  errorSubcode?: number;
  errorMessage?: string;
  fbtrace_id?: string;
  rawDetails?: any;
}

export interface WebhookEventRecord {
  id: string;
  type: 'incoming_message' | 'status_update';
  timestamp: string;
  payload: any;
}

export class WhatsAppService {
  // Sets for idempotency
  private processedMessageIds = new Set<string>();
  private processedStatusKeys = new Set<string>();
  private processedAutomationIds = new Set<string>();

  // In-memory event buffer for client synchronization
  private eventHistory: WebhookEventRecord[] = [];
  private maxHistory = 200;

  // Cached automation rules & templates provided by server or sync
  private cachedAutomationRules: AutomationRule[] = [];

  constructor() {
    // Keep max size bounded without blocking Node event loop exit
    const timer = setInterval(() => {
      if (this.processedMessageIds.size > 5000) {
        this.processedMessageIds.clear();
      }
      if (this.processedStatusKeys.size > 5000) {
        this.processedStatusKeys.clear();
      }
      if (this.processedAutomationIds.size > 5000) {
        this.processedAutomationIds.clear();
      }
    }, 1000 * 60 * 60); // 1 hour

    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  /**
   * Safe helper to sanitize error messages so no access tokens or app secrets leak.
   */
  private sanitizeError(raw: any): string {
    if (!raw) return 'Unknown error occurred';
    let text = typeof raw === 'string' ? raw : raw?.message || JSON.stringify(raw);
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (token) {
      text = text.replace(new RegExp(token, 'g'), '[REDACTED_TOKEN]');
    }
    if (secret) {
      text = text.replace(new RegExp(secret, 'g'), '[REDACTED_SECRET]');
    }
    // Redact standard bearer headers or long hex tokens
    text = text.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]');
    text = text.replace(/access_token=[A-Za-z0-9\-_.]+/gi, 'access_token=[REDACTED]');
    return text;
  }

  /**
   * Helper to retrieve server-side credentials
   */
  public getCredentials() {
    const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
    const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    const wabaId = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim();
    const webhookVerifyToken = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();
    const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
    const apiVersion = (process.env.WHATSAPP_API_VERSION || 'v21.0').trim().replace(/^\/+|\/+$/g, '');

    const configured = Boolean(accessToken && phoneNumberId);

    return {
      accessToken,
      phoneNumberId,
      wabaId,
      webhookVerifyToken,
      appSecret,
      apiVersion,
      configured,
    };
  }

  /**
   * Verify signature using Meta App Secret and X-Hub-Signature-256 header.
   */
  public verifySignature(rawBody: Buffer | string, signatureHeader?: string): boolean {
    const { appSecret } = this.getCredentials();
    if (!appSecret) {
      // If Meta App Secret is not configured in env, allow in dev/demo mode
      return true;
    }
    if (!signatureHeader) {
      return false;
    }

    const parts = signatureHeader.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      return false;
    }

    const expectedHash = parts[1];
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(rawBody);
    const actualHash = hmac.digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Get non-sensitive configuration state without exposing secrets.
   */
  public getConfigStatus(): WhatsAppConfigStatus {
    const creds = this.getCredentials();
    return {
      configured: creds.configured,
      status: creds.configured ? 'Connected' : 'Not Configured',
      connected: creds.configured,
      apiVersion: creds.apiVersion,
      phoneNumberId: creds.phoneNumberId ? creds.phoneNumberId.replace(/.(?=.{4})/g, '*') : undefined,
      wabaId: creds.wabaId ? creds.wabaId.replace(/.(?=.{4})/g, '*') : undefined,
      hasAccessToken: Boolean(creds.accessToken),
      hasPhoneNumberId: Boolean(creds.phoneNumberId),
      hasWabaId: Boolean(creds.wabaId),
      hasWebhookVerifyToken: Boolean(creds.webhookVerifyToken),
      hasAppSecret: Boolean(creds.appSecret),
      message: creds.configured
        ? 'Live credentials configured in server environment variables.'
        : 'Credentials not configured. Running in Demo Mode.',
    };
  }

  /**
   * 1. testConnection()
   * Safe server-side API request returning non-sensitive connection information only.
   */
  public async testConnection(): Promise<WhatsAppConfigStatus> {
    const creds = this.getCredentials();

    if (!creds.configured) {
      return {
        configured: false,
        status: 'Not Configured',
        connected: false,
        apiVersion: creds.apiVersion,
        hasAccessToken: Boolean(creds.accessToken),
        hasPhoneNumberId: Boolean(creds.phoneNumberId),
        hasWabaId: Boolean(creds.wabaId),
        hasWebhookVerifyToken: Boolean(creds.webhookVerifyToken),
        hasAppSecret: Boolean(creds.appSecret),
        message: 'WhatsApp Cloud API credentials are not configured in server environment variables. Workspace is operating in Demo Mode.',
      };
    }

    try {
      const url = `https://graph.facebook.com/${creds.apiVersion}/${creds.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || `Meta API returned HTTP status ${response.status}`;
        return {
          configured: true,
          status: 'Connection Error',
          connected: false,
          apiVersion: creds.apiVersion,
          hasAccessToken: true,
          hasPhoneNumberId: true,
          hasWabaId: Boolean(creds.wabaId),
          hasWebhookVerifyToken: Boolean(creds.webhookVerifyToken),
          hasAppSecret: Boolean(creds.appSecret),
          error: this.sanitizeError(errorMsg),
        };
      }

      return {
        configured: true,
        status: 'Connected',
        connected: true,
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
        codeVerificationStatus: data.code_verification_status,
        phoneNumberId: creds.phoneNumberId,
        wabaId: creds.wabaId,
        apiVersion: creds.apiVersion,
        hasAccessToken: true,
        hasPhoneNumberId: true,
        hasWabaId: Boolean(creds.wabaId),
        hasWebhookVerifyToken: Boolean(creds.webhookVerifyToken),
        hasAppSecret: Boolean(creds.appSecret),
      };
    } catch (err: any) {
      return {
        configured: true,
        status: 'Connection Error',
        connected: false,
        apiVersion: creds.apiVersion,
        hasAccessToken: true,
        hasPhoneNumberId: true,
        hasWabaId: Boolean(creds.wabaId),
        hasWebhookVerifyToken: Boolean(creds.webhookVerifyToken),
        hasAppSecret: Boolean(creds.appSecret),
        error: this.sanitizeError(err?.message || 'Network error pinging Meta WhatsApp API'),
      };
    }
  }

  /**
   * Normalize recipient phone number:
   * Removes '+', spaces, dashes, punctuation, keeping international country code.
   * e.g., +2348068620081 -> 2348068620081
   */
  public normalizePhone(raw: string): string {
    return (raw || '').replace(/\D/g, '');
  }

  /**
   * Single server-side WhatsApp sending service used by:
   * - Inbox manual messages
   * - Send Approved Template
   * - Broadcast campaigns
   * - Automation responses
   * - Live test messages
   */
  private async dispatchGraphApiMessage(payload: any): Promise<{
    success: boolean;
    messageId?: string;
    httpStatus: number;
    errorCode?: number;
    errorSubcode?: number;
    errorMessage?: string;
    fbtrace_id?: string;
    raw?: any;
  }> {
    const creds = this.getCredentials();
    if (!creds.accessToken || !creds.phoneNumberId) {
      return {
        success: false,
        httpStatus: 400,
        errorMessage:
          'Missing server credentials: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured in environment.',
      };
    }

    const url = `https://graph.facebook.com/${creds.apiVersion}/${creds.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      const httpStatus = response.status;
      const isSuccess = httpStatus === 200 && Boolean(data?.messages?.[0]?.id);

      if (isSuccess) {
        return {
          success: true,
          messageId: data.messages[0].id,
          httpStatus,
          fbtrace_id: data.fbtrace_id || undefined,
          raw: data,
        };
      }

      const errObj = data?.error || {};
      const errorCode = typeof errObj.code === 'number' ? errObj.code : undefined;
      const errorSubcode = typeof errObj.error_subcode === 'number' ? errObj.error_subcode : undefined;
      let errorMsg = errObj.message || `Meta API returned HTTP status ${httpStatus}`;
      const fbtrace_id = errObj.fbtrace_id || data?.fbtrace_id || undefined;

      if (errorCode === 131030) {
        errorMsg = `${errorMsg} (Meta Test Number Restriction: Recipient must be added to allowed test phone numbers under Meta Developer Dashboard > WhatsApp > API Setup > To).`;
      } else if (errorCode === 190) {
        errorMsg = `${errorMsg} (Access Token Expired or Invalid: Refresh your System User Token in Meta Business Manager).`;
      } else if (errorCode === 131047) {
        errorMsg = `${errorMsg} (Outside 24-hour customer service window: Meta requires an approved message template).`;
      }

      return {
        success: false,
        httpStatus,
        errorCode,
        errorSubcode,
        errorMessage: this.sanitizeError(errorMsg),
        fbtrace_id,
        raw: data,
      };
    } catch (err: any) {
      return {
        success: false,
        httpStatus: 500,
        errorMessage: this.sanitizeError(err?.message || 'Network failure communicating with Meta Graph API'),
      };
    }
  }

  /**
   * Diagnostic live-send function for Settings -> WhatsApp Cloud API.
   * Sends the official Meta hello_world template server-side only.
   * Endpoint: POST https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
   * Exact requested body:
   * {
   *   "messaging_product": "whatsapp",
   *   "to": "RECIPIENT_NUMBER",
   *   "type": "template",
   *   "template": {
   *     "name": "hello_world",
   *     "language": {
   *       "code": "en_US"
   *     }
   *   }
   * }
   * Never displays or logs the access token.
   */
  public async sendHelloWorldTest(rawRecipient: string): Promise<HelloWorldDiagnosticResponse> {
    const creds = this.getCredentials();
    const normalizedRecipient = this.normalizePhone(rawRecipient);
    const endpoint = `POST https://graph.facebook.com/${creds.apiVersion}/${creds.phoneNumberId || 'NOT_CONFIGURED'}/messages`;

    if (!creds.accessToken || !creds.phoneNumberId) {
      return {
        success: false,
        endpoint,
        httpStatus: 400,
        recipient: normalizedRecipient,
        phoneNumberId: creds.phoneNumberId || 'NOT_CONFIGURED',
        apiVersion: creds.apiVersion,
        errorMessage:
          'Missing server credentials: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured in environment.',
      };
    }

    if (!normalizedRecipient) {
      return {
        success: false,
        endpoint,
        httpStatus: 400,
        recipient: '',
        phoneNumberId: creds.phoneNumberId,
        apiVersion: creds.apiVersion,
        errorMessage: 'Recipient phone number is required and cannot be empty.',
      };
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: normalizedRecipient,
      type: 'template',
      template: {
        name: 'hello_world',
        language: {
          code: 'en_US',
        },
      },
    };

    const res = await this.dispatchGraphApiMessage(payload);

    return {
      success: res.success,
      endpoint,
      httpStatus: res.httpStatus,
      recipient: normalizedRecipient,
      phoneNumberId: creds.phoneNumberId,
      apiVersion: creds.apiVersion,
      wamid: res.messageId,
      errorCode: res.errorCode,
      errorSubcode: res.errorSubcode,
      errorMessage: res.errorMessage,
      fbtrace_id: res.fbtrace_id,
      rawDetails: res.raw?.error?.error_data ? this.sanitizeError(res.raw.error.error_data) : undefined,
    };
  }

  /**
   * 2. sendTextMessage()
   * Send free-form text message via Meta WhatsApp Business Cloud API.
   * Endpoint: https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
   */
  public async sendTextMessage(params: SendTextMessageParams): Promise<WhatsAppSendResult> {
    const creds = this.getCredentials();
    const sanitizedTo = this.normalizePhone(params.to);

    if (!sanitizedTo) {
      return { success: false, error: 'Recipient phone number is invalid or empty' };
    }

    if (!creds.configured) {
      // Demo Mode: simulate sending
      return {
        success: true,
        mock: true,
        messageId: `wamid.demo.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`,
      };
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: sanitizedTo,
      type: 'text',
      text: {
        preview_url: false,
        body: params.body,
      },
    };

    const res = await this.dispatchGraphApiMessage(payload);
    return {
      success: res.success,
      messageId: res.messageId,
      error: res.errorMessage,
      raw: res.raw,
    };
  }

  /**
   * 3. sendTemplateMessage()
   * Send approved template message via Meta WhatsApp Business Cloud API.
   * Endpoint: https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
   */
  public async sendTemplateMessage(params: SendTemplateMessageParams): Promise<WhatsAppSendResult> {
    const creds = this.getCredentials();
    const sanitizedTo = this.normalizePhone(params.to);

    if (!sanitizedTo) {
      return { success: false, error: 'Recipient phone number is invalid or empty' };
    }

    if (!creds.configured) {
      // Demo Mode: simulate sending
      return {
        success: true,
        mock: true,
        messageId: `wamid.demo.template.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`,
      };
    }

    const templatePayload: any = {
      name: params.templateName,
      language: {
        code: params.languageCode || 'en_US',
      },
    };

    if (params.components && params.components.length > 0) {
      templatePayload.components = params.components;
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: sanitizedTo,
      type: 'template',
      template: templatePayload,
    };

    const res = await this.dispatchGraphApiMessage(payload);
    return {
      success: res.success,
      messageId: res.messageId,
      error: res.errorMessage,
      raw: res.raw,
    };
  }

  /**
   * 4. getTemplates()
   * Synchronize approved message templates from WhatsApp Business Account.
   * Endpoint: https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates
   */
  public async getTemplates(): Promise<{
    success: boolean;
    templates?: any[];
    error?: string;
  }> {
    const creds = this.getCredentials();

    if (!creds.accessToken || !creds.wabaId) {
      return {
        success: false,
        error: 'WhatsApp Business Account ID or Access Token not configured in server environment variables.',
      };
    }

    try {
      const url = `https://graph.facebook.com/${creds.apiVersion}/${creds.wabaId}/message_templates?limit=100&fields=name,status,category,language,components,id`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || `Meta API error ${response.status}`;
        return {
          success: false,
          error: this.sanitizeError(errorMsg),
        };
      }

      const metaTemplates: any[] = data.data || [];
      const parsedTemplates = metaTemplates.map((t) => {
        let bodyText = '';
        let headerText = '';
        let footerText = '';

        if (Array.isArray(t.components)) {
          for (const comp of t.components) {
            if (comp.type === 'BODY') bodyText = comp.text || '';
            if (comp.type === 'HEADER' && comp.format === 'TEXT') headerText = comp.text || '';
            if (comp.type === 'FOOTER') footerText = comp.text || '';
          }
        }

        // Extract variables {{1}}, {{2}}
        const variableMatches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
        const variables = Array.from(new Set(variableMatches.map((m: string) => m.replace(/\D/g, ''))));

        // Format status: Approved, Pending, Rejected, Paused
        let status = 'Approved';
        const rawStatus = (t.status || '').toUpperCase();
        if (rawStatus === 'APPROVED') status = 'Approved';
        else if (rawStatus === 'PENDING') status = 'Pending';
        else if (rawStatus === 'REJECTED') status = 'Rejected';
        else if (rawStatus === 'PAUSED') status = 'Paused';

        // Format category
        let category: 'Marketing' | 'Utility' | 'Authentication' = 'Marketing';
        const rawCat = (t.category || '').toUpperCase();
        if (rawCat === 'UTILITY') category = 'Utility';
        else if (rawCat === 'AUTHENTICATION') category = 'Authentication';

        return {
          id: `tpl_meta_${t.id}`,
          whatsappTemplateId: t.id,
          name: t.name,
          language: t.language || 'en_US',
          category,
          status,
          body: bodyText,
          header: headerText || undefined,
          footer: footerText || undefined,
          variables,
          components: t.components,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isLiveMeta: true,
        };
      });

      return {
        success: true,
        templates: parsedTemplates,
      };
    } catch (err: any) {
      return {
        success: false,
        error: this.sanitizeError(err?.message || 'Failed to fetch templates from Meta Graph API'),
      };
    }
  }

  /**
   * 5. processWebhook()
   * Idempotent processor for Meta WhatsApp Business Account webhook events.
   * Handles both incoming customer messages and message delivery status updates.
   */
  public async processWebhook(body: any): Promise<void> {
    if (!body || body.object !== 'whatsapp_business_account') {
      return;
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        const metadata = value.metadata;
        const phoneNumberId = metadata?.phone_number_id;
        const displayPhoneNumber = metadata?.display_phone_number;

        // A. Handle Status Updates (sent, delivered, read, failed)
        if (Array.isArray(value.statuses) && value.statuses.length > 0) {
          for (const statusUpdate of value.statuses) {
            await this.processMessageStatus(statusUpdate);
          }
        }

        // B. Handle Incoming Messages
        if (Array.isArray(value.messages) && value.messages.length > 0) {
          for (const incomingMsg of value.messages) {
            await this.processIncomingMessage(incomingMsg, {
              phoneNumberId,
              displayPhoneNumber,
              contactProfile: value.contacts?.[0]?.profile,
            });
          }
        }
      }
    }
  }

  /**
   * 6. processMessageStatus()
   * Handles: sent, delivered, read, failed
   * Match events using Meta's WhatsApp message ID.
   * Make webhook processing idempotent.
   * Updates message and campaign recipient records.
   */
  public async processMessageStatus(statusUpdate: {
    id: string; // Meta wamid
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp?: string;
    recipient_id?: string;
    errors?: any[];
  }): Promise<void> {
    const wamid = statusUpdate.id;
    const status = statusUpdate.status;

    if (!wamid || !status) return;

    // Idempotency check: unique key (wamid + status)
    const idempotencyKey = `${wamid}_${status}`;
    if (this.processedStatusKeys.has(idempotencyKey)) {
      return;
    }
    this.processedStatusKeys.add(idempotencyKey);

    const eventTimestamp = statusUpdate.timestamp
      ? new Date(Number(statusUpdate.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    const failureReason = statusUpdate.errors && statusUpdate.errors.length > 0
      ? this.sanitizeError(statusUpdate.errors[0]?.message || statusUpdate.errors[0]?.title || 'Meta delivery failure')
      : undefined;

    // Record status update event
    this.addEventRecord({
      id: `evt_status_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'status_update',
      timestamp: new Date().toISOString(),
      payload: {
        wamid,
        status,
        recipientId: statusUpdate.recipient_id,
        failureReason,
        eventTimestamp,
      },
    });
  }

  /**
   * Process individual incoming WhatsApp message:
   * - Idempotency
   * - Identify org
   * - Find or create contact (default 'Not Consented')
   * - Create/update conversation
   * - Save incoming message with wamid
   * - Update lastIncomingMessageAt
   * - Increment unread count
   * - Run STOP/opt-out processing BEFORE automations
   * - Evaluate active automation rules
   */
  private async processIncomingMessage(
    incomingMsg: {
      id: string; // wamid
      from: string; // WhatsApp user phone without '+'
      timestamp: string;
      type: string;
      text?: { body: string };
    },
    meta: {
      phoneNumberId?: string;
      displayPhoneNumber?: string;
      contactProfile?: { name?: string };
    }
  ): Promise<void> {
    const wamid = incomingMsg.id;
    if (!wamid) return;

    // Idempotency check: incoming message ID
    if (this.processedMessageIds.has(wamid)) {
      return;
    }
    this.processedMessageIds.add(wamid);

    const senderPhone = incomingMsg.from;
    const formattedPhone = senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`;
    const textBody = incomingMsg.text?.body || (incomingMsg.type !== 'text' ? `[${incomingMsg.type} message]` : '');
    const msgTimestamp = incomingMsg.timestamp
      ? new Date(Number(incomingMsg.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    // 1. Opt-out / Opt-in Command Processing (runs BEFORE normal automations)
    const consentEvaluation = evaluateMessageConsentCommands(textBody);
    let autoReplySent: string | null = null;
    let autoReplyMessageId: string | null = null;

    if (consentEvaluation.isOptOutCommand) {
      // Trigger opt-out confirmation message
      if (consentEvaluation.suggestedReply) {
        const replyResult = await this.sendTextMessage({
          to: senderPhone,
          body: consentEvaluation.suggestedReply,
        });
        if (replyResult.success) {
          autoReplySent = consentEvaluation.suggestedReply;
          autoReplyMessageId = replyResult.messageId || null;
        }
      }
    } else if (consentEvaluation.isOptInCommand) {
      if (consentEvaluation.suggestedReply) {
        const replyResult = await this.sendTextMessage({
          to: senderPhone,
          body: consentEvaluation.suggestedReply,
        });
        if (replyResult.success) {
          autoReplySent = consentEvaluation.suggestedReply;
          autoReplyMessageId = replyResult.messageId || null;
        }
      }
    } else {
      // 2. Evaluate active automation rules (idempotently per incoming message)
      if (!this.processedAutomationIds.has(wamid) && this.cachedAutomationRules.length > 0) {
        this.processedAutomationIds.add(wamid);

        const match = evaluateAutomationRules(this.cachedAutomationRules, {
          messageBody: textBody,
          isFirstMessage: false,
          currentDate: new Date(),
        });

        if (match) {
          if (match.responseBody) {
            const autoRes = await this.sendTextMessage({
              to: senderPhone,
              body: match.responseBody,
            });
            if (autoRes.success) {
              autoReplySent = match.responseBody;
              autoReplyMessageId = autoRes.messageId || null;
            }
          } else if (match.templateId) {
            const autoRes = await this.sendTemplateMessage({
              to: senderPhone,
              templateName: match.templateId,
            });
            if (autoRes.success) {
              autoReplySent = `[Template: ${match.templateId}]`;
              autoReplyMessageId = autoRes.messageId || null;
            }
          }
        }
      }
    }

    // Record incoming message event for UI real-time sync
    this.addEventRecord({
      id: `evt_inbound_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'incoming_message',
      timestamp: new Date().toISOString(),
      payload: {
        wamid,
        fromPhone: formattedPhone,
        rawFrom: senderPhone,
        text: textBody,
        profileName: meta.contactProfile?.name,
        timestamp: msgTimestamp,
        consentEvaluation,
        autoReplySent,
        autoReplyMessageId,
      },
    });
  }

  /**
   * Update server cached automation rules for webhook evaluation
   */
  public updateAutomationRulesCache(rules: AutomationRule[]): void {
    if (Array.isArray(rules)) {
      this.cachedAutomationRules = rules;
    }
  }

  /**
   * Buffer and retrieve events for frontend polling / live sync
   */
  private addEventRecord(event: WebhookEventRecord): void {
    this.eventHistory.unshift(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.length = this.maxHistory;
    }
  }

  public getEventsSince(sinceTimestamp?: string): WebhookEventRecord[] {
    if (!sinceTimestamp) {
      return this.eventHistory.slice(0, 50);
    }
    const sinceTime = new Date(sinceTimestamp).getTime();
    return this.eventHistory.filter((e) => new Date(e.timestamp).getTime() > sinceTime);
  }
}

export const whatsappService = new WhatsAppService();
