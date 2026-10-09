import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Inbox, 
  Search, 
  Send, 
  Check, 
  CheckCheck, 
  Clock, 
  Bot, 
  ShieldAlert, 
  ShieldCheck, 
  User, 
  Radio, 
  AlertCircle,
  Sparkles,
  FileText,
  AlertTriangle,
  X
} from 'lucide-react';
import { Conversation, Message, Contact, Organization, MessageTemplate } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { EmptyState } from '../common/EmptyState.tsx';
import { Modal } from '../common/Modal.tsx';
import { useToast } from '../common/Toast.tsx';

export interface InboxViewProps {
  conversations: Conversation[];
  messages: Message[];
  contacts: Contact[];
  organization: Organization;
  templates?: MessageTemplate[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onSendMessage: (conversationId: string, text: string) => Promise<any>;
  onSendTemplateMessage?: (
    conversationId: string,
    template: MessageTemplate,
    variables?: Record<string, string>
  ) => Promise<any>;
  onToggleStatus: (conversationId: string) => void;
  onOpenSimulator: () => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  conversations,
  messages,
  contacts,
  organization,
  templates = [],
  selectedConversationId,
  onSelectConversation,
  onSendMessage,
  onSendTemplateMessage,
  onToggleStatus,
  onOpenSimulator,
}) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Open' | 'Closed'>('ALL');
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-select first conversation if none selected
  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      onSelectConversation(conversations[0].id);
    }
  }, [selectedConversationId, conversations, onSelectConversation]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedConversationId]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.contactName.toLowerCase().includes(q);
        const matchesPhone = c.contactPhone.toLowerCase().includes(q);
        const matchesMsg = (c.lastMessage || '').toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesMsg) return false;
      }
      return true;
    });
  }, [conversations, statusFilter, searchQuery]);

  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === selectedConversationId) || null;
  }, [conversations, selectedConversationId]);

  const activeContact = useMemo(() => {
    if (!activeConversation) return null;
    return contacts.find(
      (c) =>
        c.id === activeConversation.contactId ||
        c.phone.replace(/\D/g, '') === activeConversation.contactPhone.replace(/\D/g, '')
    ) || null;
  }, [activeConversation, contacts]);

  const activeMessages = useMemo(() => {
    if (!selectedConversationId) return [];
    return messages
      .filter((m) => m.conversationId === selectedConversationId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, selectedConversationId]);

  // 24-Hour WhatsApp Customer Care Window calculation
  // Determined from the latest real incoming customer message timestamp
  const sessionWindow = useMemo(() => {
    if (!activeConversation) {
      return { isOpen: false, hoursLeft: 0 };
    }

    const incomingMsgs = activeMessages.filter((m) => m.direction === 'incoming');
    const latestIncomingMsgTime = incomingMsgs.length > 0 ? incomingMsgs[incomingMsgs.length - 1].timestamp : null;
    const effectiveLastIncoming = latestIncomingMsgTime || activeConversation.lastIncomingMessageAt;

    if (!effectiveLastIncoming) {
      return { isOpen: false, hoursLeft: 0 };
    }

    const lastIncoming = new Date(effectiveLastIncoming).getTime();
    if (isNaN(lastIncoming) || lastIncoming <= 0) {
      return { isOpen: false, hoursLeft: 0 };
    }

    const now = Date.now();
    const diffMs = now - lastIncoming;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 24 && diffHours >= 0) {
      return {
        isOpen: true,
        hoursLeft: Math.max(1, Math.round(24 - diffHours)),
      };
    }
    return { isOpen: false, hoursLeft: 0 };
  }, [activeConversation, activeMessages]);

  // Templates eligible for outbound sending: in Live Mode, only APPROVED Meta Live Templates
  const eligibleTemplates = useMemo(() => {
    return templates.filter((t) => {
      const isApproved = (t.status || '').toUpperCase() === 'APPROVED';
      if (!isApproved) return false;
      if (organization.whatsappConnected) {
        return (
          t.isLiveMeta === true ||
          (!t.isDemo && t.name === 'hello_world') ||
          Boolean(t.whatsappTemplateId?.startsWith('meta_'))
        );
      }
      return true;
    });
  }, [templates, organization.whatsappConnected]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || !activeConversation || isSending) return;

    const textToSend = replyText.trim();
    setReplyText('');
    try {
      setIsSending(true);
      await onSendMessage(activeConversation.id, textToSend);
      setIsSending(false);
    } catch (err: any) {
      setIsSending(false);
      toast(err.message || 'Failed to send message', 'error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] max-w-7xl mx-auto bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col md:flex-row">
      {/* LEFT SIDE: Conversations List */}
      <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50">
        {/* Search and Filters Header */}
        <div className="p-3.5 border-b border-slate-200 bg-white space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Conversations</h2>
            {!organization.whatsappConnected && (
              <button
                id="inbox-simulator-btn"
                type="button"
                onClick={onOpenSimulator}
                className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 transition-colors flex items-center gap-1"
              >
                <Bot className="w-3 h-3" />
                Simulate Message
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              id="inbox-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chat or phone..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium text-slate-600">
            {(['ALL', 'Open', 'Closed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`flex-1 py-1 rounded-md transition-colors ${
                  statusFilter === tab
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'hover:text-slate-900'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List Scrollable */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No conversations. Use the simulator to generate incoming messages.
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No conversations match search or filters.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.id === selectedConversationId;
              return (
                <div
                  key={conv.id}
                  id={`conversation-item-${conv.id}`}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`p-3.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-emerald-50/70 border-l-4 border-emerald-600'
                      : 'hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-slate-900 truncate">
                      {conv.contactName}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {conv.lastMessageAt
                        ? new Date(conv.lastMessageAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 mb-1">
                    {conv.contactPhone}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-600 truncate flex-1">
                      {conv.lastMessage || 'No messages yet'}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.unreadCount > 0 && (
                        <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-xs font-semibold uppercase ${
                          conv.status === 'Open'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {conv.status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT SIDE: Active Conversation Thread */}
      <div className="flex-1 flex flex-col bg-[#F0F2F5] min-w-0">
        {activeConversation ? (
          <>
            {/* Chat Top Header */}
            <div className="p-3.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                  {activeConversation.contactName[0]?.toUpperCase() || 'C'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 truncate">
                      {activeConversation.contactName}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      {activeConversation.contactPhone}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs">
                    {activeContact?.optOut ? (
                      <span className="text-[10px] text-rose-600 font-semibold flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        Opted Out
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Opted In
                      </span>
                    )}

                    {activeContact?.groups && activeContact.groups.length > 0 && (
                      <span className="text-[10px] text-slate-400">
                        • Groups: {activeContact.groups.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status toggle & 24h Window badge */}
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                    sessionWindow.isOpen
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                  title="WhatsApp 24-Hour Customer Service Session Window"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {sessionWindow.isOpen
                      ? `24h Session Open (${sessionWindow.hoursLeft}h remaining)`
                      : 'Session Expired (Template Recommended)'}
                  </span>
                </div>

                <button
                  id="toggle-conversation-status-btn"
                  type="button"
                  onClick={() => onToggleStatus(activeConversation.id)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md border transition-colors ${
                    activeConversation.status === 'Open'
                      ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}
                >
                  {activeConversation.status === 'Open' ? 'Resolve / Close' : 'Reopen Thread'}
                </button>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {activeMessages.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">
                  No message history for this contact.
                </div>
              ) : (
                activeMessages.map((msg) => {
                  const isIncoming = msg.direction === 'incoming';
                  const isAutomation = msg.senderType === 'automation';
                  const isBroadcast = msg.senderType === 'broadcast';

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isIncoming ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-md rounded-xl p-3 shadow-2xs text-xs space-y-1 ${
                          isIncoming
                            ? 'bg-white text-slate-900 border border-slate-200 rounded-bl-xs'
                            : 'bg-emerald-600 text-white rounded-br-xs'
                        }`}
                      >
                        {/* Meta badge for automation or broadcast */}
                        {isAutomation && (
                          <div className="flex items-center gap-1 text-[10px] text-emerald-100 font-semibold bg-emerald-700/60 px-2 py-0.5 rounded-sm w-fit mb-1">
                            <Bot className="w-3 h-3" />
                            <span>Automated Rule Response</span>
                          </div>
                        )}

                        {isBroadcast && (
                          <div className="flex items-center gap-1 text-[10px] text-emerald-100 font-semibold bg-emerald-700/60 px-2 py-0.5 rounded-sm w-fit mb-1">
                            <Send className="w-3 h-3" />
                            <span>Broadcast: {msg.templateName || 'Template'}</span>
                          </div>
                        )}

                        <div className="whitespace-pre-wrap leading-relaxed">{msg.body}</div>

                        <div
                          className={`flex items-center justify-end gap-1 text-[10px] pt-0.5 ${
                            isIncoming ? 'text-slate-400' : 'text-emerald-100'
                          }`}
                        >
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {!isIncoming && (
                            <span className="flex items-center gap-1">
                              {msg.status === 'Read' ? (
                                <span className="flex items-center gap-0.5 text-[10px] text-blue-200 font-medium" title="Read by recipient">
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-200" />
                                  <span>Read</span>
                                </span>
                              ) : msg.status === 'Delivered' ? (
                                <span className="flex items-center gap-0.5 text-[10px] text-emerald-200 font-medium" title="Delivered to WhatsApp">
                                  <CheckCheck className="w-3.5 h-3.5 text-emerald-200" />
                                  <span>Delivered</span>
                                </span>
                              ) : msg.status === 'Failed' ? (
                                <span className="flex items-center gap-0.5 text-[10px] text-rose-300 font-semibold" title={`Failed: ${msg.failureReason || 'Error'}`}>
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
                                  <span>Failed</span>
                                </span>
                              ) : msg.status === 'submitted' ? (
                                <span className="flex items-center gap-1 text-[10px] text-emerald-100 font-semibold bg-emerald-700/60 px-1.5 py-0.5 rounded shadow-2xs" title="Submitted to Meta WhatsApp Cloud API">
                                  <Clock className="w-3 h-3 text-emerald-200 animate-pulse" />
                                  <span>Submitted</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-0.5 text-[10px] text-emerald-200 font-medium" title="Sent">
                                  <Check className="w-3.5 h-3.5 text-emerald-200" />
                                  <span>Sent</span>
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="p-3 bg-white border-t border-slate-200">
              {activeContact?.optOut ? (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center justify-between">
                  <span>
                    This contact has opted out of messages. Manual replies are restricted until they
                    resubscribe.
                  </span>
                </div>
              ) : !sessionWindow.isOpen && organization.whatsappConnected ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>24-Hour Customer Window Expired</span>
                    </div>
                    <Badge variant="amber" size="sm">Template Required</Badge>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Meta WhatsApp Business Platform policy restricts free-form text messages outside the 24-hour service window. To restart communication, send an approved Message Template.
                  </p>
                  <div>
                    <button
                      id="inbox-send-template-btn"
                      type="button"
                      onClick={() => {
                        if (eligibleTemplates.length > 0) {
                          const chosen =
                            eligibleTemplates.find((t) => t.name === 'hello_world') || eligibleTemplates[0];
                          setSelectedTemplateId(chosen.id);
                          setTemplateVariables({
                            '1': activeContact?.firstName || 'Customer',
                            '2': activeContact?.company || organization.name,
                          });
                        }
                        setIsTemplateModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Send Approved Template
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSend} className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Send an Approved Message Template"
                    onClick={() => {
                      if (eligibleTemplates.length > 0) {
                        const chosen =
                          eligibleTemplates.find((t) => t.name === 'hello_world') || eligibleTemplates[0];
                        setSelectedTemplateId(chosen.id);
                        setTemplateVariables({
                          '1': activeContact?.firstName || 'Customer',
                          '2': activeContact?.company || organization.name,
                        });
                      }
                      setIsTemplateModalOpen(true);
                    }}
                    className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-slate-200"
                  >
                    <FileText className="w-4 h-4" />
                  </button>

                  <textarea
                    id="chat-reply-textarea"
                    rows={1}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type WhatsApp message... (Press Enter to send)"
                    className="flex-1 p-2.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none max-h-24 bg-slate-50"
                  />
                  <button
                    id="chat-send-btn"
                    type="submit"
                    disabled={isSending || !replyText.trim()}
                    className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-xs"
                    title="Send WhatsApp Message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={Inbox}
              title="No Conversation Selected"
              description="Pick a chat from the left sidebar to inspect history and reply manually."
            />
          </div>
        )}
      </div>

      {/* Template Sender Modal */}
      {isTemplateModalOpen && (
        <Modal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          title="Send Approved WhatsApp Template"
          subtitle="Initiate customer communication compliant with Meta WhatsApp Cloud API rules"
        >
          <div className="space-y-4">
            {eligibleTemplates.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
                <p className="font-semibold text-slate-800">No Approved Templates Available</p>
                <p className="text-[11px] text-slate-400">
                  Please synchronize templates from Meta in the Templates tab before sending outside the 24-hour window.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Approved Template {organization.whatsappConnected && '(Meta Live Only)'}
                  </label>
                  <select
                    id="template-select-dropdown"
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const tplId = e.target.value;
                      setSelectedTemplateId(tplId);
                      const tpl = eligibleTemplates.find((t) => t.id === tplId);
                      if (tpl) {
                        setTemplateVariables({
                          '1': activeContact?.firstName || 'Customer',
                          '2': activeContact?.company || organization.name,
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  >
                    {eligibleTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.category} • {t.language}) {t.isLiveMeta ? '• Meta Live Template' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Preview and Variables */}
                {(() => {
                  const activeTpl = eligibleTemplates.find((t) => t.id === selectedTemplateId) || eligibleTemplates[0];
                  if (!activeTpl) return null;

                  const varMatches = Array.from(activeTpl.body.matchAll(/\{\{(\d+)\}\}/g));
                  const varNums = Array.from(new Set(varMatches.map((m) => m[1]))).sort();

                  let renderedPreview = activeTpl.body;
                  varNums.forEach((num) => {
                    const val = templateVariables[num] || `{{${num}}}`;
                    renderedPreview = renderedPreview.replace(new RegExp(`\\{\\{${num}\\}\\}`, 'g'), val);
                  });

                  return (
                    <div className="space-y-3">
                      {varNums.length > 0 && (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-700">
                            Template Variables
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {varNums.map((num) => (
                              <div key={num} className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-slate-500 w-10">
                                  {`{{${num}}}`}
                                </span>
                                <input
                                  type="text"
                                  placeholder={num === '1' ? 'First Name' : num === '2' ? 'Company' : 'Value'}
                                  value={templateVariables[num] || ''}
                                  onChange={(e) =>
                                    setTemplateVariables({
                                      ...templateVariables,
                                      [num]: e.target.value,
                                    })
                                  }
                                  className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-md text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">Message Preview</label>
                        <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                          {renderedPreview}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-send-template-btn"
                    type="button"
                    disabled={isSending || !selectedTemplateId}
                    onClick={async () => {
                      const tpl = templates.find((t) => t.id === selectedTemplateId);
                      if (!tpl || !activeConversation) return;

                      try {
                        setIsSending(true);
                        if (onSendTemplateMessage) {
                          await onSendTemplateMessage(activeConversation.id, tpl, templateVariables);
                        } else {
                          await onSendMessage(activeConversation.id, tpl.body);
                        }
                        setIsSending(false);
                        setIsTemplateModalOpen(false);
                        toast(`Template "${tpl.name}" dispatched successfully.`);
                      } catch (err: any) {
                        setIsSending(false);
                        toast(err.message || 'Failed to dispatch template', 'error');
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSending ? 'Sending...' : 'Send Template'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
