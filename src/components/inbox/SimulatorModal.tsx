import React, { useState } from 'react';
import { Modal } from '../common/Modal.tsx';
import { Bot, Send, Sparkles, CheckCircle2, AlertOctagon } from 'lucide-react';
import { Contact, Organization } from '../../types/index.ts';

export interface SimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  organization: Organization;
  onSimulateIncoming: (phone: string, text: string) => Promise<any>;
}

export const SimulatorModal: React.FC<SimulatorModalProps> = ({
  isOpen,
  onClose,
  contacts,
  organization,
  onSimulateIncoming,
}) => {
  const [phone, setPhone] = useState(contacts[0]?.phone || '+2348012345678');
  const [messageText, setMessageText] = useState('PRICE');
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<any>(null);

  const presets = [
    { label: 'STOP (Opt-Out)', text: 'STOP' },
    { label: 'START (Opt-In)', text: 'START' },
    { label: 'Keyword: PRICE', text: 'PRICE' },
    { label: 'Keyword: MENU', text: 'MENU' },
    { label: 'Inquiry', text: 'Hello, what are your delivery terms?' },
  ];

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !messageText.trim()) return;

    try {
      setIsSimulating(true);
      setResult(null);
      const res = await onSimulateIncoming(phone, messageText.trim());
      setResult(res);
      setIsSimulating(false);
    } catch (err: any) {
      setIsSimulating(false);
      setResult({ error: err.message });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Simulate Inbound WhatsApp Message"
      subtitle="Test webhooks, opt-out keywords (STOP), and auto-replies in real time."
      maxWidth="md"
      id="simulator-modal"
    >
      <form onSubmit={handleSimulate} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Sender WhatsApp Phone (E.164)
          </label>
          <input
            id="sim-phone-input"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2348012345678"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="text-[10px] text-slate-400">Select known:</span>
              {contacts.slice(0, 3).map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setPhone(c.phone)}
                  className="text-[10px] font-mono text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded-sm"
                >
                  {c.firstName || c.phone}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Quick Test Presets
          </label>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                type="button"
                key={p.label}
                onClick={() => setMessageText(p.text)}
                className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-md transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Incoming Message Text
          </label>
          <textarea
            id="sim-message-textarea"
            rows={3}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type customer message..."
            className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Results Box */}
        {result && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Webhook Handled
            </div>

            {result.consent?.isOptOutCommand && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-md text-rose-800 text-[11px]">
                <strong>Opt-Out Triggered:</strong> Contact unsubscribed from marketing and status
                updated.
              </div>
            )}

            {result.consent?.isOptInCommand && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-[11px]">
                <strong>Opt-In Triggered:</strong> Contact marketing consent restored.
              </div>
            )}

            {result.autoReply && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-md space-y-1">
                <div className="text-[10px] font-bold text-emerald-900 uppercase">
                  Automated Reply Dispatched {result.matchedRuleName ? `(${result.matchedRuleName})` : ''}
                </div>
                <div className="text-slate-800 text-xs whitespace-pre-wrap">
                  {result.autoReply}
                </div>
              </div>
            )}

            {!result.autoReply && !result.consent?.isOptOutCommand && !result.consent?.isOptInCommand && (
              <div className="text-slate-500 text-[11px]">
                Message logged in Inbox. No automation matched; agent notified.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Close
          </button>
          <button
            id="sim-submit-btn"
            type="submit"
            disabled={isSimulating || !messageText.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {isSimulating ? 'Processing...' : 'Send Simulated Message'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
