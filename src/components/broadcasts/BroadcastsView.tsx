import React, { useState } from 'react';
import { 
  Send, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Users, 
  FileText, 
  Eye, 
  AlertCircle,
  BarChart3,
  Calendar
} from 'lucide-react';
import { Campaign, Contact, ContactGroup, MessageTemplate } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { NewBroadcastModal } from './NewBroadcastModal.tsx';
import { EmptyState } from '../common/EmptyState.tsx';
import { Modal } from '../common/Modal.tsx';
import { useToast } from '../common/Toast.tsx';
import { dataStore } from '../../services/dataStore.ts';

export interface BroadcastsViewProps {
  campaigns: Campaign[];
  contacts: Contact[];
  groups: ContactGroup[];
  templates: MessageTemplate[];
  isWhatsAppConnected?: boolean;
  onLaunchCampaign: (data: any) => Promise<any>;
}

export const BroadcastsView: React.FC<BroadcastsViewProps> = ({
  campaigns,
  contacts,
  groups,
  templates,
  isWhatsAppConnected = false,
  onLaunchCampaign,
}) => {
  const { toast } = useToast();
  const [isNewBroadcastOpen, setIsNewBroadcastOpen] = useState(false);
  const [inspectCampaign, setInspectCampaign] = useState<Campaign | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredCampaigns = campaigns.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return <Badge variant="emerald">{status}</Badge>;
      case 'Sending':
        return <Badge variant="blue">{status}</Badge>;
      case 'Partially Completed':
        return <Badge variant="amber">{status}</Badge>;
      case 'Failed':
        return <Badge variant="rose">{status}</Badge>;
      default:
        return <Badge variant="slate">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Broadcast Campaigns</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Deliver personalized outbound WhatsApp messages to opted-in audiences.
          </p>
        </div>

        <button
          id="open-new-broadcast-btn"
          type="button"
          onClick={() => setIsNewBroadcastOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Broadcast Campaign
        </button>
      </div>

      {/* Campaigns Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Table Controls */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Filter Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 border border-slate-200 rounded-md text-xs bg-slate-50 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Statuses ({campaigns.length})</option>
              <option value="Completed">Completed</option>
              <option value="Sending">Sending</option>
              <option value="Partially Completed">Partially Completed</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
          <span className="text-xs text-slate-400">
            {filteredCampaigns.length} campaign(s) recorded
          </span>
        </div>

        {campaigns.length === 0 ? (
          <EmptyState
            icon={Send}
            title="No broadcast campaigns created yet"
            description="Launch your first personalized WhatsApp blast to opted-in customers."
            actionLabel="Create Campaign"
            onAction={() => setIsNewBroadcastOpen(true)}
          />
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No campaigns found matching filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Campaign</th>
                  <th className="py-3 px-4">Template</th>
                  <th className="py-3 px-4">Audience</th>
                  <th className="py-3 px-4 text-center">Sent</th>
                  <th className="py-3 px-4 text-center">Delivered</th>
                  <th className="py-3 px-4 text-center">Read</th>
                  <th className="py-3 px-4 text-center">Failed</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCampaigns.map((c) => {
                  const deliveryRate =
                    c.sentCount && c.sentCount > 0
                      ? Math.round(((c.deliveredCount || 0) / c.sentCount) * 100)
                      : 100;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-900">{c.name}</span>
                          <Badge variant={c.campaignType === 'Utility' ? 'emerald' : 'blue'} size="sm">
                            {c.campaignType || 'Marketing'}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(c.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {c.templateName}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="capitalize text-slate-800 font-medium">
                          {c.audienceType}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {c.eligibleCount} eligible ({c.excludedCount || 0} excluded)
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-900">
                        {c.sentCount || 0}
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold text-teal-700">
                        {c.deliveredCount || 0}
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold text-purple-700">
                        {c.readCount || 0}
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold text-rose-600">
                        {c.failedCount || 0}
                      </td>
                      <td className="py-3.5 px-4">{getStatusBadge(c.status)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setInspectCampaign(c)}
                          className="px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-md border border-emerald-200 transition-colors"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Broadcast Wizard Modal */}
      <NewBroadcastModal
        isOpen={isNewBroadcastOpen}
        onClose={() => setIsNewBroadcastOpen(false)}
        contacts={contacts}
        groups={groups}
        templates={templates}
        isWhatsAppConnected={isWhatsAppConnected}
        onLaunchCampaign={async (data) => {
          const res = await onLaunchCampaign(data);
          toast(`Broadcast "${data.name}" dispatched successfully.`);
          return res;
        }}
      />

      {/* Campaign Detail Inspection Modal */}
      {inspectCampaign && (() => {
        const recipients = dataStore.getCampaignRecipients(inspectCampaign.id);
        return (
          <Modal
            isOpen={true}
            onClose={() => setInspectCampaign(null)}
            title={`Campaign Report: ${inspectCampaign.name}`}
            subtitle="Full delivery lifecycle, audience compliance, and simulated recipients."
            maxWidth="lg"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Sent</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">
                    {inspectCampaign.sentCount || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-teal-600 uppercase font-bold">Delivered</div>
                  <div className="text-lg font-bold text-teal-700 mt-0.5">
                    {inspectCampaign.deliveredCount || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-purple-600 uppercase font-bold">Read</div>
                  <div className="text-lg font-bold text-purple-700 mt-0.5">
                    {inspectCampaign.readCount || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-rose-600 uppercase font-bold">Failed</div>
                  <div className="text-lg font-bold text-rose-700 mt-0.5">
                    {inspectCampaign.failedCount || 0}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Campaign Type:</span>
                  <Badge variant={inspectCampaign.campaignType === 'Utility' ? 'emerald' : 'blue'} size="sm">
                    {inspectCampaign.campaignType || 'Marketing'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Template Used:</span>
                  <span className="font-mono font-medium text-slate-900">
                    {inspectCampaign.templateName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Audience Strategy:</span>
                  <span className="capitalize font-medium text-slate-900">
                    {inspectCampaign.audienceType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Scoped Contacts:</span>
                  <span className="font-medium text-slate-900">
                    {inspectCampaign.totalSelected || inspectCampaign.eligibleCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Excluded (No Opt-in / Opted Out):</span>
                  <span className="font-medium text-rose-600">
                    {inspectCampaign.excludedCount || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Created At:</span>
                  <span className="text-slate-700">{new Date(inspectCampaign.createdAt).toLocaleString()}</span>
                </div>
                {inspectCampaign.completedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Completed At:</span>
                    <span className="text-slate-700">
                      {new Date(inspectCampaign.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Recipient Message Log */}
              {recipients.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-800">
                    Recipient Delivery Log ({recipients.length})
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white text-xs">
                    {recipients.map((rec) => (
                      <div key={rec.id} className="p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{rec.contactName}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-slate-400">{rec.phone}</span>
                            <Badge
                              variant={
                                rec.status === 'read'
                                  ? 'purple'
                                  : rec.status === 'delivered'
                                  ? 'teal'
                                  : rec.status === 'sent'
                                  ? 'blue'
                                  : 'rose'
                              }
                              size="sm"
                            >
                              {rec.status.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        <div className="p-2 bg-slate-50 rounded text-slate-700 text-[11px] leading-relaxed border border-slate-100">
                          {rec.renderedBody}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setInspectCampaign(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  Close Report
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};
