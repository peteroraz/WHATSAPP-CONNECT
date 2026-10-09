import express, { Request, Response, Router } from 'express';
import { whatsappService } from './whatsappService.ts';
import { evaluateMessageConsentCommands } from './optOutHandler.ts';
import { evaluateAutomationRules } from './automationRunner.ts';
import { AutomationRule } from '../types/index.ts';
import { normalizePhoneNumber } from '../utils/phoneUtils.ts';

export const apiRouter: Router = express.Router();

// Middleware to parse JSON and capture rawBody buffer for HMAC signature verification
apiRouter.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

/**
 * HEALTH CHECK
 * Returns basic application status without secrets.
 * Includes whether WhatsApp configuration exists, but never returns credential values.
 */
apiRouter.get('/health', (_req: Request, res: Response) => {
  const status = whatsappService.getConfigStatus();
  return res.json({
    status: 'ok',
    app: 'WatsManager',
    version: '1.0.0',
    mode: status.configured ? 'live' : 'demo',
    timestamp: new Date().toISOString(),
    whatsapp: {
      configured: status.configured,
      status: status.status,
      connected: status.connected,
      hasAccessToken: status.hasAccessToken,
      hasPhoneNumberId: status.hasPhoneNumberId,
      hasWabaId: status.hasWabaId,
      hasWebhookVerifyToken: status.hasWebhookVerifyToken,
      hasAppSecret: status.hasAppSecret,
      apiVersion: status.apiVersion,
    },
  });
});

/**
 * WHATSAPP CONFIG STATUS
 * Non-sensitive connection status endpoint for the UI.
 */
apiRouter.get('/whatsapp/status', (_req: Request, res: Response) => {
  const status = whatsappService.getConfigStatus();
  return res.json(status);
});

/**
 * WEBHOOK VERIFICATION (GET /api/whatsapp/webhook and GET /api/webhook)
 * Reads hub.mode, hub.verify_token, hub.challenge.
 * If mode is subscribe and supplied verify token matches WHATSAPP_WEBHOOK_VERIFY_TOKEN,
 * returns the challenge with HTTP 200. Otherwise returns HTTP 403.
 */
const handleWebhookVerification = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const configuredToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'whatsflow_verify_token_prod_2025';

  if (mode === 'subscribe' && token === configuredToken) {
    console.log('[Webhook Verification] Meta challenge verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook Verification Failed] Invalid token or mode received from Meta');
  return res.status(403).send('Forbidden');
};

apiRouter.get('/whatsapp/webhook', handleWebhookVerification);
apiRouter.get('/webhook', handleWebhookVerification);

/**
 * WEBHOOK EVENTS (POST /api/whatsapp/webhook and POST /api/webhook)
 * Verify authenticity using Meta App Secret and X-Hub-Signature-256 header.
 * Reject invalid signatures.
 * Return HTTP 200 quickly so Meta does not retry unnecessarily.
 * Process business logic asynchronously.
 */
const handleWebhookPost = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    // Verify webhook signature
    const isValid = whatsappService.verifySignature(rawBody, signature);
    if (!isValid) {
      console.warn('[Webhook Signature Warning] Invalid or missing X-Hub-Signature-256 header');
      return res.status(403).json({ error: 'Invalid webhook signature' });
    }

    // Acknowledge Meta immediately with HTTP 200 OK
    res.status(200).send('EVENT_RECEIVED');

    // Asynchronous processing of incoming messages and status webhooks
    setImmediate(async () => {
      try {
        await whatsappService.processWebhook(req.body);
      } catch (err: any) {
        console.error('[Async Webhook Processing Error]:', err?.message);
      }
    });
  } catch (err: any) {
    console.error('[Webhook POST Exception]:', err?.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Server error processing webhook' });
    }
  }
};

apiRouter.post('/whatsapp/webhook', handleWebhookPost);
apiRouter.post('/webhook', handleWebhookPost);

/**
 * TEST CONNECTION (POST /api/whatsapp/test-connection)
 * Performs safe server-side API request and returns non-sensitive connection information only.
 * Never returns access token or App Secret.
 * Handles missing credentials gracefully without throwing.
 */
apiRouter.post('/whatsapp/test-connection', async (_req: Request, res: Response) => {
  try {
    const result = await whatsappService.testConnection();
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      configured: false,
      status: 'Connection Error',
      connected: false,
      error: error?.message || 'Failed to verify WhatsApp credentials safely',
    });
  }
});

/**
 * GET/SYNC TEMPLATES (GET/POST /api/whatsapp/sync-templates)
 * Synchronize approved templates from WhatsApp Business Account.
 * Returns Meta templates with status, components, and variables.
 */
const handleSyncTemplates = async (_req: Request, res: Response) => {
  try {
    const result = await whatsappService.getTemplates();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to synchronize templates from Meta',
    });
  }
};

apiRouter.get('/whatsapp/sync-templates', handleSyncTemplates);
apiRouter.post('/whatsapp/sync-templates', handleSyncTemplates);
apiRouter.get('/whatsapp/templates', handleSyncTemplates);

/**
 * SYNC AUTOMATION RULES (POST /api/whatsapp/sync-rules)
 * Updates server cached automation rules for incoming webhook evaluation.
 */
apiRouter.post('/whatsapp/sync-rules', (req: Request, res: Response) => {
  try {
    const { rules } = req.body;
    if (Array.isArray(rules)) {
      whatsappService.updateAutomationRulesCache(rules);
    }
    return res.json({ success: true, count: Array.isArray(rules) ? rules.length : 0 });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

/**
 * GET WEBHOOK EVENTS (GET /api/whatsapp/events)
 * Allows the React UI to synchronize recent incoming messages and status webhooks in real-time.
 */
apiRouter.get('/whatsapp/events', (req: Request, res: Response) => {
  const since = req.query.since as string | undefined;
  const events = whatsappService.getEventsSince(since);
  return res.json({ success: true, events });
});

/**
 * DIAGNOSTIC OUTBOUND TEST (POST /api/whatsapp/test-send-hello-world)
 * Executes official Meta hello_world template test strictly server-side.
 * Returns structured diagnostics panel payload:
 * - Request endpoint (without secrets)
 * - HTTP status
 * - Recipient number (normalized)
 * - Phone Number ID
 * - API version
 * - Meta wamid if successful
 * - Meta error code if failed
 * - Meta error subcode if present
 * - Meta error message
 * - fbtrace_id if supplied
 */
apiRouter.post('/whatsapp/test-send-hello-world', async (req: Request, res: Response) => {
  try {
    const { recipientPhone } = req.body;
    if (!recipientPhone) {
      return res.status(400).json({
        success: false,
        httpStatus: 400,
        errorMessage: 'Recipient phone number is required.',
      });
    }

    const result = await whatsappService.sendHelloWorldTest(recipientPhone);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      httpStatus: 500,
      errorMessage: err?.message || 'Server error processing hello_world diagnostic send',
    });
  }
});

/**
 * DISPATCH LIVE OR DEMO MESSAGE (POST /api/whatsapp/send-message)
 * Live text messaging enforces 24h customer window. Outside window requires template.
 */
apiRouter.post('/whatsapp/send-message', async (req: Request, res: Response) => {
  try {
    const { to, messageType, body, templateName, languageCode, components, outsideCustomerWindow } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Recipient phone number is required' });
    }

    // Normalize recipient phone: remove +, spaces, dashes, punctuation
    const normalizedTo = String(to).replace(/\D/g, '');
    if (!normalizedTo) {
      return res.status(400).json({ error: 'Recipient phone number contains no valid digits' });
    }

    const { configured } = whatsappService.getCredentials();

    // In Live Mode: Enforce 24-hour customer window for free-form text messages
    if (configured && messageType === 'text' && outsideCustomerWindow) {
      return res.status(400).json({
        success: false,
        error:
          'Outside 24-hour customer service window: Meta WhatsApp Business Cloud API requires an approved template message to contact customers after 24 hours of inactivity.',
      });
    }

    if (messageType === 'template') {
      if (!templateName) {
        return res.status(400).json({ error: 'Template name is required for template messages' });
      }
      const result = await whatsappService.sendTemplateMessage({
        to: normalizedTo,
        templateName,
        languageCode: languageCode || 'en_US',
        components,
      });
      return res.json(result);
    }

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Message body cannot be empty' });
    }

    const result = await whatsappService.sendTextMessage({ to: normalizedTo, body: body.trim() });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Server error dispatching WhatsApp message',
    });
  }
});

/**
 * SERVER-SIDE BROADCAST PROCESSOR (POST /api/whatsapp/send-broadcast)
 * Enforces:
 *  - Opt-in eligibility
 *  - Normalized phone validation
 *  - Opt-out exclusion
 *  - Blocked/invalid contact exclusion
 *  - Recipient deduplication
 *  - Only APPROVED templates in Live Mode
 *  - Saves returned Meta wamid
 *  - Initial status is 'sent', not delivered or read
 */
apiRouter.post('/whatsapp/send-broadcast', async (req: Request, res: Response) => {
  try {
    const { campaignName, template, recipients, variableMapping, variableFallbacks, isLiveMode } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided for broadcast' });
    }

    if (!template || !template.name) {
      return res.status(400).json({ error: 'A valid template is required for broadcasts' });
    }

    const { configured } = whatsappService.getCredentials();
    const isLive = Boolean(isLiveMode && configured);

    // Rule: In Live Mode, only APPROVED templates may be sent live
    if (isLive) {
      const templateStatus = (template.status || '').toUpperCase();
      if (templateStatus !== 'APPROVED') {
        return res.status(400).json({
          error: `Template "${template.name}" has status "${template.status}". Only APPROVED Meta templates may be dispatched in Live Mode.`,
        });
      }
    }

    const processedRecipients: any[] = [];
    const seenPhones = new Set<string>();

    let submitted = 0;
    let skipped = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const phoneNorm = normalizePhoneNumber(recipient.phone || '');
      const normalizedPhone = phoneNorm.isValid ? phoneNorm.normalized.replace(/\D/g, '') : (recipient.phone || '').replace(/\D/g, '');

      // Check 1: Blocked or Invalid contact status
      if (recipient.status === 'Blocked' || recipient.status === 'Invalid' || !phoneNorm.isValid) {
        skipped++;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          normalizedPhone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'skipped',
          failureReason: !phoneNorm.isValid ? 'Invalid phone number format' : `Contact status is ${recipient.status}`,
        });
        continue;
      }

      // Check 2: Opt-out exclusion
      if (recipient.optOut === true || recipient.status === 'Opted Out') {
        skipped++;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          normalizedPhone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'skipped',
          failureReason: 'Contact has opted out of messaging',
        });
        continue;
      }

      // Check 3: Consent eligibility based on category
      const isMarketing = template.category === 'Marketing';
      if (isMarketing && recipient.marketingOptIn !== true) {
        skipped++;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          normalizedPhone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'skipped',
          failureReason: 'Missing explicit marketing opt-in consent',
        });
        continue;
      }

      // Check 4: Recipient deduplication
      if (seenPhones.has(normalizedPhone)) {
        skipped++;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          normalizedPhone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'skipped',
          failureReason: 'Duplicate phone number in broadcast audience',
        });
        continue;
      }
      seenPhones.add(normalizedPhone);

      // Render personalized body and components with fallbacks
      let personalized = template.body || '';
      const resolvedVariables: Record<string, string> = {};
      const mapping = variableMapping || {};
      const fallbacks = variableFallbacks || {};

      for (const [varNum, contactField] of Object.entries(mapping)) {
        const rawVal = recipient[contactField as string];
        const hasVal = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '';
        const fallback = fallbacks[varNum]?.trim() || '';
        const finalVal = hasVal ? String(rawVal).trim() : fallback;

        resolvedVariables[varNum] = finalVal;
        personalized = personalized.replace(new RegExp(`\\{\\{${varNum}\\}\\}`, 'g'), finalVal);
      }

      // Build parameters array for Meta template if variables exist
      const templateParameters = Object.keys(resolvedVariables)
        .sort((a, b) => Number(a) - Number(b))
        .map((num) => ({
          type: 'text' as const,
          text: resolvedVariables[num] || '',
        }));

      const components =
        templateParameters.length > 0
          ? [
              {
                type: 'body' as const,
                parameters: templateParameters,
              },
            ]
          : undefined;

      // Dispatch via Meta Cloud API or Demo simulator
      if (isLive) {
        const result = await whatsappService.sendTemplateMessage({
          to: normalizedPhone,
          templateName: template.name,
          languageCode: template.language || 'en_US',
          components,
        });

        if (result.success) {
          submitted++;
          processedRecipients.push({
            contactId: recipient.id,
            phone: recipient.phone,
            normalizedPhone,
            contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
            status: 'sent', // Initially 'sent' - delivery/read come from actual Meta webhooks
            whatsappMessageId: result.messageId,
            personalizedBody: personalized,
            variableValues: resolvedVariables,
            sentAt: new Date().toISOString(),
          });
        } else {
          failed++;
          processedRecipients.push({
            contactId: recipient.id,
            phone: recipient.phone,
            normalizedPhone,
            contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
            status: 'failed',
            failureReason: result.error || 'Meta API rejected dispatch',
            personalizedBody: personalized,
            variableValues: resolvedVariables,
            failedAt: new Date().toISOString(),
          });
        }
      } else {
        // Demo Mode: simulate dispatch
        submitted++;
        const mockWamid = `wamid.demo.broadcast.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
        processedRecipients.push({
          contactId: recipient.id,
          phone: recipient.phone,
          normalizedPhone,
          contactName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Customer',
          status: 'sent',
          whatsappMessageId: mockWamid,
          personalizedBody: personalized,
          variableValues: resolvedVariables,
          sentAt: new Date().toISOString(),
        });
      }
    }

    return res.json({
      success: true,
      campaignName,
      isLiveMode: isLive,
      summary: {
        totalAudience: recipients.length,
        eligibleProcessed: submitted + failed,
        sent: submitted,
        delivered: isLive ? 0 : submitted, // In live mode, delivered comes from webhook!
        read: 0,
        failed,
        skipped,
      },
      recipients: processedRecipients,
    });
  } catch (err: any) {
    console.error('[Send Broadcast Error]', err);
    return res.status(500).json({ error: err?.message || 'Server broadcast processing failed' });
  }
});

/**
 * INBOUND SIMULATOR (POST /api/webhook/simulate)
 * Preserves development/demo test sandbox functionality.
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
