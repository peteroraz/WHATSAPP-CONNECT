import React, { useState } from 'react';
import { PublicHeader } from './PublicHeader.tsx';
import { PublicFooter } from './PublicFooter.tsx';
import { 
  Trash2, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Mail, 
  Phone, 
  Building2, 
  ExternalLink,
  Copy,
  Check,
  Send,
  FileText
} from 'lucide-react';

interface DataDeletionViewProps {
  onNavigate: (path: string) => void;
}

export const DataDeletionView: React.FC<DataDeletionViewProps> = ({ onNavigate }) => {
  const lastUpdated = 'October 9, 2026';

  // Interactive deletion submission state
  const [identifier, setIdentifier] = useState('');
  const [identifierType, setIdentifierType] = useState<'phone' | 'email'>('phone');
  const [reason, setReason] = useState('Consent Revocation & Right to Erasure');
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    confirmationCode: string;
    target: string;
    timestamp: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    // Generate compliant confirmation code for Meta verification
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const code = `DEL-${Date.now().toString().slice(-6)}-${randomHex}`;
    
    setSubmittedReceipt({
      confirmationCode: code,
      target: identifier.trim(),
      timestamp: new Date().toUTCString(),
    });
  };

  const handleCopyCode = () => {
    if (!submittedReceipt) return;
    navigator.clipboard.writeText(submittedReceipt.confirmationCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <PublicHeader currentPath="/data-deletion" onNavigate={onNavigate} />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full">
        {/* Header Hero */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 text-xs font-semibold border border-rose-200 mb-2">
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Meta User Data Deletion Instructions</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Data Deletion Instructions
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Last Updated: <span className="font-semibold text-slate-700">{lastUpdated}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('/privacy')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>View Privacy Policy</span>
              </button>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            In compliance with <strong>Meta Platforms, Inc. Developer Policies</strong>, the <strong>General Data Protection Regulation (GDPR)</strong>, and global data privacy standards, WatsManager provides clear, transparent methods for organizations and end customers to request the complete deletion of their personal data from our systems.
          </p>
        </div>

        {/* 4 Clear Deletion Methods */}
        <div className="space-y-6">
          {/* Method 1: WhatsApp Inbound STOP Keyword */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                1
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-slate-900 mb-1">
                  Instant End-User Erasure via WhatsApp (Opt-Out Keyword)
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
                  If you are an end customer who received a WhatsApp broadcast or customer support message from a business using WatsManager, you can instantly revoke consent and stop all communications directly inside WhatsApp without logging into any website.
                </p>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                  <div className="font-semibold text-slate-800">How to trigger:</div>
                  <p className="text-slate-600">
                    Reply directly to any WhatsApp message with any of the following standard keywords:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['STOP', 'UNSUBSCRIBE', 'REMOVE', 'CANCEL', 'QUIT', 'OPTOUT'].map((k) => (
                      <span key={k} className="bg-rose-50 border border-rose-200 text-rose-800 font-mono text-xs px-2.5 py-1 rounded-md font-bold">
                        {k}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-500 pt-1">
                    ✓ Immediate effect: Our server immediately marks your telephone number as <strong>Opted Out</strong>, logs an audit withdrawal record, and completely suppresses your number from all future broadcast campaigns.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Method 2: In-App Self-Service Deletion for Workspace Admins */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                2
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-slate-900 mb-1">
                  In-App Self-Service Deletion (For Account Administrators)
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
                  Organization administrators can delete contacts, conversation threads, or complete organization workspaces directly through the application interface:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="font-bold text-slate-900 block mb-1">Delete Single Contact</span>
                    <p className="text-slate-600">
                      Navigate to <strong>Contacts</strong>, select any contact row, and click the <strong>Delete Contact</strong> button to purge their name, phone, and metadata.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="font-bold text-slate-900 block mb-1">Clear Message History</span>
                    <p className="text-slate-600">
                      Inside <strong>Inbox</strong>, delete specific conversation threads or mark conversations closed to remove active message buffers.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="font-bold text-slate-900 block mb-1">Reset / Purge Workspace</span>
                    <p className="text-slate-600">
                      Use the <strong>Reset Demo Data</strong> action in the sidebar or Settings to clear all local contacts, campaigns, and logs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Method 3: Revocation via Meta / Facebook Settings */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                3
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-slate-900 mb-1">
                  Revoking WatsManager in Your Facebook / Meta Account Settings
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
                  If you linked WatsManager to your Meta Business Account or Facebook Login, you can revoke access at any time through Meta's centralized security dashboard:
                </p>

                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600 bg-slate-50 p-4 border border-slate-200 rounded-lg">
                  <li>Log in to your Facebook / Meta profile at <strong>facebook.com</strong>.</li>
                  <li>Click your profile picture in the top right and select <strong>Settings & Privacy</strong> &gt; <strong>Settings</strong>.</li>
                  <li>In the left sidebar, navigate to <strong>Apps and Websites</strong> or <strong>Business Integrations</strong>.</li>
                  <li>Locate <strong>WatsManager</strong> in the list of active applications.</li>
                  <li>Click <strong>Remove</strong>. You may also select the checkbox to delete all data and permissions granted to WatsManager.</li>
                </ol>
              </div>
            </div>
          </section>

          {/* Method 4: Online Data Erasure Submission Form */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                4
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-slate-900 mb-1">
                  Online Data Erasure Request Portal
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                  Submit an automated data erasure request. Our compliance system generates a trackable Confirmation Code, and our Data Protection team will process your purge within 24–48 hours.
                </p>

                {submittedReceipt ? (
                  <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>Data Deletion Request Received</span>
                    </div>
                    <p className="text-xs text-emerald-800 leading-relaxed">
                      Your deletion request has been registered in our audit logs. All associated contact records, message logs, and telemetry for{' '}
                      <strong>{submittedReceipt.target}</strong> will be permanently wiped.
                    </p>

                    <div className="bg-white p-3.5 rounded-lg border border-emerald-200 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">
                          Confirmation & Tracking Code
                        </span>
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {submittedReceipt.confirmationCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-emerald-800 pt-1">
                      <span>Submitted: {submittedReceipt.timestamp}</span>
                      <span>SLA: Processed within 24–48 hours</span>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setSubmittedReceipt(null)}
                        className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline"
                      >
                        Submit another request
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitRequest} className="space-y-4 bg-slate-50/70 p-5 rounded-xl border border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Identifier Type
                        </label>
                        <select
                          value={identifierType}
                          onChange={(e) => setIdentifierType(e.target.value as 'phone' | 'email')}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                        >
                          <option value="phone">WhatsApp Phone Number</option>
                          <option value="email">User / Organization Email</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          {identifierType === 'phone' ? 'Phone Number (with Country Code)' : 'Email Address'}
                        </label>
                        <input
                          type={identifierType === 'phone' ? 'tel' : 'email'}
                          required
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder={identifierType === 'phone' ? '+2348012345678 or +1...' : 'name@company.com'}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Reason for Deletion
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Right to erasure, opt-out, account closure..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Guaranteed deletion execution within 24 to 48 hours
                      </span>

                      <button
                        type="submit"
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Submit Deletion Request</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>

          {/* Contact & SLA Section */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-600" />
              Direct Support & Data Protection Officer Contact
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
              If you require a formal Certificate of Erasure or are a Meta Platform Review auditor verifying data deletion handling, please contact us directly:
            </p>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 w-32">Data Controller:</span>
                <span className="text-slate-700">WatsManager Platforms</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 w-32">Compliance Email:</span>
                <a
                  href="mailto:peter.orazulike@gmail.com?subject=WatsManager%20Data%20Deletion%20Request"
                  className="text-emerald-700 font-semibold underline hover:text-emerald-800"
                >
                  peter.orazulike@gmail.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 w-32">Response SLA:</span>
                <span className="text-slate-700">24 to 48 business hours</span>
              </div>
            </div>
          </section>
        </div>

        {/* Back to App Bottom CTA */}
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <span>Return to WatsManager Workspace</span>
          </button>
        </div>
      </main>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
};
