import React, { useState } from 'react';
import { 
  Zap, 
  Plus, 
  Trash2, 
  Edit, 
  Play, 
  Pause, 
  Clock, 
  MessageSquare, 
  Sparkles,
  Bot
} from 'lucide-react';
import { AutomationRule } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { RuleModal } from './RuleModal.tsx';
import { EmptyState } from '../common/EmptyState.tsx';
import { useToast } from '../common/Toast.tsx';

export interface AutomationsViewProps {
  rules: AutomationRule[];
  onAddRule: (data: any) => void;
  onUpdateRule: (id: string, updates: Partial<AutomationRule>) => void;
  onDeleteRule: (id: string) => void;
  onOpenSimulator: () => void;
}

export const AutomationsView: React.FC<AutomationsViewProps> = ({
  rules,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onOpenSimulator,
}) => {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ruleToEdit, setRuleToEdit] = useState<AutomationRule | null>(null);

  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  const handleToggleStatus = (rule: AutomationRule) => {
    const nextStatus = rule.status === 'active' ? 'inactive' : 'active';
    onUpdateRule(rule.id, { status: nextStatus });
    toast(`Rule "${rule.name}" is now ${nextStatus}.`);
  };

  const getTriggerDescription = (rule: AutomationRule) => {
    if (rule.trigger === 'keyword') {
      return `Keyword (${rule.conditionType}): "${rule.conditionValue}"`;
    }
    if (rule.trigger === 'welcome') {
      return 'First Inbound Message from Contact';
    }
    if (rule.trigger === 'outside_business_hours') {
      return 'Outside Business Hours Inquiry';
    }
    return rule.trigger;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Automation Engine</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure instant WhatsApp auto-replies, keyword routers, and off-hours notices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSimulator}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors"
          >
            <Bot className="w-3.5 h-3.5 text-emerald-600" />
            Test With Simulator
          </button>
          <button
            id="open-add-rule-btn"
            type="button"
            onClick={() => {
              setRuleToEdit(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Automation Rule
          </button>
        </div>
      </div>

      {/* Compliance / Policy Callout */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-3">
        <Zap className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 space-y-1">
          <span className="font-bold text-slate-900">
            Automated Execution Priority Order:
          </span>
          <p>
            1. Consent keywords (STOP, START, UNSUBSCRIBE) are handled automatically with highest
            priority.
            <br />
            2. Active rules are evaluated in ascending priority sequence (Priority 1 runs before
            Priority 2).
          </p>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No automation rules defined"
            description="Create your first rule to send instant automatic replies to customer keywords."
            actionLabel="Create First Rule"
            onAction={() => {
              setRuleToEdit(null);
              setIsModalOpen(true);
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-16 text-center">Priority</th>
                  <th className="py-3 px-4">Rule Name</th>
                  <th className="py-3 px-4">Trigger Condition</th>
                  <th className="py-3 px-4">Auto-Reply Preview</th>
                  <th className="py-3 px-4 text-center">Fired</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3.5 px-4 text-center">
                      <span className="w-6 h-6 rounded-full bg-slate-100 font-bold text-slate-700 inline-flex items-center justify-center">
                        {rule.priority}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {rule.name}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 font-medium">
                        {getTriggerDescription(rule)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="text-slate-600 truncate text-[11px]">{rule.actionPayload}</p>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                      {rule.triggerCount || 0}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={rule.status === 'active' ? 'emerald' : 'slate'}>
                        {rule.status === 'active' ? 'Active' : 'Paused'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(rule)}
                          className={`p-1.5 rounded-md transition-colors ${
                            rule.status === 'active'
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={rule.status === 'active' ? 'Pause Rule' : 'Activate Rule'}
                        >
                          {rule.status === 'active' ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRuleToEdit(rule);
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
                          title="Edit Rule"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete rule "${rule.name}"?`)) {
                              onDeleteRule(rule.id);
                              toast('Rule deleted.');
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                          title="Delete Rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RuleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        ruleToEdit={ruleToEdit}
        onSave={(data) => {
          if (ruleToEdit) {
            onUpdateRule(ruleToEdit.id, data);
            toast('Rule updated.');
          } else {
            onAddRule(data);
            toast('Rule created.');
          }
        }}
      />
    </div>
  );
};
