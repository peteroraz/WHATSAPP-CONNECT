import React, { useState, useMemo } from 'react';
import { Modal } from '../common/Modal.tsx';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  FileText, 
  ArrowRight, 
  RefreshCw,
  Info,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { Contact, ContactGroup, ConsentStatus } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { 
  normalizePhoneNumber, 
  arePhoneNumbersEqual, 
  getContactDisplayName 
} from '../../utils/phoneUtils.ts';

export interface ImportContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingContacts: Contact[];
  groups: ContactGroup[];
  onImportConfirm: (rows: Partial<Contact>[], defaultGroup?: string) => void;
}

export type DestinationField = 
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'company'
  | 'group'
  | 'tags'
  | 'marketingOptIn'
  | 'transactionalOptIn'
  | 'ignore';

const DESTINATION_OPTIONS: { value: DestinationField; label: string }[] = [
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'fullName', label: 'Full Name (Auto-split)' },
  { value: 'phone', label: 'Phone (E.164)' },
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Company' },
  { value: 'group', label: 'Group' },
  { value: 'tags', label: 'Tags' },
  { value: 'marketingOptIn', label: 'Marketing Opt-In' },
  { value: 'transactionalOptIn', label: 'Transactional Opt-In' },
  { value: 'ignore', label: '— Ignore Column —' },
];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      char && (current += char);
    }
  }
  result.push(current.trim());
  return result;
}

function parseBoolean(val: string | null | undefined): boolean {
  if (!val) return false;
  const s = val.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function guessFieldMapping(header: string): DestinationField {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (h.includes('firstname') || h === 'fname' || h === 'givenname') return 'firstName';
  if (h.includes('lastname') || h === 'lname' || h === 'surname' || h === 'familyname') return 'lastName';
  if (h === 'name' || h.includes('fullname') || h === 'contactname' || h === 'customername') return 'fullName';
  if (h.includes('phone') || h.includes('mobile') || h.includes('cell') || h.includes('whatsapp') || h.includes('tel') || h.includes('number')) return 'phone';
  if (h.includes('email') || h.includes('mail')) return 'email';
  if (h.includes('company') || h.includes('org') || h.includes('business') || h.includes('corp')) return 'company';
  if (h.includes('group') || h.includes('team') || h.includes('segment')) return 'group';
  if (h.includes('tag') || h.includes('label')) return 'tags';
  if (h.includes('transactional') || h.includes('transaction') || h.includes('utility')) return 'transactionalOptIn';
  if (h.includes('marketing') || h.includes('promo') || h.includes('opt') || h.includes('consent') || h.includes('subscribed')) return 'marketingOptIn';
  return 'ignore';
}

interface EvaluatedRow {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  rawPhone: string;
  normalizedPhone: string;
  email: string;
  company: string;
  group?: string;
  tags: string[];
  marketingOptIn: boolean;
  transactionalOptIn: boolean;
  consentStatus: ConsentStatus;
  status: 'new' | 'duplicate' | 'invalid';
  reason?: string;
}

export const ImportContactsModal: React.FC<ImportContactsModalProps> = ({
  isOpen,
  onClose,
  existingContacts,
  groups,
  onImportConfirm,
}) => {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [step, setStep] = useState<'upload' | 'mapping'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<number, DestinationField>>({});
  const [targetGroup, setTargetGroup] = useState<string>('');

  const sampleCsv = `First Name,Last Name,Phone,Email,Company,Group,Marketing Opt-In,Transactional Opt-In
Amina,Yusuf,08012345678,amina.yusuf@kadinacorp.ng,Kadina Corp,VIP,yes,
Chidi,Eze,2348034567891,chidi.eze@lagoslogistics.com,Lagos Logistics,Customers,yes,
Folake,Adeyemi,+2348056789012,folake@horizonbrands.com,Horizon Brands,Prospects,no,yes
Emeka,Okonkwo,08098765432,emeka@apexcommerce.ng,Apex Commerce,Customers,no,no
Fatima,Bello,+2348076543210,fatima.bello@saharagroup.org,Sahara Group,Event Attendees,yes,`;

  const handleReset = () => {
    setCsvText('');
    setFileName('');
    setHeaders([]);
    setRawRows([]);
    setColumnMappings({});
    setTargetGroup('');
    setStep('upload');
  };

  const handleProcessCsv = (text: string, name?: string) => {
    if (!text.trim()) return;
    const lines = text.trim().split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    const parsedHeaders = parseCsvLine(lines[0]);
    const parsedData = lines.slice(1).map(parseCsvLine).filter((cols) => cols.some((c) => c.trim().length > 0));

    const initialMappings: Record<number, DestinationField> = {};
    parsedHeaders.forEach((h, idx) => {
      initialMappings[idx] = guessFieldMapping(h);
    });

    setHeaders(parsedHeaders);
    setRawRows(parsedData);
    setColumnMappings(initialMappings);
    if (name) setFileName(name);
    setStep('mapping');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      handleProcessCsv(text, file.name);
    };
    reader.readAsText(file);
  };

  // Evaluate rows based on current columnMappings
  const evaluatedRows: EvaluatedRow[] = useMemo(() => {
    // Map existing directory contacts by normalized E.164 phone
    const existingPhonesMap = new Map<string, Contact>();
    existingContacts.forEach((c) => {
      if (!c.phone) return;
      const norm = normalizePhoneNumber(c.phone);
      if (norm.isValid && norm.normalized) {
        existingPhonesMap.set(norm.normalized, c);
      } else {
        const digits = c.phone.replace(/[^\d+]/g, '');
        if (digits) {
          existingPhonesMap.set(digits, c);
        }
      }
    });

    const seenInBatchMap = new Map<string, EvaluatedRow>();

    return rawRows.map((cols) => {
      let firstName = '';
      let lastName = '';
      let rawPhone = '';
      let email = '';
      let company = '';
      let rowGroup = '';
      let rowTags: string[] = ['CSV Import'];
      let marketingOptInRaw: string | null = null;
      let transactionalOptInRaw: string | null = null;

      cols.forEach((colVal, colIdx) => {
        const field = columnMappings[colIdx];
        if (!field || field === 'ignore') return;

        const val = (colVal || '').trim();

        if (field === 'firstName') {
          firstName = val;
        } else if (field === 'lastName') {
          lastName = val;
        } else if (field === 'fullName') {
          const parts = val.split(/\s+/).filter(Boolean);
          if (parts.length > 0) {
            firstName = parts[0];
            if (parts.length > 1) {
              lastName = parts.slice(1).join(' ');
            }
          }
        } else if (field === 'phone') {
          rawPhone = val;
        } else if (field === 'email') {
          email = val;
        } else if (field === 'company') {
          company = val;
        } else if (field === 'group') {
          rowGroup = val;
        } else if (field === 'tags') {
          if (val) {
            const splitTags = val.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
            rowTags = Array.from(new Set([...rowTags, ...splitTags]));
          }
        } else if (field === 'marketingOptIn') {
          marketingOptInRaw = val;
        } else if (field === 'transactionalOptIn') {
          transactionalOptInRaw = val;
        }
      });

      // Strictly isolate fields: never append phone or email or company into names!
      firstName = firstName
        .replace(/\(?\+?\d[\d\s()-]{6,}\d\)?/g, '')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
        .trim();

      lastName = lastName
        .replace(/\(?\+?\d[\d\s()-]{6,}\d\)?/g, '')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
        .trim();

      company = company
        .replace(/\(?\+?\d[\d\s()-]{6,}\d\)?/g, '')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
        .trim();

      email = email.trim();

      const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'Unnamed Contact';

      // 1. Consent mapping logic:
      // MarketingOptIn = true → Marketing Consented
      // MarketingOptIn = false and TransactionalOptIn = true → Transactional Only
      // If both are false or blank/null → Not Consented
      const hasMarketingOptIn = parseBoolean(marketingOptInRaw);
      const hasTransactionalOptIn = parseBoolean(transactionalOptInRaw);

      let consentStatus: ConsentStatus = 'Not Consented';
      let marketingOptIn = false;
      let transactionalOptIn = false;

      if (hasMarketingOptIn) {
        consentStatus = 'Marketing Consented';
        marketingOptIn = true;
        transactionalOptIn = true;
      } else if (hasTransactionalOptIn) {
        consentStatus = 'Transactional Only';
        marketingOptIn = false;
        transactionalOptIn = true;
      } else {
        consentStatus = 'Not Consented';
        marketingOptIn = false;
        transactionalOptIn = false;
      }

      // 2. Phone normalization and duplicate detection
      // Duplicate detection uses normalized E.164 phone as the primary duplicate key.
      // Do NOT classify as duplicate merely because name, email, or company is similar.
      const phoneNorm = normalizePhoneNumber(rawPhone);
      let status: 'new' | 'duplicate' | 'invalid' = 'new';
      let reason: string | undefined;

      if (!rawPhone || !phoneNorm.isValid || !phoneNorm.normalized) {
        status = 'invalid';
        reason = 'Invalid phone number';
      } else if (existingPhonesMap.has(phoneNorm.normalized)) {
        status = 'duplicate';
        const existingMatch = existingPhonesMap.get(phoneNorm.normalized)!;
        const matchName = getContactDisplayName(existingMatch);
        if (matchName && matchName !== 'Unnamed Contact' && matchName !== existingMatch.phone) {
          reason = `Duplicate — matches ${matchName} (${existingMatch.phone})`;
        } else {
          reason = `Duplicate — matches ${existingMatch.phone}`;
        }
      } else if (seenInBatchMap.has(phoneNorm.normalized)) {
        status = 'duplicate';
        const batchMatch = seenInBatchMap.get(phoneNorm.normalized)!;
        const matchName = batchMatch.displayName;
        if (matchName && matchName !== 'Unnamed Contact') {
          reason = `Duplicate in CSV — matches ${matchName} (${phoneNorm.normalized})`;
        } else {
          reason = `Duplicate — matches ${phoneNorm.normalized}`;
        }
      } else {
        status = 'new';
      }

      const rowResult: EvaluatedRow = {
        firstName,
        lastName,
        displayName,
        phone: phoneNorm.normalized || rawPhone,
        rawPhone,
        normalizedPhone: phoneNorm.normalized,
        email,
        company,
        group: rowGroup,
        tags: rowTags,
        marketingOptIn,
        transactionalOptIn,
        consentStatus,
        status,
        reason,
      };

      if (status === 'new' && phoneNorm.normalized) {
        seenInBatchMap.set(phoneNorm.normalized, rowResult);
      }

      return rowResult;
    });
  }, [rawRows, columnMappings, existingContacts]);

  const newCount = evaluatedRows.filter((r) => r.status === 'new').length;
  const duplicateCount = evaluatedRows.filter((r) => r.status === 'duplicate').length;
  const invalidCount = evaluatedRows.filter((r) => r.status === 'invalid').length;

  const handleConfirmImport = () => {
    const importTimestamp = new Date().toISOString();
    const validToImport: Partial<Contact>[] = evaluatedRows
      .filter((r) => r.status === 'new')
      .map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.normalizedPhone,
        email: r.email,
        company: r.company,
        groups: r.group ? [r.group] : undefined,
        tags: r.tags,
        marketingOptIn: r.marketingOptIn,
        transactionalOptIn: r.transactionalOptIn,
        whatsappOptIn: true,
        optInSource: r.marketingOptIn ? 'CSV Import' : undefined,
        optInDate: r.marketingOptIn ? importTimestamp : undefined,
        status: 'Active',
      }));

    onImportConfirm(validToImport, targetGroup || undefined);
    onClose();
    handleReset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        handleReset();
      }}
      title="Import Contacts from CSV"
      subtitle={
        step === 'upload'
          ? 'Upload or paste CSV records with column mapping and duplicate phone detection.'
          : 'Map source CSV columns to WhatsFlow fields and preview normalized records.'
      }
      maxWidth={step === 'upload' ? 'xl' : '4xl'}
      id="import-contacts-modal"
    >
      {step === 'upload' ? (
        <div className="space-y-4">
          {/* File Upload Box */}
          <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-emerald-50/20 transition-all text-center">
            <UploadCloud className="w-8 h-8 text-emerald-600 mb-2" />
            <span className="text-xs font-semibold text-slate-800">
              Click to select a CSV file or drag & drop here
            </span>
            <span className="text-[11px] text-slate-400 mt-1">
              Supports .csv with headers. Columns will be dynamically mapped in the next step.
            </span>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-slate-400 text-xs font-semibold uppercase">Or Paste CSV</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Paste Comma-Separated Data</label>
              <button
                type="button"
                onClick={() => setCsvText(sampleCsv)}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                Load Nigerian Sample CSV
              </button>
            </div>
            <textarea
              id="csv-textarea-input"
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="First Name,Last Name,Phone,Email,Company,Group,Opt-In&#10;Amina,Yusuf,08012345678,amina@kadina.ng,Kadina Corp,VIP,yes"
              className="w-full p-3 border border-slate-200 rounded-lg text-xs font-mono bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200"
            >
              Cancel
            </button>
            <button
              id="csv-next-mapping-btn"
              type="button"
              disabled={!csvText.trim()}
              onClick={() => handleProcessCsv(csvText)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
            >
              Next: Map Columns
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* STEP 2: COLUMN MAPPING & PREVIEW */
        <div className="space-y-5">
          {/* Summary Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase text-emerald-800 tracking-wider">
                  New
                </span>
                <p className="text-xl font-bold text-emerald-950 mt-0.5">{newCount}</p>
              </div>
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase text-amber-800 tracking-wider">
                  Duplicate
                </span>
                <p className="text-xl font-bold text-amber-950 mt-0.5">{duplicateCount}</p>
              </div>
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase text-rose-800 tracking-wider">
                  Invalid
                </span>
                <p className="text-xl font-bold text-rose-950 mt-0.5">{invalidCount}</p>
              </div>
              <XCircle className="w-6 h-6 text-rose-600" />
            </div>
          </div>

          {duplicateCount > 0 && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{duplicateCount}</strong> duplicate record(s) detected by phone number and will be skipped.
              </span>
            </div>
          )}

          {invalidCount > 0 && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>{invalidCount}</strong> invalid record(s) with invalid phone numbers detected and will not be imported.
              </span>
            </div>
          )}

          {/* Mapping Grid */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Step 1: Source CSV Column Mapping
                </h4>
                <p className="text-[11px] text-slate-500">
                  Select which WhatsFlow field each source CSV column should populate.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const resetMap: Record<number, DestinationField> = {};
                  headers.forEach((h, i) => (resetMap[i] = guessFieldMapping(h)));
                  setColumnMappings(resetMap);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                Auto-Detect
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {headers.map((hdr, idx) => {
                const sampleVal = rawRows[0]?.[idx] || '';
                return (
                  <div
                    key={`map_${idx}`}
                    className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 truncate" title={hdr}>
                        {hdr}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">Col #{idx + 1}</span>
                    </div>

                    <select
                      id={`column-mapping-select-${idx}`}
                      value={columnMappings[idx] || 'ignore'}
                      onChange={(e) => {
                        const val = e.target.value as DestinationField;
                        setColumnMappings((prev) => ({ ...prev, [idx]: val }));
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    >
                      {DESTINATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <div className="text-[11px] text-slate-500 truncate" title={`Sample: ${sampleVal}`}>
                      Sample: <span className="font-mono text-slate-700">{sampleVal || '(empty)'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Preview of 5 Rows */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Step 2: Preview Mapped Records (First {Math.min(5, evaluatedRows.length)} of {evaluatedRows.length} Rows)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Contact names are generated strictly from First and Last Name. Normalized phone numbers are validated for E.164 compliance.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Contact Name</th>
                    <th className="py-2.5 px-3">Phone (Normalized)</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3">Company</th>
                    <th className="py-2.5 px-3">Group</th>
                    <th className="py-2.5 px-3">Consent Status</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evaluatedRows.slice(0, 5).map((row, idx) => (
                    <tr key={`prev_${idx}`} className="hover:bg-slate-50/75">
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {row.displayName}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium">
                        {row.status === 'invalid' ? (
                          <span className="text-rose-600 flex items-center gap-1 font-mono" title={row.reason || 'Invalid phone number'}>
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            {row.rawPhone || 'Missing'}
                          </span>
                        ) : (
                          <span className="text-slate-800 font-mono">{row.normalizedPhone}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{row.email || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.company || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {row.group ? (
                          <span className="bg-slate-100 text-slate-700 text-[10px] font-medium px-1.5 py-0.5 rounded-sm">
                            {row.group}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.consentStatus === 'Marketing Consented' ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            Marketing Consented
                          </span>
                        ) : row.consentStatus === 'Transactional Only' ? (
                          <span className="text-blue-700 font-semibold flex items-center gap-1 text-[11px]">
                            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            Transactional Only
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px] font-medium">
                            Not Consented
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.status === 'new' && (
                          <Badge variant="emerald">New</Badge>
                        )}
                        {row.status === 'duplicate' && (
                          <div className="flex flex-col items-start gap-0.5">
                            <Badge variant="amber">Duplicate</Badge>
                            {row.reason && (
                              <span className="text-[11px] text-amber-900 font-medium max-w-[280px] truncate" title={row.reason}>
                                {row.reason}
                              </span>
                            )}
                          </div>
                        )}
                        {row.status === 'invalid' && (
                          <div className="flex flex-col items-start gap-0.5">
                            <Badge variant="rose">Invalid</Badge>
                            <span className="text-[11px] text-rose-700 font-medium" title={row.reason}>
                              {row.reason || 'Invalid phone number'}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Group Assignment & Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                Assign to Group:
              </label>
              <select
                id="import-target-group-select"
                value={targetGroup}
                onChange={(e) => setTargetGroup(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">-- No Default Group --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200"
              >
                Back to CSV
              </button>
              <button
                id="confirm-import-contacts-btn"
                type="button"
                disabled={newCount === 0}
                onClick={handleConfirmImport}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                {newCount > 0 ? `Import ${newCount} New Contact${newCount === 1 ? '' : 's'}` : 'No New Contacts to Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
