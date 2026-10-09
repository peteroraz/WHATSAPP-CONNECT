import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Modal } from '../common/Modal.tsx';
import { 
  Send, 
  Users, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  Eye,
  Info,
  ChevronDown,
  ChevronUp,
  XCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { Contact, ContactGroup, MessageTemplate, CampaignType } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { normalizePhoneNumber } from '../../utils/phoneUtils.ts';

export interface DraftCampaignState {
  campaignName: string;
  campaignType: CampaignType;
  audienceStrategy: 'groups' | 'contacts' | 'all';
  selectedGroupIds: string[];
  selectedContactIds: string[];
  selectedTemplateId: string;
  selectedTemplateName: string;
  selectedTemplateCategory: string;
  variableMappings: Record<string, string>;
  variableFallbacks: Record<string, string>;
  targetContactIds: string[];
  eligibleContactIds: string[];
  excludedRecipients: Array<{ contactId: string; name: string; phone: string; reason: string }>;
}

export interface NewBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  groups: ContactGroup[];
  templates: MessageTemplate[];
  isWhatsAppConnected?: boolean;
  onLaunchCampaign: (data: {
    name: string;
    campaignType: CampaignType;
    templateId: string;
    audienceType: 'groups' | 'contacts' | 'all';
    targetGroups: string[];
    targetContacts: string[];
    variableMapping: Record<string, string>;
    variableFallbacks: Record<string, string>;
    targetContactIds: string[];
    eligibleContactIds: string[];
    excludedRecipients: Array<{ contactId: string; name: string; phone: string; reason: string }>;
    isDemo: boolean;
  }) => Promise<any>;
}

export const NewBroadcastModal: React.FC<NewBroadcastModalProps> = ({
  isOpen,
  onClose,
  contacts,
  groups,
  templates,
  isWhatsAppConnected = false,
  onLaunchCampaign,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [draft, setDraft] = useState<DraftCampaignState>(() => ({
    campaignName: '',
    campaignType: 'Marketing',
    audienceStrategy: 'groups',
    selectedGroupIds: [],
    selectedContactIds: [],
    selectedTemplateId: '',
    selectedTemplateName: '',
    selectedTemplateCategory: 'Marketing',
    variableMappings: {},
    variableFallbacks: {},
    targetContactIds: [],
    eligibleContactIds: [],
    excludedRecipients: [],
  }));

  const [previewContactId, setPreviewContactId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showExcludedInStep2, setShowExcludedInStep2] = useState(false);
  const [showEligibleInReview, setShowEligibleInReview] = useState(false);
  const [showExcludedInReview, setShowExcludedInReview] = useState(false);

  // Initialize draft ONCE per opening modal - never reset during step navigation!
  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setStep(1);
      const initialGroups = groups.length > 0 ? [groups[0].name] : [];
      setDraft({
        campaignName: `Broadcast ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        campaignType: 'Marketing',
        audienceStrategy: 'groups',
        selectedGroupIds: initialGroups,
        selectedContactIds: [],
        selectedTemplateId: '',
        selectedTemplateName: '',
        selectedTemplateCategory: 'Marketing',
        variableMappings: {},
        variableFallbacks: {},
        targetContactIds: [],
        eligibleContactIds: [],
        excludedRecipients: [],
      });
      setError('');
      setIsSubmitting(false);
      setShowExcludedInStep2(false);
      setShowEligibleInReview(false);
      setShowExcludedInReview(false);
      setPreviewContactId('');
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, groups]);

  // Selected template object
  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === draft.selectedTemplateId) || null;
  }, [templates, draft.selectedTemplateId]);

  // Approved templates filtered by the selected Campaign Type
  const eligibleTemplates = useMemo(() => {
    return templates.filter(
      (t) => t.status === 'Approved' && t.category === draft.campaignType
    );
  }, [templates, draft.campaignType]);

  // Extract variables from template body (e.g. {{1}}, {{2}})
  const templateVariables = useMemo(() => {
    if (!selectedTemplate) return [];
    if (selectedTemplate.variables && selectedTemplate.variables.length > 0) {
      return selectedTemplate.variables.map(String);
    }
    const matches = Array.from(selectedTemplate.body.matchAll(/\{\{(\d+)\}\}/g));
    const nums = Array.from(new Set(matches.map((m) => m[1]))).sort();
    return nums;
  }, [selectedTemplate]);

  // Dynamic audience calculation & compliance evaluation
  const audience = useMemo(() => {
    let raw: Contact[] = [];
    if (draft.audienceStrategy === 'all') {
      raw = [...contacts];
    } else if (draft.audienceStrategy === 'groups') {
      raw = contacts.filter((c) => c.groups.some((g) => draft.selectedGroupIds.includes(g)));
    } else {
      raw = contacts.filter((c) => draft.selectedContactIds.includes(c.id));
    }

    // Deduplicate by Contact ID AND normalized phone number
    const deduplicatedRaw: Contact[] = [];
    const seenContactIds = new Set<string>();
    const seenPhones = new Set<string>();

    for (const c of raw) {
      if (seenContactIds.has(c.id)) continue;
      const norm = normalizePhoneNumber(c.phone || '');
      const phoneKey = norm.isValid ? norm.normalized : (c.phone || '').replace(/\D/g, '');
      if (phoneKey && seenPhones.has(phoneKey)) continue;

      seenContactIds.add(c.id);
      if (phoneKey) seenPhones.add(phoneKey);
      deduplicatedRaw.push(c);
    }

    const eligible: Contact[] = [];
    const excluded: Array<{ contactId: string; name: string; phone: string; reason: string }> = [];

    for (const c of deduplicatedRaw) {
      const norm = normalizePhoneNumber(c.phone || '');
      const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed Contact';

      if (!norm.isValid) {
        excluded.push({
          contactId: c.id,
          name: fullName,
          phone: c.phone || 'N/A',
          reason: 'Invalid Phone Number',
        });
        continue;
      }

      if (c.status === 'Opted Out' || c.optOut) {
        excluded.push({
          contactId: c.id,
          name: fullName,
          phone: c.phone,
          reason: 'Opted Out',
        });
        continue;
      }

      if (c.status && c.status !== 'Active') {
        excluded.push({
          contactId: c.id,
          name: fullName,
          phone: c.phone,
          reason: `Status: ${c.status}`,
        });
        continue;
      }

      if (draft.campaignType === 'Marketing') {
        if (!c.marketingOptIn) {
          excluded.push({
            contactId: c.id,
            name: fullName,
            phone: c.phone,
            reason: 'No Marketing Consent',
          });
          continue;
        }
      } else {
        // Utility campaign
        if (!c.transactionalOptIn) {
          excluded.push({
            contactId: c.id,
            name: fullName,
            phone: c.phone,
            reason: 'No Transactional Consent',
          });
          continue;
        }
      }

      eligible.push(c);
    }

    return {
      raw: deduplicatedRaw,
      eligible,
      excluded,
    };
  }, [contacts, draft.audienceStrategy, draft.selectedGroupIds, draft.selectedContactIds, draft.campaignType]);

  // When changing campaign type in Step 1, reset template if category mismatched
  const handleCampaignTypeChange = (type: CampaignType) => {
    setDraft((prev) => {
      const isTemplateMatch = templates.some(
        (t) => t.id === prev.selectedTemplateId && t.status === 'Approved' && t.category === type
      );
      return {
        ...prev,
        campaignType: type,
        selectedTemplateId: isTemplateMatch ? prev.selectedTemplateId : '',
        selectedTemplateName: isTemplateMatch ? prev.selectedTemplateName : '',
        selectedTemplateCategory: type,
      };
    });
  };

  // When selecting a template in Step 3
  const handleTemplateSelect = (t: MessageTemplate) => {
    const defaultMappings: Record<string, string> = {};
    const defaultFallbacks: Record<string, string> = {};

    const matches = Array.from(t.body.matchAll(/\{\{(\d+)\}\}/g));
    const nums = Array.from(new Set(matches.map((m) => m[1]))).sort();

    nums.forEach((num) => {
      if (num === '1') defaultMappings[num] = 'firstName';
      else if (num === '2') defaultMappings[num] = 'company';
      else if (num === '3') defaultMappings[num] = 'phone';
      else defaultMappings[num] = 'firstName';

      defaultFallbacks[num] = num === '2' ? 'our organization' : '';
    });

    setDraft((prev) => ({
      ...prev,
      selectedTemplateId: t.id,
      selectedTemplateName: t.name,
      selectedTemplateCategory: t.category,
      variableMappings: { ...defaultMappings, ...prev.variableMappings },
      variableFallbacks: { ...defaultFallbacks, ...prev.variableFallbacks },
    }));
  };

  // Preview contact resolution
  const previewContact = useMemo(() => {
    if (previewContactId) {
      const found = contacts.find((c) => c.id === previewContactId);
      if (found) return found;
    }
    return audience.eligible[0] || contacts[0] || null;
  }, [previewContactId, contacts, audience.eligible]);

  // Render template body for live preview
  const previewBody = useMemo(() => {
    if (!selectedTemplate) return '';
    let text = selectedTemplate.body;
    if (!previewContact) return text;

    templateVariables.forEach((varNum) => {
      const fieldKey = draft.variableMappings[varNum] || 'firstName';
      const contactVal = (previewContact as any)[fieldKey];
      const hasVal = contactVal !== undefined && contactVal !== null && String(contactVal).trim() !== '';
      const fallbackVal = draft.variableFallbacks?.[varNum]?.trim() || '';
      const resolved = hasVal ? String(contactVal).trim() : fallbackVal;

      text = text.replace(new RegExp(`\\{\\{${varNum}\\}\\}`, 'g'), resolved);
    });

    return text;
  }, [selectedTemplate, templateVariables, draft.variableMappings, draft.variableFallbacks, previewContact]);

  // Missing variable warnings
  const missingVariableWarnings = useMemo(() => {
    if (!selectedTemplate || templateVariables.length === 0) return [];
    const warnings: string[] = [];

    templateVariables.forEach((varNum) => {
      const fieldKey = draft.variableMappings[varNum] || 'firstName';
      const fallback = draft.variableFallbacks?.[varNum]?.trim();

      if (!fallback) {
        const missingCount = audience.eligible.filter((c) => {
          const val = (c as any)[fieldKey];
          return val === undefined || val === null || String(val).trim() === '';
        }).length;

        if (missingCount > 0) {
          warnings.push(
            `${missingCount} eligible contact(s) lack a "${fieldKey}" value for variable {{${varNum}}}. Add a fallback value or this placeholder will be empty.`
          );
        }
      }
    });

    return warnings;
  }, [selectedTemplate, templateVariables, draft.variableMappings, draft.variableFallbacks, audience.eligible]);

  // Navigation handlers
  const handleNext = () => {
    setError('');

    if (step === 1) {
      if (!draft.campaignName.trim()) {
        setError('Please enter a campaign name.');
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (audience.raw.length === 0) {
        setError('No contacts found in the selected audience scope.');
        return;
      }
      if (audience.eligible.length === 0) {
        setError(`No eligible contacts found. None of the ${audience.raw.length} contacts have consent for a ${draft.campaignType} campaign.`);
        return;
      }

      // Persist audience details into draft
      setDraft((prev) => ({
        ...prev,
        targetContactIds: audience.raw.map((c) => c.id),
        eligibleContactIds: audience.eligible.map((c) => c.id),
        excludedRecipients: audience.excluded,
      }));

      setStep(3);
      return;
    }

    if (step === 3) {
      if (!draft.selectedTemplateId || !selectedTemplate) {
        setError(`Please select an approved ${draft.campaignType} template.`);
        return;
      }
      setStep(4);
      return;
    }

    if (step === 4) {
      setStep(5);
      return;
    }
  };

  const handleLaunch = async () => {
    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }
    if (draft.eligibleContactIds.length === 0 && audience.eligible.length === 0) {
      setError('No eligible contacts for this campaign');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const finalEligibleIds = draft.eligibleContactIds.length > 0
        ? draft.eligibleContactIds
        : audience.eligible.map((c) => c.id);

      const finalTargetIds = draft.targetContactIds.length > 0
        ? draft.targetContactIds
        : audience.raw.map((c) => c.id);

      const finalExcluded = draft.excludedRecipients.length > 0
        ? draft.excludedRecipients
        : audience.excluded;

      await onLaunchCampaign({
        name: draft.campaignName.trim(),
        campaignType: draft.campaignType,
        templateId: selectedTemplate.id,
        audienceType: draft.audienceStrategy,
        targetGroups: draft.selectedGroupIds,
        targetContacts: draft.selectedContactIds,
        variableMapping: draft.variableMappings,
        variableFallbacks: draft.variableFallbacks,
        targetContactIds: finalTargetIds,
        eligibleContactIds: finalEligibleIds,
        excludedRecipients: finalExcluded,
        isDemo: !isWhatsAppConnected,
      });

      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || 'Failed to dispatch broadcast campaign');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create WhatsApp Broadcast Campaign"
      subtitle={`Step ${step} of 5 — ${
        step === 1
          ? 'Campaign Identification & Type'
          : step === 2
          ? 'Target Audience & Compliance'
          : step === 3
          ? 'Select Approved Template'
          : step === 4
          ? 'Personalization & Variables'
          : 'Final Review & Dispatch'
      }`}
      maxWidth="2xl"
      id="new-broadcast-wizard"
    >
      <div className="space-y-5">
        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  s === step
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : s < step
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {s < step ? <Check className="w-3.5 h-3.5" /> : s}
              </span>
              <span
                className={`text-[11px] font-medium hidden sm:inline ${
                  s === step ? 'text-slate-900 font-semibold' : 'text-slate-400'
                }`}
              >
                {s === 1
                  ? 'Details'
                  : s === 2
                  ? 'Audience'
                  : s === 3
                  ? 'Template'
                  : s === 4
                  ? 'Variables'
                  : 'Review'}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
            <XCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* STEP 1: Campaign Details & Type */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Campaign Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="campaign-name-input"
                type="text"
                value={draft.campaignName}
                onChange={(e) => setDraft({ ...draft, campaignName: e.target.value })}
                placeholder="e.g. ANNUAL MEETING or VIP Product Preview"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Internal campaign label for tracking delivery, analytics, and consent audit logs.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Campaign Type <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  id="campaign-type-marketing-btn"
                  onClick={() => handleCampaignTypeChange('Marketing')}
                  className={`p-3.5 rounded-lg border text-left text-xs transition-colors ${
                    draft.campaignType === 'Marketing'
                      ? 'border-emerald-600 bg-emerald-50/70 text-slate-900 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900">Marketing</span>
                    <Badge variant="blue" size="sm">Promotional</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Product releases, promotions, offers, or newsletters. Strictly requires explicit <strong className="text-slate-700">Marketing Consent</strong>.
                  </p>
                </button>

                <button
                  type="button"
                  id="campaign-type-utility-btn"
                  onClick={() => handleCampaignTypeChange('Utility')}
                  className={`p-3.5 rounded-lg border text-left text-xs transition-colors ${
                    draft.campaignType === 'Utility'
                      ? 'border-emerald-600 bg-emerald-50/70 text-slate-900 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900">Utility</span>
                    <Badge variant="emerald" size="sm">Operational</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Order confirmations, account alerts, meeting notices, or transactional updates. Requires <strong className="text-slate-700">Transactional Opt-In</strong>.
                  </p>
                </button>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-emerald-600" />
                WhatsApp Compliance & Consent Policy
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                WatsManager automatically enforces compliance per WhatsApp Cloud API standards. Contacts who have opted out, lack the requisite consent category, or have invalid phone numbers will be automatically excluded before dispatch.
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: Audience Selection & Compliance */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Audience Selection Strategy
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, audienceStrategy: 'groups' })}
                  className={`p-3 rounded-lg border text-left text-xs font-medium transition-colors ${
                    draft.audienceStrategy === 'groups'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-semibold mb-0.5">By Contact Group</div>
                  <div className="text-[11px] text-slate-500">Segment by saved group</div>
                </button>

                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, audienceStrategy: 'all' })}
                  className={`p-3 rounded-lg border text-left text-xs font-medium transition-colors ${
                    draft.audienceStrategy === 'all'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-semibold mb-0.5">Entire Directory</div>
                  <div className="text-[11px] text-slate-500">All directory contacts</div>
                </button>

                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, audienceStrategy: 'contacts' })}
                  className={`p-3 rounded-lg border text-left text-xs font-medium transition-colors ${
                    draft.audienceStrategy === 'contacts'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-semibold mb-0.5">Individual Pick</div>
                  <div className="text-[11px] text-slate-500">Select specific contacts</div>
                </button>
              </div>
            </div>

            {draft.audienceStrategy === 'groups' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Choose Target Groups
                </label>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  {groups.length === 0 ? (
                    <span className="text-xs text-slate-400">No contact groups defined.</span>
                  ) : (
                    groups.map((g) => {
                      const isChecked = draft.selectedGroupIds.includes(g.name);
                      const groupCount = contacts.filter((c) => c.groups.includes(g.name)).length;
                      return (
                        <button
                          type="button"
                          key={g.id}
                          onClick={() => {
                            if (isChecked) {
                              setDraft({
                                ...draft,
                                selectedGroupIds: draft.selectedGroupIds.filter((x) => x !== g.name),
                              });
                            } else {
                              setDraft({
                                ...draft,
                                selectedGroupIds: [...draft.selectedGroupIds, g.name],
                              });
                            }
                          }}
                          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                            isChecked
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {g.name} ({groupCount})
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {draft.audienceStrategy === 'contacts' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Select Individual Contacts ({draft.selectedContactIds.length} chosen)
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {contacts.map((c) => {
                    const isSelected = draft.selectedContactIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          if (isSelected) {
                            setDraft({
                              ...draft,
                              selectedContactIds: draft.selectedContactIds.filter((id) => id !== c.id),
                            });
                          } else {
                            setDraft({
                              ...draft,
                              selectedContactIds: [...draft.selectedContactIds, c.id],
                            });
                          }
                        }}
                        className={`p-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50 transition-colors ${
                          isSelected ? 'bg-emerald-50/50' : ''
                        }`}
                      >
                        <div>
                          <span className="font-semibold text-slate-900">
                            {c.firstName} {c.lastName}
                          </span>
                          <span className="text-slate-400 ml-2 font-mono text-[11px]">{c.phone}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded-sm text-emerald-600 focus:ring-emerald-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Audience Eligibility Breakdown */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
              <div>
                <div className="text-[11px] text-slate-500 font-medium">Total In Scope</div>
                <div className="text-base font-bold text-slate-900">{audience.raw.length}</div>
              </div>
              <div>
                <div className="text-[11px] text-emerald-600 font-semibold">
                  Eligible ({draft.campaignType} Consented)
                </div>
                <div className="text-base font-bold text-emerald-700">{audience.eligible.length}</div>
              </div>
              <div>
                <div className="text-[11px] text-rose-600 font-semibold">Excluded / No Opt-In</div>
                <div className="text-base font-bold text-rose-700">{audience.excluded.length}</div>
              </div>
            </div>

            {/* Expandable Excluded Contacts Section */}
            {audience.excluded.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setShowExcludedInStep2(!showExcludedInStep2)}
                  className="w-full px-3 py-2 text-xs flex items-center justify-between text-slate-700 bg-slate-50 hover:bg-slate-100 font-medium"
                >
                  <span className="flex items-center gap-1.5 text-rose-700 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    View Excluded Recipients ({audience.excluded.length})
                  </span>
                  {showExcludedInStep2 ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {showExcludedInStep2 && (
                  <div className="p-3 max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {audience.excluded.map((item, idx) => (
                      <div key={idx} className="py-1.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-800">{item.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{item.phone}</div>
                        </div>
                        <Badge variant="rose" size="sm">
                          {item.reason}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Select Template */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Select Approved {draft.campaignType} Template
              </label>
              <Badge variant={draft.campaignType === 'Marketing' ? 'blue' : 'emerald'} size="sm">
                Category: {draft.campaignType}
              </Badge>
            </div>

            {eligibleTemplates.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-lg space-y-2">
                <p className="font-semibold">No approved {draft.campaignType} templates available.</p>
                <p className="text-[11px] text-slate-400">
                  Please create and approve a template under the "{draft.campaignType}" category in the Templates tab before launching.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 max-h-72 overflow-y-auto">
                {eligibleTemplates.map((t) => {
                  const isSelected = t.id === draft.selectedTemplateId;
                  return (
                    <div
                      key={t.id}
                      onClick={() => handleTemplateSelect(t)}
                      className={`p-3.5 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-xs text-slate-900 font-mono">
                          {t.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="blue" size="sm">
                            {t.category}
                          </Badge>
                          <Badge variant="emerald" size="sm">
                            Approved
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{t.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Personalization & Variables */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Variable mapping inputs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Variable Substitutions & Fallbacks
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {templateVariables.length} placeholder(s)
                  </span>
                </div>

                {templateVariables.length > 0 ? (
                  templateVariables.map((varNum) => (
                    <div key={varNum} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 font-mono">
                          Variable &#123;&#123;{varNum}&#125;&#125;
                        </span>
                        <span className="text-[10px] text-slate-400">Map to Contact Property</span>
                      </div>

                      <select
                        value={draft.variableMappings[varNum] || 'firstName'}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            variableMappings: {
                              ...draft.variableMappings,
                              [varNum]: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="firstName">Contact First Name</option>
                        <option value="lastName">Contact Last Name</option>
                        <option value="company">Company / Organization</option>
                        <option value="phone">Phone Number</option>
                        <option value="email">Email Address</option>
                      </select>

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Optional Fallback (if contact field is blank)
                        </label>
                        <input
                          type="text"
                          value={draft.variableFallbacks[varNum] || ''}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              variableFallbacks: {
                                ...draft.variableFallbacks,
                                [varNum]: e.target.value,
                              },
                            })
                          }
                          placeholder={varNum === '2' ? 'e.g. our team' : 'e.g. valued customer'}
                          className="w-full px-2.5 py-1 border border-slate-200 rounded-md text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    This template does not contain dynamic variable placeholders (e.g. &#123;&#123;1&#125;&#125;).
                  </p>
                )}

                {/* Missing variable warnings */}
                {missingVariableWarnings.length > 0 && (
                  <div className="space-y-1">
                    {missingVariableWarnings.map((w, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-md flex items-start gap-2"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
                        <div>{w}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live WhatsApp Message Bubble Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    Live WhatsApp Preview
                  </label>

                  {audience.eligible.length > 0 && (
                    <select
                      value={previewContactId || (previewContact?.id || '')}
                      onChange={(e) => setPreviewContactId(e.target.value)}
                      className="text-[11px] px-2 py-0.5 border border-slate-200 rounded-md bg-white text-slate-700"
                    >
                      {audience.eligible.slice(0, 15).map((c) => (
                        <option key={c.id} value={c.id}>
                          Preview as {c.firstName} {c.lastName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="p-4 bg-[#EFEAE2] rounded-xl border border-slate-200 min-h-[220px] flex items-end">
                  <div className="bg-white rounded-lg p-3 shadow-2xs max-w-sm text-xs text-slate-800 space-y-1.5 w-full">
                    {selectedTemplate?.header && (
                      <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
                        {selectedTemplate.header}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap leading-relaxed">{previewBody}</div>
                    {selectedTemplate?.footer && (
                      <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-100">
                        {selectedTemplate.footer}
                      </div>
                    )}
                    <div className="text-[9px] text-slate-400 text-right">12:00 PM ✓✓</div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 italic">
                  Live preview reflects personalized substitutions using {previewContact?.firstName}'s actual contact record.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Final Review & Confirmation */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Campaign Name:</span>
                <span className="font-semibold text-slate-900">{draft.campaignName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Campaign Type:</span>
                <Badge variant={draft.campaignType === 'Marketing' ? 'blue' : 'emerald'} size="sm">
                  {draft.campaignType}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Selected Template:</span>
                <span className="font-mono font-medium text-slate-900">
                  {selectedTemplate?.name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Audience Strategy:</span>
                <span className="capitalize text-slate-800 font-medium">
                  {draft.audienceStrategy}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                <span className="text-slate-600 font-medium">Target Contacts Selected:</span>
                <span className="font-bold text-slate-900">
                  {draft.targetContactIds.length || audience.raw.length}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-emerald-700 font-medium">Eligible To Receive:</span>
                <span className="font-bold text-emerald-700 text-sm">
                  {draft.eligibleContactIds.length || audience.eligible.length}
                </span>
              </div>

              {(draft.excludedRecipients.length > 0 || audience.excluded.length > 0) && (
                <div className="flex justify-between items-center text-rose-600">
                  <span>Excluded (No Consent / Opted Out):</span>
                  <span className="font-bold">
                    {draft.excludedRecipients.length || audience.excluded.length}
                  </span>
                </div>
              )}
            </div>

            {/* Expandable recipients view buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEligibleInReview(!showEligibleInReview)}
                className="flex-1 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md text-xs font-medium flex items-center justify-center gap-1"
              >
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                {showEligibleInReview ? 'Hide Eligible Contacts' : `View Eligible Contacts (${draft.eligibleContactIds.length || audience.eligible.length})`}
              </button>

              {(draft.excludedRecipients.length > 0 || audience.excluded.length > 0) && (
                <button
                  type="button"
                  onClick={() => setShowExcludedInReview(!showExcludedInReview)}
                  className="flex-1 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md text-xs font-medium flex items-center justify-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  {showExcludedInReview ? 'Hide Excluded Contacts' : `View Excluded Contacts (${draft.excludedRecipients.length || audience.excluded.length})`}
                </button>
              )}
            </div>

            {showEligibleInReview && (
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white text-xs divide-y divide-slate-100">
                {audience.eligible.map((c) => (
                  <div key={c.id} className="py-1 flex items-center justify-between">
                    <span className="font-medium text-slate-800">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">{c.phone}</span>
                  </div>
                ))}
              </div>
            )}

            {showExcludedInReview && (
              <div className="max-h-40 overflow-y-auto border border-rose-200 rounded-lg p-2 bg-rose-50/50 text-xs divide-y divide-rose-100">
                {audience.excluded.map((c, idx) => (
                  <div key={idx} className="py-1 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-800">{c.name}</span>
                      <span className="text-slate-400 font-mono text-[11px] ml-2">{c.phone}</span>
                    </div>
                    <Badge variant="rose" size="sm">{c.reason}</Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Compliance Confirmation notice: Depends on Demo mode vs Live connected */}
            {isWhatsAppConnected ? (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold">Confirmation Required:</span> Dispatched messages will
                  be processed through Meta's WhatsApp Cloud API. Recipients without active consent
                  have been automatically excluded to guarantee compliance.
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-lg flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                <div>
                  <span className="font-bold">Demo Campaign:</span> This campaign will be simulated.
                  No WhatsApp messages will be sent to real recipients. Recipient delivery records and
                  inbox conversation histories will be realistically generated.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <button
            type="button"
            disabled={step === 1 || isSubmitting}
            onClick={() => {
              setError('');
              setStep((s) => (s > 1 ? ((s - 1) as any) : s));
            }}
            className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:text-slate-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>

            {step < 5 ? (
              <button
                type="button"
                id="broadcast-modal-next-btn"
                onClick={handleNext}
                className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                Next Step
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                id="dispatch-broadcast-confirm-btn"
                type="button"
                disabled={isSubmitting || (draft.eligibleContactIds.length === 0 && audience.eligible.length === 0)}
                onClick={handleLaunch}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                {isSubmitting
                  ? 'Dispatching Broadcast...'
                  : isWhatsAppConnected
                  ? 'Launch Broadcast Campaign'
                  : 'Simulate Broadcast'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
