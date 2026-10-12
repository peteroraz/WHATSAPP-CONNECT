import React, { useState } from 'react';
import { Modal } from '../common/Modal.tsx';
import { Client, WhatsAppConnection } from '../../types/index.ts';
import { KeyRound, ShieldAlert, CheckCircle2, Phone, Building2, RefreshCw } from 'lucide-react';
import { useToast } from '../common/Toast.tsx';

export interface ClientConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client;
  connection?: WhatsAppConnection;
  onSave: (credentials: {
    clientId: string;
    wabaId: string;
    phoneNumberId: string;
    metaAccessToken: string;
  }) => Promise<any>;
}

export const ClientConnectionModal: React.FC<ClientConnectionModalProps> = ({
  isOpen,
  onClose,
  client,
  connection,
  onSave,
}) => {
  const { toast } = useToast();
  const [wabaId, setWabaId] = useState(connection?.wabaId || '');
  const [phoneNumberId, setPhoneNumberId] = useState(connection?.phoneNumberId || '');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumberId.trim()) {
      setError('Phone Number ID is required.');
      return;
    }
    if (!metaAccessToken.trim()) {
      setError('Meta Access Token is required to configure or update this WhatsApp connection.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSave({
        clientId: client.id,
        wabaId: wabaId.trim(),
        phoneNumberId: phoneNumberId.trim(),
        metaAccessToken: metaAccessToken.trim(),
      });
      setIsSubmitting(false);
      toast(`WhatsApp connection configured successfully for ${client.name}.`);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Failed to configure WhatsApp connection');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Configure WhatsApp Connection — ${client.name}`}
      subtitle="Configure Client-specific Meta WhatsApp Cloud API credentials"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 leading-relaxed">
          <p className="font-semibold flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            Client Isolation Guarantee
          </p>
          Replies and broadcasts for <strong>{client.name}</strong> will strictly use this phone number identity. Access tokens are stored encrypted server-side and never returned to the browser.
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            WhatsApp Business Account ID (WABA ID)
          </label>
          <input
            type="text"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="e.g. 102938475610293"
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
          />
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Required for syncing Meta approved templates for this Client.
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Phone Number ID <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="e.g. 482910482019482"
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
          />
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Meta Graph API Phone Number ID used for dispatching and webhook routing.
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Meta System User Access Token <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              type="password"
              required
              value={metaAccessToken}
              onChange={(e) => setMetaAccessToken(e.target.value)}
              placeholder="EAAG..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
            />
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Permanent or long-lived Meta token. Encrypted server-side; never exposed to browser state.
          </span>
        </div>

        {connection && connection.connectionStatus === 'Connected' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Current Display Number:</span>
              <span className="font-mono font-medium text-slate-800">{connection.displayPhoneNumber || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Verified Name:</span>
              <span className="font-medium text-slate-800">{connection.verifiedDisplayName || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Quality Rating:</span>
              <span className="font-medium text-slate-800">{connection.qualityRating || '—'}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Verifying with Meta...
              </>
            ) : (
              'Save & Verify Connection'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
