import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.tsx';
import { AutomationRule } from '../../types/index.ts';

export interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  ruleToEdit?: AutomationRule | null;
}

export const RuleModal: React.FC<RuleModalProps> = ({
  isOpen,
  onClose,
  onSave,
  ruleToEdit,
}) => {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<AutomationRule['trigger']>('keyword');
  const [conditionType, setConditionType] = useState<AutomationRule['conditionType']>('contains');
  const [conditionValue, setConditionValue] = useState('');
  const [actionPayload, setActionPayload] = useState('');
  const [priority, setPriority] = useState(1);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [error, setError] = useState('');

  useEffect(() => {
    if (ruleToEdit) {
      setName(ruleToEdit.name);
      setTrigger(ruleToEdit.trigger);
      setConditionType(ruleToEdit.conditionType || 'contains');
      setConditionValue(ruleToEdit.conditionValue || '');
      setActionPayload(ruleToEdit.actionPayload);
      setPriority(ruleToEdit.priority || 1);
      setStatus(ruleToEdit.status);
    } else {
      setName('');
      setTrigger('keyword');
      setConditionType('contains');
      setConditionValue('');
      setActionPayload('');
      setPriority(1);
      setStatus('active');
    }
    setError('');
  }, [ruleToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Rule name is required');
      return;
    }
    if (trigger === 'keyword' && !conditionValue.trim()) {
      setError('Keyword value is required for keyword trigger');
      return;
    }
    if (!actionPayload.trim()) {
      setError('Automatic response text is required');
      return;
    }

    onSave({
      name: name.trim(),
      trigger,
      conditionType: trigger === 'keyword' ? conditionType : undefined,
      conditionValue: trigger === 'keyword' ? conditionValue.trim() : undefined,
      actionType: 'send_text',
      actionPayload: actionPayload.trim(),
      priority: Number(priority),
      status,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={ruleToEdit ? 'Edit Automation Rule' : 'New Automation Rule'}
      subtitle="Define instant trigger conditions and automated WhatsApp replies."
      maxWidth="lg"
      id="automation-rule-modal"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Rule Name <span className="text-rose-500">*</span>
          </label>
          <input
            id="rule-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Catalog & Pricing Menu"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Trigger Event</label>
            <select
              id="rule-trigger-select"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="keyword">Keyword Match (e.g. PRICE, MENU)</option>
              <option value="welcome">Welcome (First Customer Inbound)</option>
              <option value="outside_business_hours">Outside Business Hours</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Priority (1 = Highest)</label>
            <input
              id="rule-priority-input"
              type="number"
              min={1}
              max={99}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {trigger === 'keyword' && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Condition</label>
              <select
                value={conditionType}
                onChange={(e) => setConditionType(e.target.value as any)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
              >
                <option value="contains">Message Contains</option>
                <option value="equals">Exact Match</option>
                <option value="starts_with">Starts With</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Keyword Word/Phrase
              </label>
              <input
                type="text"
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                placeholder="PRICE"
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs uppercase"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Automated WhatsApp Response Body <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="rule-response-textarea"
            rows={4}
            value={actionPayload}
            onChange={(e) => setActionPayload(e.target.value)}
            placeholder="Type automated response message..."
            className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={status === 'active'}
              onChange={(e) => setStatus(e.target.checked ? 'active' : 'inactive')}
              className="rounded-sm border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Rule is Active & Enabled
          </label>
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
            id="save-rule-btn"
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            {ruleToEdit ? 'Save Changes' : 'Create Automation Rule'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
