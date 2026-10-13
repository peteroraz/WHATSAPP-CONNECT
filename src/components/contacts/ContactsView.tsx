import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Edit,
  FolderPlus,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';
import type { Contact, ContactGroup, OptInHistoryEvent } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { AddContactModal } from './AddContactModal.tsx';
import { ImportContactsModal } from './ImportContactsModal.tsx';
import { GroupsModal } from './GroupsModal.tsx';
import { ConsentDetailsModal } from './ConsentDetailsModal.tsx';
import { ContactMessagingModal } from './ContactMessagingModal.tsx';
import { EmptyState } from '../common/EmptyState.tsx';
import { useToast } from '../common/Toast.tsx';
import { getContactDisplayName } from '../../utils/phoneUtils.ts';

export interface ContactsViewProps {
  contacts: Contact[];
  groups: ContactGroup[];
  optInHistory?: OptInHistoryEvent[];
  onAddContact: (data: any) => void;
  onUpdateContact: (id: string, updates: Partial<Contact>) => void;
  onDeleteContact: (id: string) => void;
  onBulkAddToGroup: (contactIds: string[], groupName: string) => void;
  onBulkRemoveFromGroup: (contactIds: string[], groupName: string) => void;
  onImportContacts: (rows: Partial<Contact>[], defaultGroup?: string) => void;
  onAddGroup: (name: string, description: string) => void;
  onRenameGroup: (id: string, newName: string) => void;
  onDeleteGroup: (id: string) => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  contacts,
  groups,
  optInHistory = [],
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  onBulkAddToGroup,
  onBulkRemoveFromGroup,
  onImportContacts,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
}) => {
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('ALL');
  const [selectedOptInFilter, setSelectedOptInFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkGroupTarget, setBulkGroupTarget] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [consentModalContact, setConsentModalContact] = useState<Contact | null>(null);
  const [messagingContacts, setMessagingContacts] = useState<Contact[]>([]);

  const pageSize = 10;

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const customValues = Object.values(contact.customFields || {})
          .join(' ')
          .toLowerCase();

        const searchable = [
          getContactDisplayName(contact),
          contact.phone,
          contact.email || '',
          contact.company || '',
          customValues,
        ]
          .join(' ')
          .toLowerCase();

        if (!searchable.includes(query)) return false;
      }

      if (
        selectedGroupFilter !== 'ALL' &&
        (!contact.groups || !contact.groups.includes(selectedGroupFilter))
      ) {
        return false;
      }

      if (selectedOptInFilter === 'MARKETING_CONSENTED') {
        if (!contact.marketingOptIn || contact.optOut) return false;
      } else if (selectedOptInFilter === 'TRANSACTIONAL_ONLY') {
        if (contact.optOut || contact.marketingOptIn || !contact.transactionalOptIn) return false;
      } else if (selectedOptInFilter === 'NOT_CONSENTED') {
        if (contact.optOut || contact.marketingOptIn || contact.transactionalOptIn) return false;
      } else if (selectedOptInFilter === 'OPTED_OUT') {
        if (!contact.optOut) return false;
      }

      if (selectedStatusFilter !== 'ALL' && contact.status !== selectedStatusFilter) {
        return false;
      }

      return true;
    });
  }, [
    contacts,
    searchQuery,
    selectedGroupFilter,
    selectedOptInFilter,
    selectedStatusFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));
  const paginatedContacts = filteredContacts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const selectedContacts = contacts.filter((contact) =>
    selectedContactIds.includes(contact.id)
  );

  const allCurrentPageSelected =
    paginatedContacts.length > 0 &&
    paginatedContacts.every((contact) => selectedContactIds.includes(contact.id));

  const toggleSelectAllPage = () => {
    if (allCurrentPageSelected) {
      const pageIds = new Set(paginatedContacts.map((contact) => contact.id));
      setSelectedContactIds((current) => current.filter((id) => !pageIds.has(id)));
      return;
    }

    setSelectedContactIds((current) =>
      Array.from(new Set([...current, ...paginatedContacts.map((contact) => contact.id)]))
    );
  };

  const toggleSelectContact = (id: string) => {
    setSelectedContactIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const handleBulkAddToGroup = () => {
    if (!bulkGroupTarget || selectedContactIds.length === 0) return;
    onBulkAddToGroup(selectedContactIds, bulkGroupTarget);
    toast(`Added ${selectedContactIds.length} contact(s) to "${bulkGroupTarget}"`);
    setBulkGroupTarget('');
    setSelectedContactIds([]);
  };

  const handleBulkRemoveFromGroup = () => {
    if (!bulkGroupTarget || selectedContactIds.length === 0) return;
    onBulkRemoveFromGroup(selectedContactIds, bulkGroupTarget);
    toast(`Removed ${selectedContactIds.length} contact(s) from "${bulkGroupTarget}"`);
    setBulkGroupTarget('');
    setSelectedContactIds([]);
  };

  const handleOptOutContact = (contact: Contact) => {
    onUpdateContact(contact.id, {
      optOut: true,
      marketingOptIn: false,
      transactionalOptIn: false,
      optOutDate: new Date().toISOString(),
      optOutSource: 'Agent Manual Opt-Out',
      status: 'Opted Out',
    });
    toast(`${getContactDisplayName(contact)} has been opted out.`);
  };

  const handleResubscribeContact = (contactId: string) => {
    onUpdateContact(contactId, {
      optOut: false,
      marketingOptIn: true,
      transactionalOptIn: true,
      optInDate: new Date().toISOString(),
      optInSource: 'Agent Resubscribe',
      consentNotes: 'Customer explicitly requested resubscription',
      status: 'Active',
    });
    toast('Contact resubscribed with explicit customer consent.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Audience & Contacts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage contacts, consent, one-to-one WhatsApp conversations and quick broadcasts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="open-groups-modal-btn"
            type="button"
            onClick={() => setIsGroupsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Manage Groups ({groups.length})
          </button>

          <button
            id="open-import-modal-btn"
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Import Contacts
          </button>

          <button
            id="open-add-contact-modal-btn"
            type="button"
            onClick={() => {
              setContactToEdit(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Contact
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              id="contacts-search-input"
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search contacts or custom fields..."
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <select
            id="filter-group-select"
            value={selectedGroupFilter}
            onChange={(event) => {
              setSelectedGroupFilter(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
          >
            <option value="ALL">All Groups ({groups.length})</option>
            {groups.map((group) => (
              <option key={group.id} value={group.name}>
                {group.name}
              </option>
            ))}
          </select>

          <select
            id="filter-optin-select"
            value={selectedOptInFilter}
            onChange={(event) => {
              setSelectedOptInFilter(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
          >
            <option value="ALL">All Opt-In Statuses</option>
            <option value="MARKETING_CONSENTED">Marketing Consented</option>
            <option value="TRANSACTIONAL_ONLY">Transactional Only</option>
            <option value="NOT_CONSENTED">Not Consented</option>
            <option value="OPTED_OUT">Opted Out</option>
          </select>

          <select
            id="filter-status-select"
            value={selectedStatusFilter}
            onChange={(event) => {
              setSelectedStatusFilter(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Opted Out">Opted Out</option>
            <option value="Invalid">Invalid</option>
            <option value="Blocked">Blocked</option>
          </select>
        </div>

        {selectedContactIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
            <div className="font-semibold text-emerald-900 flex items-center gap-2">
              <span>{selectedContactIds.length} contact(s) selected</span>
              <button
                type="button"
                onClick={() => setSelectedContactIds([])}
                className="text-slate-500 hover:text-slate-800 underline text-[11px]"
              >
                Clear Selection
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                id="bulk-send-whatsapp-btn"
                type="button"
                onClick={() => setMessagingContacts(selectedContacts)}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md font-semibold inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Send WhatsApp
              </button>

              <select
                id="bulk-group-select"
                value={bulkGroupTarget}
                onChange={(event) => setBulkGroupTarget(event.target.value)}
                className="px-2.5 py-1.5 bg-white border border-emerald-300 rounded-md text-xs"
              >
                <option value="">-- Choose Group --</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>

              <button
                id="bulk-add-group-btn"
                type="button"
                disabled={!bulkGroupTarget}
                onClick={handleBulkAddToGroup}
                className="px-3 py-1.5 bg-white text-emerald-800 border border-emerald-300 disabled:opacity-50 rounded-md font-semibold"
              >
                Add to Group
              </button>

              <button
                id="bulk-remove-group-btn"
                type="button"
                disabled={!bulkGroupTarget}
                onClick={handleBulkRemoveFromGroup}
                className="px-3 py-1.5 bg-white text-rose-700 border border-rose-200 disabled:opacity-50 rounded-md font-semibold"
              >
                Remove from Group
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Add a contact or import a contact file to populate your audience."
            actionLabel="Add First Contact"
            onAction={() => {
              setContactToEdit(null);
              setIsAddModalOpen(true);
            }}
          />
        ) : filteredContacts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No contacts match the current search or filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <button
                      id="select-all-page-btn"
                      type="button"
                      onClick={toggleSelectAllPage}
                    >
                      {allCurrentPageSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Groups</th>
                  <th className="py-3 px-4">Opt-In Status</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {paginatedContacts.map((contact) => {
                  const selected = selectedContactIds.includes(contact.id);
                  const displayName = getContactDisplayName(contact);

                  return (
                    <tr
                      key={contact.id}
                      className={`hover:bg-slate-50/75 ${
                        selected ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => toggleSelectContact(contact.id)}
                        >
                          {selected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div>{displayName}</div>
                        {contact.email && (
                          <div className="text-[11px] text-slate-400 font-normal">
                            {contact.email}
                          </div>
                        )}
                        {contact.customFields &&
                          Object.keys(contact.customFields).length > 0 && (
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              Custom fields: {Object.keys(contact.customFields).length}
                            </div>
                          )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-slate-800">
                        {contact.phone}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        {contact.company || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {contact.groups?.length ? (
                            contact.groups.map((group) => (
                              <span
                                key={group}
                                className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-sm"
                              >
                                {group}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {contact.optOut ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-sm">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Opted Out
                          </span>
                        ) : contact.marketingOptIn ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-sm">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Marketing Consented
                          </span>
                        ) : contact.transactionalOptIn ? (
                          <span className="inline-flex items-center text-[11px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-sm">
                            Transactional Only
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[11px] text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded-sm">
                            Not Consented
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            contact.status === 'Active'
                              ? 'emerald'
                              : contact.status === 'Opted Out'
                              ? 'amber'
                              : contact.status === 'Blocked'
                              ? 'slate'
                              : 'rose'
                          }
                        >
                          {contact.status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setMessagingContacts([contact])}
                            className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md inline-flex items-center gap-1"
                            title="Message on WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Message
                          </button>

                          {contact.marketingOptIn && !contact.optOut ? (
                            <button
                              type="button"
                              onClick={() => handleOptOutContact(contact)}
                              className="px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md"
                            >
                              Opt Out
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConsentModalContact(contact)}
                              className="px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md"
                            >
                              {contact.optOut ? 'Consent History' : 'Consent'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setContactToEdit(contact);
                              setIsAddModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
                            title="Edit Contact"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete contact ${displayName}?`)) {
                                onDeleteContact(contact.id);
                                toast('Contact deleted.');
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                            title="Delete Contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredContacts.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-500">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-700">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-700">
                {Math.min(currentPage * pageSize, filteredContacts.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-700">{filteredContacts.length}</span>{' '}
              contacts
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="p-1.5 rounded-md border border-slate-200 bg-white disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-medium text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                className="p-1.5 rounded-md border border-slate-200 bg-white disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AddContactModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setContactToEdit(null);
        }}
        onSave={(contactData) => {
          if (contactToEdit) {
            onUpdateContact(contactToEdit.id, contactData);
            toast('Contact updated.');
          } else {
            onAddContact(contactData);
            toast('Contact created.');
          }
          setContactToEdit(null);
        }}
        contactToEdit={contactToEdit}
        groups={groups}
        existingContacts={contacts}
        onSelectExistingContact={(existing) => setContactToEdit(existing)}
      />

      <ImportContactsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingContacts={contacts}
        groups={groups}
        onImportConfirm={(rows, defaultGroup) => {
          onImportContacts(rows, defaultGroup);
          toast(`Successfully imported ${rows.length} contacts.`);
        }}
      />

      <GroupsModal
        isOpen={isGroupsModalOpen}
        onClose={() => setIsGroupsModalOpen(false)}
        groups={groups}
        onAddGroup={(name, description) => {
          onAddGroup(name, description);
          toast(`Group "${name}" created.`);
        }}
        onRenameGroup={(id, newName) => {
          onRenameGroup(id, newName);
          toast('Group renamed.');
        }}
        onDeleteGroup={(id) => {
          onDeleteGroup(id);
          toast('Group deleted.');
        }}
      />

      <ConsentDetailsModal
        isOpen={Boolean(consentModalContact)}
        onClose={() => setConsentModalContact(null)}
        contact={consentModalContact}
        historyEvents={optInHistory}
        onResubscribe={handleResubscribeContact}
      />

      <ContactMessagingModal
        isOpen={messagingContacts.length > 0}
        onClose={() => setMessagingContacts([])}
        contacts={messagingContacts}
        onSent={() => {
          const count = messagingContacts.length;
          toast(
            count === 1
              ? 'WhatsApp message sent. The conversation is now available in Inbox.'
              : `Quick Broadcast sent to the eligible contacts from ${count} selected.`
          );
          setSelectedContactIds([]);
          setMessagingContacts([]);
        }}
      />
    </div>
  );
};
