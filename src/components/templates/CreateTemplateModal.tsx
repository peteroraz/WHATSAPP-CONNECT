import React, { useState } from 'react';
import { Modal } from '../common/Modal.tsx';
import { MessageTemplate } from '../../types/index.ts';

export interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

export const CreateTemplateModal: React.FC<CreateTemplateModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'Marketing' | 'Utility' | 'Authentication'>('Marketing');
  const [language, setLanguage] = useState('en_US');
  const [header, setHeader] = useState('');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('Reply STOP to unsubscribe');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    // Meta template naming requirement: lowercase alphanumeric and underscores only
    const normalizedName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if (!body.trim()) {
      setError('Template body text is required');
      return;
    }

    // Extract dynamic variables {{1}}, {{2}} from body
    const varMatches = body.match(/\{\{(\d+)\}\}/g) || [];
    const variables = Array.from(
      new Set(varMatches.map((m) => m.replace(/[\{\}]/g, '')))
    );

    onSave({
      name: normalizedName,
      category,
      language,
      header: header.trim() || undefined,
      body: body.trim(),
      footer: footer.trim() || undefined,
      variables,
      status: 'Approved', // Auto-approved in sandbox / dev mode
      whatsappTemplateId: `meta_${normalizedName}_${Date.now()}`,
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create WhatsApp Message Template"
      subtitle="Define compliant message structures for Meta Cloud API approval."
      maxWidth="lg"
      id="create-template-modal"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Template Name (Meta Code) <span className="text-rose-500">*</span>
            </label>
            <input
              id="tpl-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. seasonal_promo_offer"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-[10px] text-slate-400">Lowercase and underscores only</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="Marketing">Marketing</option>
              <option value="Utility">Utility</option>
              <option value="Authentication">Authentication</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Header Title (Optional)
          </label>
          <input
            type="text"
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            placeholder="e.g. Important Service Update"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Template Body <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="tpl-body-textarea"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hello {{1}}, your order with {{2}} is confirmed! Reply SUPPORT for questions."
            className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
          <span className="text-[11px] text-slate-400">
            Use dynamic variables like &#123;&#123;1&#125;&#125; and &#123;&#123;2&#125;&#125; for
            personalized contact details.
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Footer Text (Recommended for opt-out compliance)
          </label>
          <input
            type="text"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            placeholder="Reply STOP to unsubscribe"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            id="save-template-btn"
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            Submit for Meta Approval
          </button>
        </div>
      </form>
    </Modal>
  );
};
