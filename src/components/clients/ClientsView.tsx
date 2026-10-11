import React, { useState } from 'react';
import { 
  Building2, 
  Plus, 
  Edit2, 
  Power, 
  Check, 
  Search, 
  Users, 
  Send, 
  MessageSquare, 
  Radio, 
  CheckCircle,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { 
  Client, 
  Contact, 
  Campaign, 
  Conversation, 
  WhatsAppConnection 
} from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { EmptyState } from '../common/EmptyState.tsx';
import { ClientModal } from './ClientModal.tsx';
import { useToast } from '../common/Toast.tsx';

export interface ClientsViewProps {
  clients: Client[];
  activeClientId: string;
  contacts: Contact[];
  campaigns: Campaign[];
  conversations: Conversation[];
  whatsappConnections?: WhatsAppConnection[];
  isWhatsAppConnected?: boolean;
  onSelectActiveClient: (clientId: string) => void;
  onAddClient: (clientData: Omit<Client, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateClient: (id: string, updates: Partial<Client>) => void;
  onToggleClientStatus: (id: string) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  activeClientId,
  contacts,
  campaigns,
  conversations,
  whatsappConnections = [],
  isWhatsAppConnected = false,
  onSelectActiveClient,
  onAddClient,
  onUpdateClient,
  onToggleClientStatus,
}) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const filteredClients = clients.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = (c.name || '').toLowerCase().includes(q);
      const matchesCode = (c.code || '').toLowerCase().includes(q);
      const matchesContact = (c.contactName || '').toLowerCase().includes(q) || (c.contactEmail || '').toLowerCase().includes(q);
      if (!matchesName && !matchesCode && !matchesContact) return false;
    }
    return true;
  });

  const handleOpenAdd = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Client) => {
    setEditingClient(c);
    setIsModalOpen(true);
  };

  const handleSaveModal = (data: any) => {
    if (editingClient) {
      onUpdateClient(editingClient.id, data);
      toast(`Client "${data.name}" updated successfully.`);
    } else {
      onAddClient(data);
      toast(`Client "${data.name}" created successfully.`);
    }
  };

  const handleToggleStatus = (c: Client) => {
    onToggleClientStatus(c.id);
    const nextStatus = c.status === 'Active' ? 'Inactive' : 'Active';
    toast(`Client "${c.name}" is now ${nextStatus}.`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Client Accounts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage third-party business clients, isolate audiences, and configure multi-business messaging.
          </p>
        </div>

        <button
          id="add-client-btn"
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Client
        </button>
      </div>

      {/* Search & Overview bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            id="client-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by client name, code, or contact person..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span>Total: <strong className="text-slate-800">{clients.length}</strong></span>
          <span>•</span>
          <span>Active: <strong className="text-emerald-700">{clients.filter((c) => c.status === 'Active').length}</strong></span>
          <span>•</span>
          <span>Inactive: <strong className="text-slate-600">{clients.filter((c) => c.status === 'Inactive').length}</strong></span>
        </div>
      </div>

      {/* Clients Table / Cards */}
      {filteredClients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients found"
          description={
            searchQuery ? 'No clients match your search query.' : 'Create your first business client to begin.'
          }
          actionLabel={searchQuery ? undefined : 'Add Client'}
          onAction={searchQuery ? undefined : handleOpenAdd}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[10px] font-bold">
                <tr>
                  <th className="py-3 px-4">Client Name & Code</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Primary Contact</th>
                  <th className="py-3 px-3">WhatsApp Connection</th>
                  <th className="py-3 px-3 text-center">Contacts</th>
                  <th className="py-3 px-3 text-center">Campaigns</th>
                  <th className="py-3 px-3 text-center">Chats</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => {
                  const isActiveScope = client.id === activeClientId;
                  const clientContactsCount = contacts.filter((c) => c.clientId === client.id).length;
                  const clientCampaignsCount = campaigns.filter((c) => c.clientId === client.id).length;
                  const clientConversationsCount = conversations.filter((c) => c.clientId === client.id).length;
                  
                  // Connection metadata
                  const conn = whatsappConnections.find((w) => w.clientId === client.id);
                  const isConnected = conn?.connectionStatus === 'Connected' || isWhatsAppConnected;

                  return (
                    <tr
                      key={client.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isActiveScope ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isActiveScope
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {client.name ? client.name.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">{client.name}</span>
                              {isActiveScope && (
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded-sm border border-emerald-300">
                                  CURRENT SCOPE
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 rounded">
                                {client.code}
                              </span>
                              {client.description && (
                                <span className="text-[11px] text-slate-400 truncate max-w-[180px]" title={client.description}>
                                  • {client.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            client.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${client.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                          {client.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        {client.contactName || client.contactEmail || client.contactPhone ? (
                          <div>
                            <p className="font-medium text-slate-800">{client.contactName || '—'}</p>
                            <p className="text-[11px] text-slate-500 truncate max-w-[160px]">{client.contactEmail || client.contactPhone || ''}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No contact set</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                            }`}
                          />
                          <span className="text-xs text-slate-700">
                            {isConnected ? 'Connected' : 'Not Configured'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                          {conn?.displayPhoneNumber || 'Meta Cloud API V1'}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 text-center font-semibold text-slate-700">
                        {clientContactsCount}
                      </td>

                      <td className="py-3.5 px-3 text-center font-semibold text-slate-700">
                        {clientCampaignsCount}
                      </td>

                      <td className="py-3.5 px-3 text-center font-semibold text-slate-700">
                        {clientConversationsCount}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {client.status === 'Active' && !isActiveScope && (
                            <button
                              type="button"
                              onClick={() => onSelectActiveClient(client.id)}
                              className="px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition-colors"
                              title="Switch active scope to this Client"
                            >
                              Select
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(client)}
                            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                            title="Edit Client"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleStatus(client)}
                            className={`p-1.5 rounded-md transition-colors ${
                              client.status === 'Active'
                                ? 'text-slate-400 hover:text-amber-700 hover:bg-amber-50'
                                : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                            }`}
                            title={client.status === 'Active' ? 'Deactivate Client' : 'Activate Client'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveModal}
        client={editingClient}
      />
    </div>
  );
};
