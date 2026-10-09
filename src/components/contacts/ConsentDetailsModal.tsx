import React from 'react';
import { Modal } from '../common/Modal.tsx';
import { Contact, OptInHistoryEvent } from '../../types/index.ts';
import { ShieldCheck, ShieldAlert, Clock, History, AlertCircle, FileText } from 'lucide-react';
import { Badge } from '../common/Badge.tsx';
import { getContactDisplayName } from '../../utils/phoneUtils.ts';

export interface ConsentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  historyEvents?: OptInHistoryEvent[];
  onResubscribe?: (contactId: string) => void;
}

export const ConsentDetailsModal: React.FC<ConsentDetailsModalProps> = ({
  isOpen,
  onClose,
  contact,
  historyEvents = [],
  onResubscribe,
}) => {
  if (!contact) return null;

  const displayName = getContactDisplayName(contact);

  const getOptInBadge = () => {
    if (contact.optOut) {
      return <Badge variant="rose">Opted Out</Badge>;
    }
    if (contact.marketingOptIn) {
      return <Badge variant="emerald">Marketing Consented</Badge>;
    }
    if (contact.transactionalOptIn) {
      return <Badge variant="blue">Transactional Only</Badge>;
    }
    return <Badge variant="slate">Not Consented</Badge>;
  };

  const contactEvents = historyEvents
    .filter((e) => e.contactId === contact.id || (e.phone && e.phone === contact.phone))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={contact.optOut ? 'Consent & Opt-Out History' : 'Consent Details & Audit Trail'}
      subtitle={`WhatsApp policy compliance and explicit opt-in log for ${displayName}.`}
      maxWidth="lg"
      id="consent-details-modal"
    >
      <div className="space-y-4">
        {/* Contact Header Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{displayName}</h3>
              <p className="text-xs font-mono text-slate-600 mt-0.5">{contact.phone}</p>
              {contact.email && <p className="text-xs text-slate-500 mt-0.5">{contact.email}</p>}
            </div>
            <div>{getOptInBadge()}</div>
          </div>
        </div>

        {/* Consent Status Explanation */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Current Consent Status
          </h4>

          {contact.optOut ? (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900">
                <p className="font-semibold">Recipient Unsubscribed (Opted Out)</p>
                <p className="mt-0.5 text-rose-800">
                  This contact opted out on{' '}
                  <span className="font-semibold">
                    {contact.optOutDate
                      ? new Date(contact.optOutDate).toLocaleDateString()
                      : 'Recently'}
                  </span>
                  {contact.optOutSource ? ` via ${contact.optOutSource}` : ''}.
                  WatsManager strictly blocks outbound marketing broadcasts to this number in compliance with WhatsApp Business policies.
                </p>
              </div>
            </div>
          ) : contact.marketingOptIn ? (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-900">
                <p className="font-semibold">Marketing & Promotional Broadcasts Permitted</p>
                <p className="mt-0.5 text-emerald-800">
                  Explicit opt-in received on{' '}
                  <span className="font-semibold">
                    {contact.optInDate ? new Date(contact.optInDate).toLocaleDateString() : 'Active Date'}
                  </span>{' '}
                  via <span className="font-semibold">{contact.optInSource || 'Direct Consent'}</span>.
                  Eligible for scheduled marketing broadcasts and automated promotional campaigns.
                </p>
              </div>
            </div>
          ) : contact.transactionalOptIn ? (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900">
                <p className="font-semibold">Transactional Messaging Only</p>
                <p className="mt-0.5 text-blue-800">
                  This recipient has authorized utility and transactional notifications (such as order updates or appointment reminders).
                  <strong className="block mt-0.5 text-blue-950 font-medium">
                    Important: Transactional consent is NOT treated as marketing permission. Promotional broadcasts are excluded.
                  </strong>
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700">
                <p className="font-semibold">Not Consented</p>
                <p className="mt-0.5">
                  No active consent recorded for marketing broadcasts. Outbound promotional templates cannot be sent to this contact.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-white border border-slate-200 rounded-lg p-3">
          <div>
            <span className="text-slate-400 block text-[11px]">Consent Source</span>
            <span className="font-semibold text-slate-800">
              {contact.optOut
                ? contact.optOutSource || 'Customer Request'
                : contact.optInSource || 'Not Recorded'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Consent / Status Date</span>
            <span className="font-semibold text-slate-800">
              {contact.optOut && contact.optOutDate
                ? new Date(contact.optOutDate).toLocaleString()
                : contact.optInDate
                ? new Date(contact.optInDate).toLocaleString()
                : 'N/A'}
            </span>
          </div>
          {contact.consentNotes && (
            <div className="col-span-2 pt-2 border-t border-slate-100">
              <span className="text-slate-400 block text-[11px] flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Evidence / Notes
              </span>
              <p className="text-slate-700 mt-0.5 text-xs bg-slate-50 p-2 rounded border border-slate-100 whitespace-pre-wrap">
                {contact.consentNotes}
              </p>
            </div>
          )}
        </div>

        {/* Audit Log Timeline */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <History className="w-3.5 h-3.5 text-slate-500" />
            Consent Event Audit Trail
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {contactEvents.length > 0 ? (
              contactEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-2.5 bg-slate-50 rounded-lg text-xs border border-slate-100 space-y-1"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-800">
                          {evt.newStatus
                            ? `${evt.previousStatus ? `${evt.previousStatus} → ` : ''}${evt.newStatus}`
                            : evt.event === 'opt_in'
                            ? 'Marketing Consented'
                            : evt.event === 'opt_out'
                            ? 'Opted Out'
                            : 'Consent Logged'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Source: <strong className="font-medium text-slate-700">{evt.source}</strong>
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {evt.notes && (
                    <div className="ml-5 text-[11px] text-slate-600 bg-white p-1.5 rounded border border-slate-100">
                      Note: {evt.notes}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-3 text-center bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-100">
                Initial record logged on {new Date(contact.createdAt).toLocaleDateString()} ({contact.optInSource || 'Direct Consent'}).
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200"
          >
            Close
          </button>
          {contact.optOut && onResubscribe && (
            <button
              type="button"
              onClick={() => {
                onResubscribe(contact.id);
                onClose();
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            >
              Resubscribe with Explicit Customer Consent
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
