import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  Send,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import { Badge } from '../common/Badge.tsx';
import type { Contact, MessageTemplate } from '../../types/index.ts';
import { dataStore } from '../../services/dataStore.ts';
import {
  ensureConversationForContact,
  isConversationWindowOpen,
} from '../../services/contactMessagingService.ts';
import {
  getContactDisplayName,
  normalizePhoneNumber,
} from '../../utils/phoneUtils.ts';
import { resolveContactField } from '../../utils/customFields.ts';

export interface ContactMessagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  onSent?: () => void;
}

type SendMode = 'text' | 'template';

function extractTemplateVariables(template?: MessageTemplate | null): string[] {
  if (!template) return [];
  if (Array.isArray(template.variables) && template.variables.length > 0) {
    const variables = template.variables.map((value: string) => String(value));
    return Array.from(new Set<string>(variables)).sort((a, b) => Number(a) - Number(b));
  }

  const matches = Array.from((template.body || '').matchAll(/\{\{(\d+)\}\}/g));
  const variables = matches.map((match) => String(match[1]));
  return Array.from(new Set<string>(variables)).sort((a, b) => Number(a) - Number(b));
}

function templateCategoryToCampaignType(template: MessageTemplate): 'Marketing' | 'Utility' {
  return template.category === 'Utility' ? 'Utility' : 'Marketing';
}

function getExclusionReason(contact: Contact, template: MessageTemplate): string | null {
  const normalized = normalizePhoneNumber(contact.phone || '');
  if (!normalized.isValid) return 'Invalid phone number';
  if (contact.status === 'Blocked') return 'Blocked';
  if (contact.status === 'Invalid') return 'Invalid contact';
  if (contact.optOut || contact.status === 'Opted Out') return 'Opted out';

  if (template.category === 'Marketing' && !contact.marketingOptIn) {
    return 'No marketing consent';
  }

  if (template.category === 'Utility' && !contact.transactionalOptIn) {
    return 'No transactional consent';
  }

  return null;
}

export const ContactMessagingModal: React.FC<ContactMessagingModalProps> = ({
  isOpen,
  onClose,
  contacts,
  onSent,
}) => {
  const [sendMode, setSendMode] = useState<SendMode>('template');
  const [text, setText] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variableMappings, setVariableMappings] = useState<Record<string, string>>({});
  const [variableFallbacks, setVariableFallbacks] = useState<Record<string, string>>({});
  const [previewContactId, setPreviewContactId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isSingle = contacts.length === 1;
  const singleContact = isSingle ? contacts[0] : null;

  const activeClient = dataStore.getActiveClient();
  const customFieldDefs = activeClient?.customContactFields || [];

  const approvedTemplates = useMemo(
    () =>
      dataStore
        .getClientTemplates()
        .filter(
          (template) =>
            template.status === 'Approved' &&
            (template.category === 'Marketing' || template.category === 'Utility')
        ),
    [isOpen, contacts.length, dataStore.activeClientId]
  );

  const existingConversation = useMemo(() => {
    if (!singleContact) return null;
    return (
      dataStore.conversations.find(
        (conv) =>
          conv.clientId === singleContact.clientId &&
          (conv.contactId === singleContact.id ||
            normalizePhoneNumber(conv.contactPhone || '').normalized ===
              normalizePhoneNumber(singleContact.phone || '').normalized)
      ) || null
    );
  }, [singleContact, isOpen]);

  const serviceWindowOpen = isConversationWindowOpen(existingConversation);

  useEffect(() => {
    if (!isOpen) return;

    setText('');
    setSelectedTemplateId('');
    setVariableMappings({});
    setVariableFallbacks({});
    setPreviewContactId(contacts[0]?.id || '');
    setError('');
    setIsSubmitting(false);
    setSendMode(isSingle && serviceWindowOpen ? 'text' : 'template');
  }, [isOpen, isSingle, serviceWindowOpen, contacts]);

  const selectedTemplate =
    approvedTemplates.find((template) => template.id === selectedTemplateId) || null;

  const templateVariables = useMemo(
    () => extractTemplateVariables(selectedTemplate),
    [selectedTemplate]
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setVariableMappings({});
      setVariableFallbacks({});
      return;
    }

    const mappings: Record<string, string> = {};
    const fallbacks: Record<string, string> = {};

    extractTemplateVariables(selectedTemplate).forEach((variable, index) => {
      if (index === 0) mappings[variable] = 'firstName';
      else if (index === 1) mappings[variable] = 'company';
      else mappings[variable] = 'firstName';
      fallbacks[variable] = '';
    });

    setVariableMappings(mappings);
    setVariableFallbacks(fallbacks);
  }, [selectedTemplateId]);

  const previewContact =
    contacts.find((contact) => contact.id === previewContactId) || contacts[0] || null;

  const resolveVariables = (contact: Contact): Record<string, string> => {
    const resolved: Record<string, string> = {};

    templateVariables.forEach((variable) => {
      const mapping = variableMappings[variable] || 'firstName';
      const directValue = resolveContactField(contact, mapping).trim();
      const fallback = (variableFallbacks[variable] || '').trim();
      resolved[variable] = directValue || fallback;
    });

    return resolved;
  };

  const previewBody = useMemo(() => {
    if (!selectedTemplate || !previewContact) return selectedTemplate?.body || '';

    let body = selectedTemplate.body || '';
    const resolved = resolveVariables(previewContact);

    for (const [variable, value] of Object.entries(resolved)) {
      body = body.replace(new RegExp(`\\{\\{${variable}\\}\\}`, 'g'), value);
    }

    return body;
  }, [
    selectedTemplate,
    previewContact,
    templateVariables.join('|'),
    JSON.stringify(variableMappings),
    JSON.stringify(variableFallbacks),
  ]);

  const eligibility = useMemo(() => {
    if (!selectedTemplate) {
      return {
        eligible: [] as Contact[],
        excluded: [] as Array<{ contact: Contact; reason: string }>,
      };
    }

    const eligible: Contact[] = [];
    const excluded: Array<{ contact: Contact; reason: string }> = [];

    contacts.forEach((contact) => {
      const reason = getExclusionReason(contact, selectedTemplate);
      if (reason) excluded.push({ contact, reason });
      else eligible.push(contact);
    });

    return { eligible, excluded };
  }, [contacts, selectedTemplate]);

  const missingVariableWarnings = useMemo(() => {
    if (!selectedTemplate || templateVariables.length === 0) return [];

    return templateVariables
      .map((variable) => {
        const mapping = variableMappings[variable] || 'firstName';
        const fallback = (variableFallbacks[variable] || '').trim();
        if (fallback) return null;

        const missing = eligibility.eligible.filter(
          (contact) => !resolveContactField(contact, mapping).trim()
        ).length;

        if (missing === 0) return null;

        const customKey = mapping.startsWith('custom:') ? mapping.slice(7) : '';
        const customDef = customFieldDefs.find((field) => field.key === customKey);
        const label =
          customDef?.label ||
          ({
            firstName: 'First Name',
            lastName: 'Last Name',
            fullName: 'Full Name',
            company: 'Company',
            phone: 'Phone',
            email: 'Email',
          } as Record<string, string>)[mapping] ||
          mapping;

        return `${missing} eligible contact(s) are missing "${label}" for {{${variable}}}. Add a fallback value.`;
      })
      .filter(Boolean) as string[];
  }, [
    selectedTemplate,
    templateVariables.join('|'),
    JSON.stringify(variableMappings),
    JSON.stringify(variableFallbacks),
    eligibility.eligible,
    customFieldDefs,
  ]);

  const handleSendText = async () => {
    if (!singleContact) return;
    if (!text.trim()) {
      setError('Enter a message before sending.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      const conversation = ensureConversationForContact(singleContact);
      await dataStore.sendManualMessage(conversation.id, text.trim());
      onSent?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Unable to send message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendTemplate = async () => {
    if (!selectedTemplate) {
      setError('Choose an approved WhatsApp template.');
      return;
    }

    if (missingVariableWarnings.length > 0) {
      setError('Some required template values are blank. Add fallback values before sending.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      if (isSingle && singleContact) {
        const exclusion = getExclusionReason(singleContact, selectedTemplate);
        if (exclusion) {
          throw new Error(`This contact cannot receive this template: ${exclusion}.`);
        }

        const conversation = ensureConversationForContact(singleContact);
        await dataStore.sendManualTemplateMessage(
          conversation.id,
          selectedTemplate,
          resolveVariables(singleContact)
        );

        onSent?.();
        onClose();
        return;
      }

      if (eligibility.eligible.length === 0) {
        throw new Error('None of the selected contacts are eligible for this template.');
      }

      const now = new Date();
      const connection = dataStore.getClientWhatsAppConnection();
      const isConnected = connection?.connectionStatus === 'Connected';

      await dataStore.createAndSendCampaign({
        name: `Quick Broadcast - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        campaignType: templateCategoryToCampaignType(selectedTemplate),
        templateId: selectedTemplate.id,
        audienceType: 'contacts',
        targetGroups: [],
        targetContacts: contacts.map((contact) => contact.id),
        targetContactIds: contacts.map((contact) => contact.id),
        eligibleContactIds: eligibility.eligible.map((contact) => contact.id),
        excludedRecipients: eligibility.excluded.map(({ contact, reason }) => ({
          contactId: contact.id,
          name: getContactDisplayName(contact),
          phone: contact.phone,
          reason,
        })),
        variableMapping: variableMappings,
        variableFallbacks,
        isDemo: !isConnected,
      });

      onSent?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Unable to send WhatsApp message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = isSingle
    ? `Message ${getContactDisplayName(singleContact!)}`
    : `Quick Broadcast — ${contacts.length} Contacts`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={
        isSingle
          ? 'Start or continue a WhatsApp conversation.'
          : 'Send one approved WhatsApp template to the selected contacts.'
      }
      maxWidth="2xl"
      id="contact-messaging-modal"
    >
      <div className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs flex gap-2 items-start">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isSingle && (
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm text-slate-900">
                {getContactDisplayName(singleContact!)}
              </div>
              <div className="text-xs text-slate-500 font-mono">{singleContact?.phone}</div>
            </div>
            {serviceWindowOpen ? (
              <Badge variant="emerald">24h Window Open</Badge>
            ) : (
              <Badge variant="amber">Template Required</Badge>
            )}
          </div>
        )}

        {isSingle && serviceWindowOpen && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSendMode('text')}
              className={`p-3 rounded-lg border text-left ${
                sendMode === 'text'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <MessageCircle className="w-4 h-4" />
                Send Message
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Free-form text is available because the customer messaged within the last 24 hours.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSendMode('template')}
              className={`p-3 rounded-lg border text-left ${
                sendMode === 'template'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Send className="w-4 h-4" />
                Use Template
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Send an approved template even while the service window is open.
              </p>
            </button>
          </div>
        )}

        {isSingle && !serviceWindowOpen && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Start WhatsApp Conversation</div>
              <div className="mt-1">
                This contact has not messaged this business in the last 24 hours. WhatsApp
                requires an approved template to start the conversation.
              </div>
            </div>
          </div>
        )}

        {sendMode === 'text' && isSingle && serviceWindowOpen ? (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Message
            </label>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              placeholder="Type a message..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-y focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSendText}
                disabled={isSubmitting || !text.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!isSingle && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                <div className="flex items-center gap-2 font-semibold text-emerald-900">
                  <Users className="w-4 h-4" />
                  {contacts.length} contacts selected
                </div>
                <div className="mt-1 text-emerald-800">
                  Quick Broadcast uses the existing Campaign engine, so delivery/read/failed
                  reporting continues to work normally.
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Approved Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select approved template...</option>
                {approvedTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} — {template.category}
                  </option>
                ))}
              </select>
              {approvedTemplates.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-700">
                  No approved Marketing or Utility templates are available for this Client.
                </p>
              )}
            </div>

            {selectedTemplate && (
              <>
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Approved Template Message
                    </span>
                    <Badge variant="emerald">Meta-approved text — fixed</Badge>
                  </div>
                  <div className="text-xs whitespace-pre-wrap text-slate-700 leading-relaxed">
                    {selectedTemplate.body}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    The fixed wording cannot be edited for this approved template. You can
                    change the template, variable mappings and fallback values.
                  </p>
                </div>

                {templateVariables.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-800">
                      Personalization
                    </div>

                    {templateVariables.map((variable) => (
                      <div
                        key={variable}
                        className="grid grid-cols-1 md:grid-cols-[110px_1fr_1fr] gap-2 items-center p-2.5 border border-slate-200 rounded-lg"
                      >
                        <span className="font-mono text-xs font-bold text-slate-700">
                          {'{{'}
                          {variable}
                          {'}}'}
                        </span>

                        <select
                          value={variableMappings[variable] || 'firstName'}
                          onChange={(event) =>
                            setVariableMappings((current) => ({
                              ...current,
                              [variable]: event.target.value,
                            }))
                          }
                          className="px-2.5 py-1.5 border border-slate-200 rounded-md text-xs bg-white"
                        >
                          <optgroup label="Standard Fields">
                            <option value="firstName">First Name</option>
                            <option value="lastName">Last Name</option>
                            <option value="fullName">Full Name</option>
                            <option value="company">Company</option>
                            <option value="phone">Phone</option>
                            <option value="email">Email</option>
                          </optgroup>
                          {customFieldDefs.length > 0 && (
                            <optgroup label="Custom Fields">
                              {customFieldDefs.map((field) => (
                                <option key={field.key} value={`custom:${field.key}`}>
                                  {field.label}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>

                        <input
                          type="text"
                          value={variableFallbacks[variable] || ''}
                          onChange={(event) =>
                            setVariableFallbacks((current) => ({
                              ...current,
                              [variable]: event.target.value,
                            }))
                          }
                          placeholder="Fallback if blank"
                          className="px-2.5 py-1.5 border border-slate-200 rounded-md text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {!isSingle && (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="text-[10px] uppercase font-bold text-slate-500">
                        Selected
                      </div>
                      <div className="text-lg font-bold text-slate-900">{contacts.length}</div>
                    </div>
                    <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                      <div className="text-[10px] uppercase font-bold text-emerald-700">
                        Eligible
                      </div>
                      <div className="text-lg font-bold text-emerald-800">
                        {eligibility.eligible.length}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border border-rose-200 bg-rose-50">
                      <div className="text-[10px] uppercase font-bold text-rose-700">
                        Excluded
                      </div>
                      <div className="text-lg font-bold text-rose-800">
                        {eligibility.excluded.length}
                      </div>
                    </div>
                  </div>
                )}

                {eligibility.excluded.length > 0 && !isSingle && (
                  <details className="border border-slate-200 rounded-lg">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50">
                      View excluded recipients ({eligibility.excluded.length})
                    </summary>
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {eligibility.excluded.map(({ contact, reason }) => (
                        <div
                          key={contact.id}
                          className="px-3 py-2 text-xs flex justify-between gap-3"
                        >
                          <span>
                            {getContactDisplayName(contact)}{' '}
                            <span className="text-slate-400 font-mono">{contact.phone}</span>
                          </span>
                          <span className="text-rose-700 font-semibold">{reason}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {missingVariableWarnings.length > 0 && (
                  <div className="space-y-1">
                    {missingVariableWarnings.map((warning) => (
                      <div
                        key={warning}
                        className="p-2.5 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-[11px] flex gap-2"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {warning}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isSingle && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Preview Recipient
                      </label>
                      <select
                        value={previewContact?.id || ''}
                        onChange={(event) => setPreviewContactId(event.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                      >
                        {contacts.slice(0, 50).map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {getContactDisplayName(contact)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={isSingle ? 'md:col-span-2' : ''}>
                    <div className="text-xs font-semibold text-slate-700 mb-1">
                      WhatsApp Preview
                    </div>
                    <div className="p-3 bg-[#EFEAE2] rounded-lg">
                      <div className="bg-white rounded-lg p-3 text-xs whitespace-pre-wrap shadow-2xs">
                        {previewBody}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSendTemplate}
                    disabled={
                      isSubmitting ||
                      !selectedTemplate ||
                      (!isSingle && eligibility.eligible.length === 0)
                    }
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isSubmitting
                      ? 'Sending...'
                      : isSingle
                      ? 'Send Template'
                      : `Send to ${eligibility.eligible.length} Eligible Contact${
                          eligibility.eligible.length === 1 ? '' : 's'
                        }`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
