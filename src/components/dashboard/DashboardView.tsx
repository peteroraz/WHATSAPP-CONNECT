import React from 'react';
import { 
  Users, 
  CheckCircle, 
  Send, 
  CheckCheck, 
  Eye, 
  AlertOctagon, 
  MessageSquare, 
  Zap, 
  ArrowRight,
  TrendingUp,
  Clock
} from 'lucide-react';
import { 
  Contact, 
  Campaign, 
  Conversation, 
  AutomationRule 
} from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';

export interface DashboardViewProps {
  contacts: Contact[];
  campaigns: Campaign[];
  conversations: Conversation[];
  automationRules: AutomationRule[];
  whatsappConnected?: boolean;
  onNavigateTab: (tab: any) => void;
  onSelectConversation?: (convId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  contacts,
  campaigns,
  conversations,
  automationRules,
  whatsappConnected = false,
  onNavigateTab,
  onSelectConversation,
}) => {
  // Aggregate Metrics
  const totalContacts = contacts.length;
  const optedInContacts = contacts.filter((c) => c.marketingOptIn && !c.optOut).length;

  const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + (c.deliveredCount || 0), 0);
  const totalRead = campaigns.reduce((acc, c) => acc + (c.readCount || 0), 0);
  const totalFailed = campaigns.reduce((acc, c) => acc + (c.failedCount || 0), 0);

  const incomingReplies = conversations.filter((c) => c.lastIncomingMessageAt).length;
  const activeAutomations = automationRules.filter((r) => r.status === 'active').length;

  const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 100;
  const readRate = totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0;

  const statCards = [
    {
      id: 'stat-total-contacts',
      label: 'Total Contacts',
      value: totalContacts,
      subtext: `${optedInContacts} marketing opted-in`,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      id: 'stat-opted-in',
      label: 'Opted-In Contacts',
      value: optedInContacts,
      subtext: totalContacts > 0 ? `${Math.round((optedInContacts / totalContacts) * 100)}% compliance` : '0%',
      icon: CheckCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      id: 'stat-sent',
      label: 'Messages Sent',
      value: totalSent,
      subtext: `${totalDelivered} confirmed delivered`,
      icon: Send,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    {
      id: 'stat-delivered',
      label: 'Messages Delivered',
      value: totalDelivered,
      subtext: `${deliveryRate}% delivery rate`,
      icon: CheckCheck,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50',
    },
    {
      id: 'stat-read',
      label: 'Messages Read',
      value: totalRead,
      subtext: `${readRate}% open rate`,
      icon: Eye,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      id: 'stat-failed',
      label: 'Messages Failed',
      value: totalFailed,
      subtext: totalFailed > 0 ? 'Review error logs' : '0 deliverability issues',
      icon: AlertOctagon,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
    },
    {
      id: 'stat-replies',
      label: 'Replies Received',
      value: incomingReplies,
      subtext: 'Incoming 2-way threads',
      icon: MessageSquare,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      id: 'stat-automations',
      label: 'Active Automations',
      value: activeAutomations,
      subtext: `${automationRules.length} rules configured`,
      icon: Zap,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Overview Cards Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Operational Overview</h2>
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${whatsappConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {whatsappConnected ? 'WhatsApp Cloud API' : 'Simulated messaging metrics'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                id={card.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {card.label}
                  </span>
                  <div className={`w-8 h-8 rounded-lg ${card.bgColor} ${card.color} flex items-center justify-center`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight">
                  {card.value.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-1">{card.subtext}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Delivery Funnel Visual Bar */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Message Delivery Pipeline</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cumulative delivery lifecycle across all broadcast and automated communications
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-indigo-500"></span>
              <span className="text-slate-600">Sent ({totalSent})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-teal-500"></span>
              <span className="text-slate-600">Delivered ({totalDelivered})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-purple-500"></span>
              <span className="text-slate-600">Read ({totalRead})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-rose-500"></span>
              <span className="text-slate-600">Failed ({totalFailed})</span>
            </div>
          </div>
        </div>

        {/* Visual Multi-segment Progress Bar */}
        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
          {totalSent > 0 ? (
            <>
              <div
                style={{ width: `${(totalRead / Math.max(totalSent, 1)) * 100}%` }}
                className="bg-purple-500 h-full transition-all duration-500"
                title={`Read: ${totalRead}`}
              />
              <div
                style={{
                  width: `${(Math.max(totalDelivered - totalRead, 0) / Math.max(totalSent, 1)) * 100}%`,
                }}
                className="bg-teal-500 h-full transition-all duration-500"
                title={`Delivered (Unread): ${totalDelivered - totalRead}`}
              />
              <div
                style={{
                  width: `${(Math.max(totalSent - totalDelivered - totalFailed, 0) / Math.max(totalSent, 1)) * 100}%`,
                }}
                className="bg-indigo-400 h-full transition-all duration-500"
                title={`In Transit: ${Math.max(totalSent - totalDelivered - totalFailed, 0)}`}
              />
              {totalFailed > 0 && (
                <div
                  style={{ width: `${(totalFailed / Math.max(totalSent, 1)) * 100}%` }}
                  className="bg-rose-500 h-full transition-all duration-500"
                  title={`Failed: ${totalFailed}`}
                />
              )}
            </>
          ) : (
            <div className="w-full bg-slate-200 h-full text-[10px] text-slate-500 flex items-center justify-center font-medium">
              No messages dispatched yet
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-100">
          <div>
            <div className="text-xs text-slate-500">Delivery Success</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{deliveryRate}%</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Read Engagement</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{readRate}%</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total Audiences Reached</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{totalDelivered}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Compliance Blocked</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {contacts.filter((c) => c.optOut).length}
            </div>
          </div>
        </div>
      </section>

      {/* Two Column Section: Recent Broadcasts & Recent Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Broadcasts */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">Recent Broadcasts</h3>
              <button
                id="dash-view-all-broadcasts"
                type="button"
                onClick={() => onNavigateTab('broadcasts')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                View all <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                No broadcasts yet. Create your first WhatsApp campaign.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {campaigns.slice(0, 4).map((cmp) => (
                  <div key={cmp.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {cmp.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span>Audience: {cmp.audienceType}</span>
                        <span>•</span>
                        <span>{cmp.sentCount} sent</span>
                        <span>•</span>
                        <span className="text-teal-600 font-medium">{cmp.deliveredCount} delivered</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <Badge
                        variant={
                          cmp.status === 'Completed'
                            ? 'emerald'
                            : cmp.status === 'Sending'
                            ? 'blue'
                            : cmp.status === 'Cancelled'
                            ? 'rose'
                            : 'slate'
                        }
                      >
                        {cmp.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            id="dash-create-broadcast-btn"
            type="button"
            onClick={() => onNavigateTab('broadcasts')}
            className="mt-4 w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors text-center"
          >
            Launch New Broadcast Campaign
          </button>
        </section>

        {/* Recent Conversations */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">Recent Customer Inbox</h3>
              <button
                id="dash-view-all-inbox"
                type="button"
                onClick={() => onNavigateTab('inbox')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                Open Inbox <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {conversations.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                No conversations yet. Incoming WhatsApp conversations will appear here.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {conversations.slice(0, 4).map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => {
                      if (onSelectConversation) onSelectConversation(conv.id);
                      onNavigateTab('inbox');
                    }}
                    className="py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/80 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {conv.contactName}
                        </span>
                        <span className="text-xs text-slate-400">{conv.contactPhone}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {conv.lastMessage || 'No messages'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {conv.unreadCount > 0 && (
                        <span className="bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                      <Badge variant={conv.status === 'Open' ? 'emerald' : 'slate'} size="sm">
                        {conv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            id="dash-go-inbox-btn"
            type="button"
            onClick={() => onNavigateTab('inbox')}
            className="mt-4 w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors text-center"
          >
            Reply to Customer Conversations
          </button>
        </section>
      </div>
    </div>
  );
};
