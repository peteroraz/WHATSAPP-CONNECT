import React, { useState, useEffect } from 'react';
import { Client } from '../../types/index.ts';
import { Modal } from '../common/Modal.tsx';
import { Building2, Code, Mail, Phone, User, FileText, CheckCircle2 } from 'lucide-react';

export interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (clientData: Omit<Client, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>) => void;
  client?: Client | null;
}

export const ClientModal: React.FC<ClientModalProps> = ({
  isOpen,
  onClose,
  onSave,
  client,
}) => {
  const isEditing = Boolean(client);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client) {
      setName(client.name || '');
      setCode(client.code || '');
      setStatus(client.status || 'Active');
      setDescription(client.description || '');
      setContactName(client.contactName || '');
      setContactEmail(client.contactEmail || '');
      setContactPhone(client.contactPhone || '');
      setLogoUrl(client.logoUrl || '');
    } else {
      setName('');
      setCode('');
      setStatus('Active');
      setDescription('');
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setLogoUrl('');
    }
    setError(null);
  }, [client, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Client name is required.');
      return;
    }
    if (!code.trim()) {
      setError('Client code is required.');
      return;
    }

    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode) {
      setError('Client code must contain letters or numbers.');
      return;
    }

    onSave({
      name: name.trim(),
      code: cleanCode,
      status,
      description: description.trim() || undefined,
      contactName: contactName.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Client' : 'Add New Client'}
      subtitle={
        isEditing
          ? 'Update client details and business settings'
          : 'Create a third-party business client to manage isolated contacts and messaging'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Client Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!isEditing && !code) {
                    // Auto-generate code from name
                    const autoCode = e.target.value
                      .replace(/[^a-zA-Z0-9]/g, '')
                      .slice(0, 8)
                      .toUpperCase();
                    setCode(autoCode);
                  }
                }}
                placeholder="e.g. Nexus Logistics"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Client Code <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Code className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. NEXUS"
                maxLength={12}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono uppercase bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Short unique identifier (alphanumeric)</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="client-status"
                value="Active"
                checked={status === 'Active'}
                onChange={() => setStatus('Active')}
                className="text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium text-emerald-800">Active</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="client-status"
                value="Inactive"
                checked={status === 'Inactive'}
                onChange={() => setStatus('Inactive')}
                className="text-slate-500 focus:ring-slate-400"
              />
              <span className="text-slate-500">Inactive</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
          <div className="relative">
            <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of this business client's audience or operations..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <h4 className="text-xs font-bold text-slate-800 mb-2">Primary Contact Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Contact Person</label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Contact Email</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="client@domain.com"
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Contact Phone</label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+234..."
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isEditing ? 'Save Changes' : 'Create Client'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
