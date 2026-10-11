import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Copy, 
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { MessageTemplate } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { CreateTemplateModal } from './CreateTemplateModal.tsx';
import { EmptyState } from '../common/EmptyState.tsx';
import { useToast } from '../common/Toast.tsx';

export interface TemplatesViewProps {
  templates: MessageTemplate[];
  onAddTemplate: (data: any) => void;
  onSyncMetaTemplates?: () => Promise<any>;
  isWhatsAppConnected?: boolean;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  templates,
  onAddTemplate,
  onSyncMetaTemplates,
  isWhatsAppConnected = false,
}) => {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem('whatsflow_last_template_sync');
    } catch {
      return null;
    }
  });
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const filteredTemplates = templates.filter((t) => {
    if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
    return true;
  });

  const copyId = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('Template identifier copied to clipboard');
  };

  const handleSyncMeta = async () => {
    if (!onSyncMetaTemplates) return;
    setIsSyncing(true);
    try {
      const res = await onSyncMetaTemplates();
      setIsSyncing(false);
      if (res && res.success) {
        const syncTime = new Date().toLocaleString();
        setLastSyncedAt(syncTime);
        try {
          localStorage.setItem('whatsflow_last_template_sync', syncTime);
        } catch {}
        toast(`Synchronized ${res.count} template(s) from WhatsApp Business Account.`);
      } else {
        toast(res?.error || 'Failed to sync templates from Meta.', 'error');
      }
    } catch (err: any) {
      setIsSyncing(false);
      toast(err.message || 'Sync error', 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Message Templates</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Meta Cloud API approved message structures required for initiating outbound broadcasts.
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-1.5">
          <div className="flex items-center gap-2">
            {onSyncMetaTemplates && (
              <button
                id="sync-meta-templates-btn"
                type="button"
                onClick={handleSyncMeta}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 shadow-2xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing Templates...' : 'Sync Templates from Meta'}
              </button>
            )}

            <button
              id="open-create-template-btn"
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Template
            </button>
          </div>
          {lastSyncedAt && (
            <span className="text-[11px] text-slate-500 font-medium">
              Last synced from Meta: {lastSyncedAt}
            </span>
          )}
        </div>
      </div>

      {/* Meta Guidelines Banner */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-start gap-3">
        <FileText className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 space-y-1">
          <span className="font-semibold text-slate-900">
            WhatsApp Template Category Guidelines:
          </span>
          <p>
            • <strong>Marketing:</strong> Promotions, offers, updates, and announcements. Explicit
            opt-in required.
            <br />
            • <strong>Utility:</strong> Order confirmations, billing, appointment reminders, and
            account alerts.
            <br />
            • <strong>Authentication:</strong> One-time passcodes and login verifications.
          </p>
        </div>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No message templates created"
          description="Create your first approved WhatsApp template to launch broadcasts."
          actionLabel="Create Template"
          onAction={() => setIsModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 font-mono">{tpl.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <Badge variant="blue" size="sm">
                        {tpl.category}
                      </Badge>
                      <Badge
                        variant={
                          tpl.status === 'Approved'
                            ? 'emerald'
                            : tpl.status === 'Pending'
                            ? 'amber'
                            : 'rose'
                        }
                        size="sm"
                      >
                        {tpl.status}
                      </Badge>
                      {tpl.isLiveMeta || (!tpl.isDemo && tpl.name === 'hello_world') ? (
                        <Badge variant="emerald" size="sm">
                          Meta Live Template
                        </Badge>
                      ) : (
                        <Badge variant="slate" size="sm">
                          Demo/Local Template
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyId(tpl.name)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                    title="Copy template name"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Simulated WhatsApp Bubble preview */}
                <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs space-y-1 text-slate-700">
                  {tpl.header && (
                    <div className="font-semibold text-slate-900 text-[11px] pb-1 border-b border-slate-200">
                      {tpl.header}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{tpl.body}</p>
                  {tpl.footer && (
                    <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-200">
                      {tpl.footer}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Variables: {tpl.variables?.length || 0}</span>
                <span>Lang: {tpl.language}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(data) => {
          onAddTemplate(data);
          toast(`Template "${data.name}" submitted successfully.`);
        }}
      />
    </div>
  );
};
