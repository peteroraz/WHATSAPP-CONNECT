/**
 * Meta WhatsApp Business Cloud API Service
 * Secure server-side wrapper for official Graph API endpoints.
 * Never logs or exposes access tokens.
 */

export interface WhatsAppCredentials {
  accessToken?: string;
  phoneNumberId?: string;
  wabaId?: string;
  apiVersion?: string;
}

export interface SendTextParams {
  to: string; // E.164 formatted recipient phone number without '+'
  body: string;
}

export interface SendTemplateParams {
  to: string; // E.164 formatted recipient phone number without '+'
  templateName: string;
  languageCode: string;
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters: Array<{
      type: 'text' | 'image' | 'document';
      text?: string;
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

export class WhatsAppCloudApiService {
  private getCredentials(override?: WhatsAppCredentials): {
    token: string;
    phoneId: string;
    version: string;
    isConfigured: boolean;
  } {
    const token = override?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneId = override?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const version = override?.apiVersion || process.env.WHATSAPP_API_VERSION || 'v21.0';

    const isConfigured = Boolean(token && phoneId);
    return { token, phoneId, version, isConfigured };
  }

  /**
   * Safe test connection against Meta Graph API
   */
  async testConnection(override?: WhatsAppCredentials): Promise<{
    connected: boolean;
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    codeVerificationStatus?: string;
    error?: string;
    mock?: boolean;
  }> {
    const { token, phoneId, version, isConfigured } = this.getCredentials(override);

    if (!isConfigured) {
      return {
        connected: false,
        error: 'WhatsApp Business credentials not configured. Please set Phone Number ID and Access Token in Settings.',
        mock: true,
      };
    }

    try {
      const url = `https://graph.facebook.com/${version}/${phoneId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || `Meta API returned HTTP ${response.status}`;
        return {
          connected: false,
          error: errorMsg,
        };
      }

      return {
        connected: true,
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
        codeVerificationStatus: data.code_verification_status,
      };
    } catch (err: any) {
      return {
        connected: false,
        error: err?.message || 'Network error connecting to Meta WhatsApp API',
      };
    }
  }

  /**
   * Send free-form text message (requires 24h customer window on WhatsApp)
   */
  async sendTextMessage(
    params: SendTextParams,
    override?: WhatsAppCredentials
  ): Promise<WhatsAppSendResult> {
    const { token, phoneId, version, isConfigured } = this.getCredentials(override);
    const sanitizedTo = params.to.replace(/\D/g, '');

    if (!isConfigured) {
      // In dev/mock mode
      return {
        success: true,
        mock: true,
        messageId: `wamid.mock.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`,
      };
    }

    try {
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

      const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const errMessage = data?.error?.message || `Meta API error ${response.status}`;
        return {
          success: false,
          error: errMessage,
          raw: data,
        };
      }

      const messageId = data.messages?.[0]?.id;
      return {
        success: true,
        messageId: messageId || `wamid.${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to dispatch WhatsApp message',
      };
    }
  }

  /**
   * Send approved template message
   */
  async sendTemplateMessage(
    params: SendTemplateParams,
    override?: WhatsAppCredentials
  ): Promise<WhatsAppSendResult> {
    const { token, phoneId, version, isConfigured } = this.getCredentials(override);
    const sanitizedTo = params.to.replace(/\D/g, '');

    if (!isConfigured) {
      return {
        success: true,
        mock: true,
        messageId: `wamid.mock.template.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`,
      };
    }

    try {
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

      const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const errMessage = data?.error?.message || `Meta API error ${response.status}`;
        return {
          success: false,
          error: errMessage,
          raw: data,
        };
      }

      const messageId = data.messages?.[0]?.id;
      return {
        success: true,
        messageId: messageId || `wamid.${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to send template message',
      };
    }
  }
}

export const whatsappService = new WhatsAppCloudApiService();
