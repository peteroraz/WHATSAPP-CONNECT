import React from 'react';
import { PublicHeader } from './PublicHeader.tsx';
import { PublicFooter } from './PublicFooter.tsx';
import { 
  ShieldCheck, 
  Lock, 
  Database, 
  MessageSquare, 
  Phone, 
  Users, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Mail, 
  ExternalLink,
  Clock,
  FileText
} from 'lucide-react';

interface PrivacyPolicyViewProps {
  onNavigate: (path: string) => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onNavigate }) => {
  const lastUpdated = 'October 9, 2026';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <PublicHeader currentPath="/privacy" onNavigate={onNavigate} />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full">
        {/* Header Hero */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200 mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Meta WhatsApp Cloud API Compliance</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Privacy Policy
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Effective Date & Last Updated: <span className="font-semibold text-slate-700">{lastUpdated}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('/data-deletion')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Data Deletion Instructions</span>
              </button>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            Welcome to <strong>WatsManager</strong>. We respect your privacy and are committed to protecting the personal data of our users, businesses, and their end customers. This Privacy Policy details how WatsManager collects, processes, stores, and safeguards customer data when you interact with our platform and when messages are exchanged via Meta's official WhatsApp Business Platform.
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-6">
          {/* 1. Scope & Nature of the Platform */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">1</span>
              Scope & Platform Purpose
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
              WatsManager is a business communications and marketing workspace designed to empower enterprises to manage shared customer service inboxes, schedule broadcast notification campaigns, configure automated keyword responses, and maintain transparent customer consent records.
            </p>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              In the context of data protection legislation (including GDPR and global privacy standards), WatsManager operates as a <strong>Data Processor</strong> on behalf of our subscriber businesses (the <strong>Data Controllers</strong>) regarding end-customer communications.
            </p>
          </section>

          {/* 2. What Information WatsManager Processes */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">2</span>
              Information We Collect & Process
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
              To deliver WhatsApp messaging, contacts management, and delivery telemetry, WatsManager processes the following categories of data:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="flex items-center gap-2 font-bold text-slate-900 mb-1.5">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp Phone Numbers</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  International E.164 formatted telephone numbers for both your registered WhatsApp Business phone number and recipient contact phone numbers necessary to deliver messages.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="flex items-center gap-2 font-bold text-slate-900 mb-1.5">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp Message Content</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  The text content of inbound and outbound conversations, dynamic template parameters, media links (images/documents), and timestamps required for 2-way customer service.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="flex items-center gap-2 font-bold text-slate-900 mb-1.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>Contact & Business Information</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Contact first and last names, email addresses, organization/company affiliations, custom audience groups, and operational contact tags managed within your workspace.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="flex items-center gap-2 font-bold text-slate-900 mb-1.5">
                  <Send className="w-4 h-4 text-emerald-600" />
                  <span>Message Delivery & Status Receipts</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Meta delivery receipts including real-time transmission status (<code>sent</code>, <code>delivered</code>, <code>read</code>, <code>failed</code>), error codes, and message IDs (<code>wamid</code>).
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 md:col-span-2">
                <div className="flex items-center gap-2 font-bold text-slate-900 mb-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Opt-In, Opt-Out & Consent Records</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Granular consent logs including marketing opt-in status, consent source timestamps, opt-out triggers (e.g., automated capture of keywords such as <code>STOP</code>, <code>UNSUBSCRIBE</code>, <code>CANCEL</code>), and re-subscription events (<code>START</code>).
                </p>
              </div>
            </div>
          </section>

          {/* 3. How This Information is Used */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">3</span>
              How We Use Processed Information
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
              We process the specified information strictly to provide and maintain the WatsManager application:
            </p>
            <ul className="space-y-2.5 text-xs sm:text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Interactive Messaging & Shared Inbox:</strong> Providing your team with a centralized interface to receive incoming customer enquiries and send authorized replies.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Broadcast Campaigns:</strong> Dispatching pre-approved Meta WhatsApp Message Templates to targeted, opted-in contact audiences.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Automated Responses:</strong> Executing configured business rules such as welcome messages, out-of-business-hours notices, and keyword-based customer routing.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Zero-Tolerance Opt-Out Compliance:</strong> Instantly suppressing contacts who request to unsubscribe from receiving further marketing outreach.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Webhook Synchronization:</strong> Verifying Meta HMAC-SHA256 signatures and recording real-time delivery telemetry.
                </span>
              </li>
            </ul>
          </section>

          {/* 4. We DO NOT Sell Your Data */}
          <section className="bg-white rounded-xl border border-emerald-200 p-6 shadow-2xs bg-linear-to-r from-emerald-50/40 to-white">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">4</span>
              Strict Commitment: We Never Sell Data
            </h2>
            <div className="space-y-2 text-xs sm:text-sm text-slate-700">
              <p className="font-semibold text-emerald-950">
                WatsManager does not sell, rent, monetize, or trade your contact records, customer phone numbers, or conversation logs to any third parties, advertisers, or data brokers.
              </p>
              <p className="text-slate-600 leading-relaxed">
                Your customer lists belong entirely to your organization. We do not use customer message content or contact directories to train public commercial AI models or construct advertising profiles.
              </p>
            </div>
          </section>

          {/* 5. Processing via Meta WhatsApp Business Platform */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">5</span>
              Processing via Meta WhatsApp Business Platform
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
              WhatsApp messaging is provided through Meta's official <strong>WhatsApp Business Cloud API</strong> (operated by Meta Platforms, Inc. / Meta Platforms Ireland Ltd.).
            </p>
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2 text-slate-600 leading-relaxed">
              <p>
                When you send or receive a message through WatsManager, the transmission travels directly between our secure servers and Meta's WhatsApp infrastructure via encrypted HTTPS webhooks and REST endpoints.
              </p>
              <p>
                Meta processes message traffic in accordance with the{' '}
                <a
                  href="https://www.whatsapp.com/legal/business-terms/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 font-semibold underline inline-flex items-center gap-1"
                >
                  WhatsApp Business Terms of Service <ExternalLink className="w-3 h-3" />
                </a>{' '}
                and the{' '}
                <a
                  href="https://www.whatsapp.com/legal/business-policy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 font-semibold underline inline-flex items-center gap-1"
                >
                  WhatsApp Business Messaging Policy <ExternalLink className="w-3 h-3" />
                </a>.
              </p>
            </div>
          </section>

          {/* 6. Security & Data Retention */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">6</span>
              Security & Retention Principles
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-3">
              <div className="p-3 border border-slate-200 rounded-lg bg-slate-50">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  Encryption in Transit & at Rest
                </span>
                <p className="text-slate-600">
                  All communications are encrypted using TLS 1.3 / HTTPS. Meta webhook payloads are validated using SHA-256 HMAC cryptographic signatures.
                </p>
              </div>

              <div className="p-3 border border-slate-200 rounded-lg bg-slate-50">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Strict Secret Isolation
                </span>
                <p className="text-slate-600">
                  Meta System User Access Tokens and App Secrets are safeguarded server-side and are never transmitted to client browsers or exposed in public bundles.
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              <strong>Data Retention:</strong> We retain contact records and conversation histories only for as long as your organization maintains an active account with WatsManager, or until you explicitly delete records through our self-service controls or submit a data erasure request.
            </p>
          </section>

          {/* 7. How to Request Deletion */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">7</span>
              Your Rights & How to Request Deletion
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
              In accordance with international privacy laws, both business administrators and end customers have the right to access, rectify, export, or permanently delete their personal information.
            </p>
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-2 text-xs">
              <p className="font-bold text-emerald-950">Immediate Deletion Options:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>
                  <strong>End Customers:</strong> Reply with <code>STOP</code> or <code>REMOVE ME</code> directly on WhatsApp to immediately withdraw consent and cease outreach.
                </li>
                <li>
                  <strong>Organizations:</strong> Use the in-app Contacts manager to delete individual contacts, or Settings to purge conversation history.
                </li>
                <li>
                  <strong>Dedicated Deletion Instructions:</strong> Visit our dedicated guide and request portal at{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('/data-deletion')}
                    className="font-bold text-emerald-800 underline hover:text-emerald-900"
                  >
                    /data-deletion
                  </button>.
                </li>
              </ul>
            </div>
          </section>

          {/* 8. Contact Information for Privacy Enquiries */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">8</span>
              Contact Information for Privacy Enquiries
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
              If you have questions regarding this Privacy Policy, your data protection rights, Meta app review verifications, or wish to submit a formal erasure request, please reach out to our designated Data Protection Officer:
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 w-28">Application:</span>
                <span className="text-slate-700">WatsManager</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 w-28">Privacy Officer:</span>
                <span className="text-slate-700">Data Protection & Privacy Team</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 w-28">Direct Email:</span>
                <a
                  href="mailto:peter.orazulike@gmail.com?subject=WatsManager%20Privacy%20Enquiry"
                  className="text-emerald-700 font-semibold underline hover:text-emerald-800"
                >
                  peter.orazulike@gmail.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 w-28">Response Window:</span>
                <span className="text-slate-700">Within 24 to 48 hours for data requests</span>
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
