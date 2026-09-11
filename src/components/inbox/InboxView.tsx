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
  Sparkles
} from 'lucide-react';
import { Conversation, Message, Contact, Organization } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { EmptyState } from '../common/EmptyState.tsx';
import { useToast } from '../common/Toast.tsx';

export interface InboxViewProps {
  conversations: Conversation[];
  messages: Message[];
  contacts: Contact[];
  organization: Organization;
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onSendMessage: (conversationId: string, text: string) => Promise<any>;
  onToggleStatus: (conversationId: string) => void;
  onOpenSimulator: () => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  conversations,
  messages,
  contacts,
  organization,
  selectedConversationId,
  onSelectConversation,
  onSendMessage,
  onToggleStatus,
  onOpenSimulator,
}) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Open' | 'Closed'>('ALL');
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
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
  const sessionWindow = useMemo(() => {
    if (!activeConversation || !activeConversation.lastIncomingMessageAt) {
      return { isOpen: false, hoursLeft: 0 };
    }
    const lastIncoming = new Date(activeConversation.lastIncomingMessageAt).getTime();
    const now = Date.now();
    const diffMs = now - lastIncoming;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 24) {
      return {
        isOpen: true,
        hoursLeft: Math.max(1, Math.round(24 - diffHours)),
      };
    }
    return { isOpen: false, hoursLeft: 0 };
  }, [activeConversation]);

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
            <button
              id="inbox-simulator-btn"
              type="button"
              onClick={onOpenSimulator}
              className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 transition-colors flex items-center gap-1"
            >
              <Bot className="w-3 h-3" />
              Simulate Message
            </button>
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
                            <span>
                              {msg.status === 'Read' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-blue-200" />
                              ) : msg.status === 'Delivered' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-200" />
                              ) : (
                                <Check className="w-3.5 h-3.5 text-emerald-200" />
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
              ) : (
                <form onSubmit={handleSend} className="flex items-center gap-2">
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
    </div>
  );
};
