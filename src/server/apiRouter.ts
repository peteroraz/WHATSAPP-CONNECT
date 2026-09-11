import express, { Request, Response, Router } from 'express';
import { whatsappService } from './whatsappApi.ts';
import { evaluateMessageConsentCommands } from './optOutHandler.ts';
import { evaluateAutomationRules } from './automationRunner.ts';
import { AutomationRule } from '../types/index.ts';

export const apiRouter: Router = express.Router();

// Middleware to parse JSON
apiRouter.use(express.json());

/**
 * Health check
 */
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'WhatsFlow',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Webhook Verification (Meta WhatsApp Cloud API Requirement)
 */
apiRouter.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'whatsflow_verify_token_secure';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook] Webhook subscription verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook] Verification failed: invalid token or mode');
  return res.status(403).send('Forbidden');
});

/**
 * WhatsApp Incoming Webhook Handler
 */
apiRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Acknowledge Meta immediately with 200 OK
    res.status(200).send('EVENT_RECEIVED');

    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return;

    // Handle status updates (sent, delivered, read, failed)
    if (value.statuses && value.statuses.length > 0) {
      const statusUpdate = value.statuses[0];
      console.log(`[Webhook Status] Message ${statusUpdate.id}: ${statusUpdate.status}`);
      // Status update event processed idempotently
      return;
    }

    // Handle incoming messages
    if (value.messages && value.messages.length > 0) {
      const incomingMsg = value.messages[0];
      const senderPhone = incomingMsg.from;
      const textBody = incomingMsg.text?.body || '';

      console.log(`[Webhook Incoming] From: ${senderPhone}, Text: ${textBody}`);

      // Evaluate opt-out / opt-in
      const consentResult = evaluateMessageConsentCommands(textBody);
      if (consentResult.isOptOutCommand) {
        console.log(`[Webhook Opt-Out] ${senderPhone} requested opt-out.`);
      }
    }
  } catch (err: any) {
    console.error('[Webhook Error]', err.message);
  }
});

/**
 * Test WhatsApp Business Account Connection
 */
apiRouter.post('/whatsapp/test-connection', async (req: Request, res: Response) => {
  try {
    const { accessToken, phoneNumberId, wabaId, apiVersion } = req.body;

    const result = await whatsappService.testConnection({
      accessToken,
      phoneNumberId,
      wabaId,
      apiVersion,
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      connected: false,
      error: error?.message || 'Failed to verify WhatsApp credentials',
    });
  }
});

/**
 * Dispatch manual or automated message
 */
apiRouter.post('/whatsapp/send-message', async (req: Request, res: Response) => {
  try {
    const { to, messageType, body, templateName, languageCode, components, credentials } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Recipient phone number is required' });
    }

    if (messageType === 'template') {
      if (!templateName) {
        return res.status(400).json({ error: 'Template name is required for template messages' });
      }
      const result = await whatsappService.sendTemplateMessage(
        {
          to,
          templateName,
          languageCode: languageCode || 'en_US',
          components,
        },
        credentials
      );
      return res.json(result);
    }

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Message body cannot be empty' });
    }

    const result = await whatsappService.sendTextMessage({ to, body }, credentials);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error sending message',
    });
  }
});

/**
 * Server-Side Broadcast Processor
 * Filters out contacts who opted out or haven't granted marketing consent.
 * Deduplicates numbers, processes variables, and dispatches.
 */
apiRouter.post('/whatsapp/send-broadcast', async (req: Request, res: Response) => {
  try {
    const { campaignName, template, recipients, variableMapping, credentials } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided for broadcast' });
    }

    if (!template || !template.name) {
      return res.status(400).json({ error: 'Valid approved template is required for broadcasts' });
    }

    const processedRecipients: any[] = [];
    const seenPhones = new Set<string>();

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const normalizedPhone = (recipient.phone || '').replace(/\D/g, '');

      // Compliance Rule 1: Cannot send if opted out
      if (recipient.optOut === true) {
        skipped++;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'skipped',
          failureReason: 'Contact is opted out',
        });
        continue;
      }

      // Compliance Rule 2: Cannot send marketing broadcast without marketingOptIn == true
      if (template.category === 'Marketing' && recipient.marketingOptIn !== true) {
        skipped++;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'skipped',
          failureReason: 'Missing explicit marketing consent',
        });
        continue;
      }

      // Compliance Rule 3: Deduplicate normalized phone in same campaign
      if (seenPhones.has(normalizedPhone)) {
        skipped++;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'skipped',
          failureReason: 'Duplicate phone number in campaign audience',
        });
        continue;
      }

      seenPhones.add(normalizedPhone);

      // Personalize message body
      let personalized = template.body || '';
      const mapping = variableMapping || {};
      for (const [varKey, contactField] of Object.entries(mapping)) {
        const val = recipient[contactField as string] || '';
        personalized = personalized.replace(new RegExp(`\\{\\{${varKey}\\}\\}`, 'g'), String(val));
      }

      // Dispatch via WhatsApp API service
      const result = await whatsappService.sendTemplateMessage(
        {
          to: normalizedPhone,
          templateName: template.name,
          languageCode: template.language || 'en_US',
        },
        credentials
      );

      if (result.success) {
        sent++;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'sent',
          whatsappMessageId: result.messageId,
          personalizedBody: personalized,
          sentAt: new Date().toISOString(),
        });
      } else {
        failed++;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'failed',
          failureReason: result.error || 'Meta dispatch rejected',
          personalizedBody: personalized,
          failedAt: new Date().toISOString(),
        });
      }
    }

    return res.json({
      success: true,
      campaignName,
      summary: {
        totalAudience: recipients.length,
        eligibleProcessed: sent + failed,
        sent,
        delivered: sent, // Mock/optimistic or will update via status webhook
        failed,
        skipped,
      },
      recipients: processedRecipients,
    });
  } catch (err: any) {
    console.error('[Send Broadcast Error]', err);
    return res.status(500).json({ error: err?.message || 'Broadcast processing failed' });
  }
});

/**
 * Incoming message simulator for testing in development/preview
 */
apiRouter.post('/webhook/simulate', (req: Request, res: Response) => {
  try {
    const { fromPhone, text, rules, isFirstMessage, businessHours } = req.body;

    const consent = evaluateMessageConsentCommands(text);
    let autoReply: string | null = null;
    let matchedRuleName: string | null = null;
    let setStatus: 'Open' | 'Closed' | undefined;

    if (consent.isOptOutCommand) {
      autoReply = consent.suggestedReply || 'You have been unsubscribed.';
      matchedRuleName = 'System: Consent Opt-Out Policy';
    } else if (consent.isOptInCommand) {
      autoReply = consent.suggestedReply || 'You have been subscribed.';
      matchedRuleName = 'System: Consent Opt-In Policy';
    } else if (rules && Array.isArray(rules)) {
      const match = evaluateAutomationRules(rules as AutomationRule[], {
        messageBody: text,
        isFirstMessage: Boolean(isFirstMessage),
        businessHours,
        currentDate: new Date(),
      });

      if (match) {
        autoReply = match.responseBody || (match.templateId ? `[Template: ${match.templateId}]` : null);
        matchedRuleName = match.matchedRule.name;
        setStatus = match.setConversationStatus;
      }
    }

    return res.json({
      success: true,
      senderPhone: fromPhone,
      text,
      consent,
      autoReply,
      matchedRuleName,
      setStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
