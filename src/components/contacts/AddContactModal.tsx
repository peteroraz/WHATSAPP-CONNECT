import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../common/Modal.tsx';
import { Contact, ContactGroup, ConsentStatus } from '../../types/index.ts';
import { 
  normalizePhoneNumber, 
  arePhoneNumbersEqual, 
  SUPPORTED_COUNTRIES, 
  getContactConsentStatus, 
  getContactDisplayName 
} from '../../utils/phoneUtils.ts';
import { Check, AlertCircle, ShieldCheck, ShieldAlert, FileText, UserCheck } from 'lucide-react';

export interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contactData: any) => void;
  contactToEdit?: Contact | null;
  groups: ContactGroup[];
  existingContacts?: Contact[];
  onSelectExistingContact?: (contact: Contact) => void;
}

const CONSENT_SOURCES = [
  'Website',
  'Registration Form',
  'QR Code',
  'WhatsApp Conversation',
  'In Person',
  'Phone',
  'CSV Import',
  'Existing Customer Record',
  'Other',
];

const OPT_OUT_SOURCES = [
  'Customer Request',
  'WhatsApp STOP Reply',
  'Agent Manual Entry',
  'Policy Violation',
  'Other',
];

export const AddContactModal: React.FC<AddContactModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contactToEdit,
  groups,
  existingContacts = [],
  onSelectExistingContact,
}) => {
  // Active contact being edited (either passed in or switched to via duplicate detection)
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedCountryCode, setSelectedCountryCode] = useState('+234');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // 1. Consent Status: single-select (Not Consented | Marketing Consented | Transactional Only | Opted Out)
  // Default for every newly created contact MUST be: "Not Consented"
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>('Not Consented');

  // Conditional fields for Marketing Consented
  const [consentSource, setConsentSource] = useState('Website');
  const [consentDate, setConsentDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [consentNotes, setConsentNotes] = useState('');

  // Conditional fields for Opted Out
  const [optOutSource, setOptOutSource] = useState('Customer Request');
  const [optOutNotes, setOptOutNotes] = useState('');

  const [error, setError] = useState('');
  const [duplicateContact, setDuplicateContact] = useState<Contact | null>(null);

  // Sync state with contactToEdit or reset on open
  useEffect(() => {
    setActiveContact(contactToEdit || null);

    if (contactToEdit) {
      setFirstName(contactToEdit.firstName || '');
      setLastName(contactToEdit.lastName || '');
      setPhone(contactToEdit.phone || '');
      setEmail(contactToEdit.email || '');
      setCompany(contactToEdit.company || '');
      setSelectedGroups(contactToEdit.groups || []);
      setTags(contactToEdit.tags || []);

      const status = getContactConsentStatus(contactToEdit);
      setConsentStatus(status);

      setConsentSource(contactToEdit.optInSource || 'Website');
      setConsentDate(
        contactToEdit.optInDate
          ? new Date(contactToEdit.optInDate).toISOString().slice(0, 16)
          : new Date().toISOString().slice(0, 16)
      );
      setConsentNotes(contactToEdit.consentNotes || '');
      setOptOutSource(contactToEdit.optOutSource || 'Customer Request');
      setOptOutNotes(contactToEdit.consentNotes || '');
    } else {
      setFirstName('');
      setLastName('');
      setSelectedCountryCode('+234');
      setPhone('');
      setEmail('');
      setCompany('');
      setSelectedGroups([]);
      setTags([]);

      // Requirement: The default for every newly created contact must be: Not Consented. Never pre-select Marketing Consented.
      setConsentStatus('Not Consented');
      setConsentSource('Website');
      setConsentDate(new Date().toISOString().slice(0, 16));
      setConsentNotes('');
      setOptOutSource('Customer Request');
      setOptOutNotes('');
    }
    setError('');
    setDuplicateContact(null);
  }, [contactToEdit, isOpen]);

  // Live phone normalization calculation using selected country
  const phoneValidation = useMemo(() => {
    if (!phone) return null;
    return normalizePhoneNumber(phone, selectedCountryCode);
  }, [phone, selectedCountryCode]);

  // Live duplicate check
  useEffect(() => {
    if (phoneValidation?.isValid && phoneValidation.normalized) {
      const match = existingContacts.find(
        (c) => c.id !== activeContact?.id && arePhoneNumbersEqual(c.phone, phoneValidation.normalized)
      );
      setDuplicateContact(match || null);
    } else {
      setDuplicateContact(null);
    }
  }, [phoneValidation, existingContacts, activeContact]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (t: string) => {
    setTags(tags.filter((x) => x !== t));
  };

  const handleSwitchToEditDuplicate = (existing: Contact) => {
    setActiveContact(existing);
    setFirstName(existing.firstName || '');
    setLastName(existing.lastName || '');
    setPhone(existing.phone || '');
    setEmail(existing.email || '');
    setCompany(existing.company || '');
    setSelectedGroups(existing.groups || []);
    setTags(existing.tags || []);

    const status = getContactConsentStatus(existing);
    setConsentStatus(status);
    setConsentSource(existing.optInSource || 'Website');
    setConsentDate(
      existing.optInDate
        ? new Date(existing.optInDate).toISOString().slice(0, 16)
        : new Date().toISOString().slice(0, 16)
    );
    setConsentNotes(existing.consentNotes || '');
    setError('');
    setDuplicateContact(null);

    if (onSelectExistingContact) {
      onSelectExistingContact(existing);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim()) {
      setError('First Name is required');
      return;
    }

    if (!phone || !phone.trim()) {
      setError('Phone number is required');
      return;
    }

    if (!phoneValidation || !phoneValidation.isValid) {
      setError(phoneValidation?.error || 'Invalid phone number. Please enter a valid phone number.');
      return;
    }

    // Duplicate detection: If duplicate exists, prevent creation
    if (duplicateContact) {
      setError(
        `A contact with this WhatsApp number already exists (${getContactDisplayName(duplicateContact)}).`
      );
      return;
    }

    // Validation for Marketing Consented
    if (consentStatus === 'Marketing Consented') {
      if (!consentSource) {
        setError('Consent Source is required when Marketing Consented is selected.');
        return;
      }
      if (!consentDate) {
        setError('Consent Date is required when Marketing Consented is selected.');
        return;
      }
    }

    // Clean names to guarantee no phone or email is concatenated into names
    const cleanFirst = firstName
      .replace(/\(?\+?\d[\d\s()-]{6,}\d\)?/g, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .trim();

    const cleanLast = lastName
      .replace(/\(?\+?\d[\d\s()-]{6,}\d\)?/g, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .trim();

    const cleanCompany = company
      .replace(/\(?\+?\d[\d\s()-]{6,}\d\)?/g, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .trim();

    // Map single-select consent status to data fields
    let marketingOptIn = false;
    let transactionalOptIn = false;
    let optOut = false;
    let optInDateVal: string | undefined = undefined;
    let optInSourceVal: string | undefined = undefined;
    let optOutDateVal: string | undefined = undefined;
    let optOutSourceVal: string | undefined = undefined;
    let notesVal = '';

    if (consentStatus === 'Marketing Consented') {
      marketingOptIn = true;
      transactionalOptIn = true;
      optOut = false;
      optInDateVal = new Date(consentDate).toISOString();
      optInSourceVal = consentSource;
      notesVal = consentNotes.trim();
    } else if (consentStatus === 'Transactional Only') {
      marketingOptIn = false;
      transactionalOptIn = true;
      optOut = false;
    } else if (consentStatus === 'Not Consented') {
      marketingOptIn = false;
      transactionalOptIn = false;
      optOut = false;
    } else if (consentStatus === 'Opted Out') {
      marketingOptIn = false;
      transactionalOptIn = false;
      optOut = true;
      optOutDateVal = new Date().toISOString();
      optOutSourceVal = optOutSource;
      notesVal = optOutNotes.trim();
    }

    onSave({
      firstName: cleanFirst,
      lastName: cleanLast,
      phone: phoneValidation.normalized,
      email: email.trim(),
      company: cleanCompany,
      groups: selectedGroups,
      tags,
      whatsappOptIn: !optOut,
      marketingOptIn,
      transactionalOptIn,
      optInDate: optInDateVal || activeContact?.optInDate || new Date().toISOString(),
      optInSource: optInSourceVal || (consentStatus === 'Marketing Consented' ? consentSource : activeContact?.optInSource),
      consentNotes: notesVal || activeContact?.consentNotes || '',
      optOut,
      optOutDate: optOutDateVal || (optOut ? activeContact?.optOutDate || new Date().toISOString() : undefined),
      optOutSource: optOutSourceVal,
      status: optOut ? 'Opted Out' : 'Active',
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={activeContact ? 'Edit Contact' : 'Add New Contact'}
      subtitle="Manage contact records, E.164 phone normalization, and WhatsApp consent compliance."
      maxWidth="lg"
      id="contact-form-modal"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Duplicate Contact Detection Alert & Action */}
        {duplicateContact && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-950">A contact with this WhatsApp number already exists.</p>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  Existing record: <strong className="font-medium text-amber-950">{getContactDisplayName(duplicateContact)}</strong> ({duplicateContact.phone})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSwitchToEditDuplicate(duplicateContact)}
              className="shrink-0 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-md shadow-2xs transition-colors"
            >
              Edit Existing Contact
            </button>
          </div>
        )}

        {/* Name Fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              First Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-first-name"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. John"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
            <input
              id="input-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="e.g. Okafor"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Phone Number with Country/Region Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Phone Number <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Country / Region Selector (Defaults to Nigeria +234) */}
            <div className="sm:col-span-1">
              <select
                id="select-country-region"
                value={selectedCountryCode}
                onChange={(e) => setSelectedCountryCode(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                title="Select Country / Region"
              >
                {SUPPORTED_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.dialCode}>
                    {c.flag} {c.name} ({c.dialCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Phone Input */}
            <div className="sm:col-span-2">
              <input
                id="input-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 08012345678 or +447700900123"
                required
                className={`w-full px-3 py-2 border rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 ${
                  phoneValidation && !phoneValidation.isValid
                    ? 'border-rose-300 focus:ring-rose-500 bg-rose-50/20'
                    : 'border-slate-200 focus:ring-emerald-500'
                }`}
              />
            </div>
          </div>

          {/* Normalization Feedback Bar */}
          {phone && phoneValidation && (
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              {phoneValidation.isValid ? (
                <div className="text-emerald-700 flex items-center gap-1 font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    Normalized E.164:{' '}
                    <strong className="font-mono text-emerald-800">{phoneValidation.normalized}</strong>
                  </span>
                </div>
              ) : (
                <div className="text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{phoneValidation.error}</span>
                </div>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            Enter a local or international phone number. WatsManager will normalize valid numbers to international E.164 format.
          </p>
        </div>

        {/* Email and Company */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              id="input-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Organization</label>
            <input
              id="input-company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Prime Ventures"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Groups selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Assign to Groups</label>
          <div className="flex flex-wrap gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg min-h-[40px]">
            {groups.length === 0 ? (
              <span className="text-slate-400 text-xs py-1">No groups available. Create groups via Manage Groups.</span>
            ) : (
              groups.map((g) => {
                const isSelected = selectedGroups.includes(g.name);
                return (
                  <button
                    type="button"
                    key={g.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedGroups(selectedGroups.filter((x) => x !== g.name));
                      } else {
                        setSelectedGroups([...selectedGroups, g.name]);
                      }
                    }}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Tags input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Tags (Press Enter to add)</label>
          <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 bg-white border border-slate-200 text-xs px-2 py-0.5 rounded-sm text-slate-700 shadow-2xs"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder={tags.length === 0 ? 'Type tag and press enter...' : ''}
              className="text-xs bg-transparent border-none outline-none focus:ring-0 flex-1 min-w-[100px]"
            />
          </div>
        </div>

        {/* ================= WHATSAPP CONSENT & COMPLIANCE SECTION ================= */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              WhatsApp Consent & Compliance
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Meta Opt-In Policy</span>
          </div>

          {/* Single-select Consent Status Control: 4 options */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Consent Status <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Option 1: Not Consented */}
              <label
                className={`relative flex items-start p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                  consentStatus === 'Not Consented'
                    ? 'border-slate-400 bg-white ring-2 ring-slate-400/20'
                    : 'border-slate-200 bg-white hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="consentStatus"
                  value="Not Consented"
                  checked={consentStatus === 'Not Consented'}
                  onChange={() => setConsentStatus('Not Consented')}
                  className="mt-0.5 text-slate-700 focus:ring-slate-500"
                />
                <div className="ml-2.5">
                  <span className="text-xs font-bold text-slate-800 block">Not Consented</span>
                  <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                    No active consent. Excluded from promotional broadcast campaigns.
                  </span>
                </div>
              </label>

              {/* Option 2: Marketing Consented */}
              <label
                className={`relative flex items-start p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                  consentStatus === 'Marketing Consented'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="consentStatus"
                  value="Marketing Consented"
                  checked={consentStatus === 'Marketing Consented'}
                  onChange={() => setConsentStatus('Marketing Consented')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="ml-2.5">
                  <span className="text-xs font-bold text-emerald-900 block">Marketing Consented</span>
                  <span className="text-[11px] text-emerald-700 leading-tight block mt-0.5">
                    Explicit opt-in recorded. Eligible for outbound marketing broadcasts.
                  </span>
                </div>
              </label>

              {/* Option 3: Transactional Only */}
              <label
                className={`relative flex items-start p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                  consentStatus === 'Transactional Only'
                    ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="consentStatus"
                  value="Transactional Only"
                  checked={consentStatus === 'Transactional Only'}
                  onChange={() => setConsentStatus('Transactional Only')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div className="ml-2.5">
                  <span className="text-xs font-bold text-blue-900 block">Transactional Only</span>
                  <span className="text-[11px] text-blue-700 leading-tight block mt-0.5">
                    Utility notifications only. Not treated as marketing permission.
                  </span>
                </div>
              </label>

              {/* Option 4: Opted Out */}
              <label
                className={`relative flex items-start p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                  consentStatus === 'Opted Out'
                    ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="consentStatus"
                  value="Opted Out"
                  checked={consentStatus === 'Opted Out'}
                  onChange={() => setConsentStatus('Opted Out')}
                  className="mt-0.5 text-rose-600 focus:ring-rose-500"
                />
                <div className="ml-2.5">
                  <span className="text-xs font-bold text-rose-900 block">Opted Out</span>
                  <span className="text-[11px] text-rose-700 leading-tight block mt-0.5">
                    Recipient unsubscribed. Strictly blocks all future outbound marketing.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Conditional Fields: When "Marketing Consented" is selected */}
          {consentStatus === 'Marketing Consented' && (
            <div className="p-3 bg-white border border-emerald-200 rounded-lg space-y-3">
              <div className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                Explicit Consent Verification & Audit Trail
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Consent Source <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="select-consent-source"
                    required
                    value={consentSource}
                    onChange={(e) => setConsentSource(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  >
                    {CONSENT_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Consent Date & Time <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-consent-date"
                    type="datetime-local"
                    required
                    value={consentDate}
                    onChange={(e) => setConsentDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Consent Notes / Evidence
                </label>
                <textarea
                  id="textarea-consent-notes"
                  rows={2}
                  value={consentNotes}
                  onChange={(e) => setConsentNotes(e.target.value)}
                  placeholder="e.g. Registered at Lagos Trade Expo, form URL, transaction confirmation #4402, physical form on file..."
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          {/* Conditional Fields: When "Opted Out" is selected */}
          {consentStatus === 'Opted Out' && (
            <div className="p-3 bg-white border border-rose-200 rounded-lg space-y-3">
              <div className="text-[11px] font-bold text-rose-900 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                Opt-Out Audit Record
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Opt-Out Source</label>
                  <select
                    id="select-optout-source"
                    value={optOutSource}
                    onChange={(e) => setOptOutSource(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                  >
                    {OPT_OUT_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Opt-Out Notes</label>
                  <input
                    id="input-optout-notes"
                    type="text"
                    value={optOutNotes}
                    onChange={(e) => setOptOutNotes(e.target.value)}
                    placeholder="e.g. Requested STOP in chat, phone cancellation"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            id="save-contact-submit-btn"
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            {activeContact ? 'Save Changes' : 'Create Contact'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
