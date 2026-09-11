import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  UploadCloud, 
  FolderPlus, 
  Search, 
  Filter, 
  Trash2, 
  Edit, 
  ShieldCheck, 
  ShieldAlert, 
  CheckSquare, 
  Square,
  Users,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';
import { Contact, ContactGroup, OptInHistoryEvent } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { AddContactModal } from './AddContactModal.tsx';
import { ImportContactsModal } from './ImportContactsModal.tsx';
import { GroupsModal } from './GroupsModal.tsx';
import { ConsentDetailsModal } from './ConsentDetailsModal.tsx';
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
  const pageSize = 10;

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [consentModalContact, setConsentModalContact] = useState<Contact | null>(null);

  // Bulk actions state
  const [bulkGroupTarget, setBulkGroupTarget] = useState('');

  // Filter logic
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      // Search across clean fields
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const displayName = getContactDisplayName(c).toLowerCase();
        const matchesName = displayName.includes(q);
        const matchesPhone = c.phone.toLowerCase().includes(q);
        const matchesEmail = (c.email || '').toLowerCase().includes(q);
        const matchesCompany = (c.company || '').toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesEmail && !matchesCompany) {
          return false;
        }
      }

      // Group filter
      if (selectedGroupFilter !== 'ALL') {
        if (!c.groups || !c.groups.includes(selectedGroupFilter)) {
          return false;
        }
      }

      // Opt-in filter: Marketing Consented, Transactional Only, Not Consented, Opted Out
      if (selectedOptInFilter === 'MARKETING_CONSENTED') {
        if (!c.marketingOptIn || c.optOut) return false;
      } else if (selectedOptInFilter === 'TRANSACTIONAL_ONLY') {
        if (c.optOut || c.marketingOptIn || !c.transactionalOptIn) return false;
      } else if (selectedOptInFilter === 'NOT_CONSENTED') {
        if (c.optOut || c.marketingOptIn || c.transactionalOptIn) return false;
      } else if (selectedOptInFilter === 'OPTED_OUT') {
        if (!c.optOut) return false;
      }

      // Status filter: Active, Invalid, Blocked, Opted Out
      if (selectedStatusFilter !== 'ALL') {
        if (c.status !== selectedStatusFilter) return false;
      }

      return true;
    });
  }, [contacts, searchQuery, selectedGroupFilter, selectedOptInFilter, selectedStatusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredContacts.length / pageSize) || 1;
  const paginatedContacts = filteredContacts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Selection helpers
  const allCurrentPageSelected =
    paginatedContacts.length > 0 &&
    paginatedContacts.every((c) => selectedContactIds.includes(c.id));

  const toggleSelectAllPage = () => {
    if (allCurrentPageSelected) {
      const pageIds = new Set(paginatedContacts.map((c) => c.id));
      setSelectedContactIds(selectedContactIds.filter((id) => !pageIds.has(id)));
    } else {
      const newSelected = new Set([...selectedContactIds, ...paginatedContacts.map((c) => c.id)]);
      setSelectedContactIds(Array.from(newSelected));
    }
  };

  const toggleSelectContact = (id: string) => {
    if (selectedContactIds.includes(id)) {
      setSelectedContactIds(selectedContactIds.filter((x) => x !== id));
    } else {
      setSelectedContactIds([...selectedContactIds, id]);
    }
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

  const handleOptOutContact = (c: Contact) => {
    onUpdateContact(c.id, { 
      optOut: true, 
      marketingOptIn: false, 
      transactionalOptIn: false,
      optOutDate: new Date().toISOString(),
      optOutSource: 'Agent Manual Opt-Out',
      status: 'Opted Out' 
    });
    toast(`${getContactDisplayName(c)} has been opted out of marketing campaigns.`);
  };

  const handleResubscribeContact = (contactId: string) => {
    onUpdateContact(contactId, { 
      optOut: false, 
      marketingOptIn: true, 
      transactionalOptIn: true,
      optInDate: new Date().toISOString(),
      optInSource: 'Agent Resubscribe',
      consentNotes: 'Customer explicitly requested resubscription',
      status: 'Active' 
    });
    toast('Contact resubscribed with explicit customer consent.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Audience & Contacts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Clean contact directory, E.164 phone validation, and WhatsApp opt-in consent compliance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Manage Groups displays the exact count of actual groups */}
          <button
            id="open-groups-modal-btn"
            type="button"
            onClick={() => setIsGroupsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-2xs transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-slate-500" />
            Manage Groups ({groups.length})
          </button>
          <button
            id="open-import-modal-btn"
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-2xs transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
            Import CSV
          </button>
          <button
            id="open-add-contact-modal-btn"
            type="button"
            onClick={() => {
              setContactToEdit(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search box */}
          <div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="contacts-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search name, phone, email, or company..."
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Group dropdown - displays exact groups count matching Manage Groups */}
          <div>
            <select
              id="filter-group-select"
              value={selectedGroupFilter}
              onChange={(e) => {
                setSelectedGroupFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="ALL">All Groups ({groups.length})</option>
              {groups.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Opt-in filter */}
          <div>
            <select
              id="filter-optin-select"
              value={selectedOptInFilter}
              onChange={(e) => {
                setSelectedOptInFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="ALL">All Opt-In Statuses</option>
              <option value="MARKETING_CONSENTED">Marketing Consented</option>
              <option value="TRANSACTIONAL_ONLY">Transactional Only</option>
              <option value="NOT_CONSENTED">Not Consented</option>
              <option value="OPTED_OUT">Opted Out</option>
            </select>
          </div>

          {/* Status filter */}
          <div>
            <select
              id="filter-status-select"
              value={selectedStatusFilter}
              onChange={(e) => {
                setSelectedStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Opted Out">Opted Out</option>
              <option value="Invalid">Invalid</option>
              <option value="Blocked">Blocked</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions Panel if items selected */}
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

            <div className="flex items-center gap-2">
              <select
                id="bulk-group-select"
                value={bulkGroupTarget}
                onChange={(e) => setBulkGroupTarget(e.target.value)}
                className="px-2.5 py-1 bg-white border border-emerald-300 rounded-md text-xs font-medium text-slate-700"
              >
                <option value="">-- Choose Group --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>

              <button
                id="bulk-add-group-btn"
                type="button"
                disabled={!bulkGroupTarget}
                onClick={handleBulkAddToGroup}
                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-md font-semibold transition-colors"
              >
                Add to Group
              </button>

              <button
                id="bulk-remove-group-btn"
                type="button"
                disabled={!bulkGroupTarget}
                onClick={handleBulkRemoveFromGroup}
                className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 disabled:opacity-50 rounded-md font-semibold transition-colors"
              >
                Remove from Group
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Add a contact or import a CSV to populate your audience."
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
                      className="text-slate-400 hover:text-slate-600 flex items-center"
                    >
                      {allCurrentPageSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4" />
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
                {paginatedContacts.map((c) => {
                  const isSelected = selectedContactIds.includes(c.id);
                  const displayName = getContactDisplayName(c);

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-50/75 transition-colors ${
                        isSelected ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => toggleSelectContact(c.id)}
                          className="text-slate-400 hover:text-slate-600 flex items-center"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Contact Column: Full Name, email underneath if available */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div>{displayName}</div>
                        {c.email && (
                          <div className="text-[11px] text-slate-400 font-normal truncate max-w-[200px]">
                            {c.email}
                          </div>
                        )}
                      </td>

                      {/* Phone Column: normalized international phone */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-800">
                        {c.phone}
                      </td>

                      {/* Company: company only */}
                      <td className="py-3.5 px-4 text-slate-600">
                        {c.company || '—'}
                      </td>

                      {/* Groups badges */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {c.groups && c.groups.length > 0 ? (
                            c.groups.map((grp) => (
                              <span
                                key={grp}
                                className="bg-slate-100 text-slate-700 text-[10px] font-medium px-2 py-0.5 rounded-sm"
                              >
                                {grp}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </div>
                      </td>

                      {/* Opt-In Status: Marketing Consented | Transactional Only | Not Consented | Opted Out */}
                      <td className="py-3.5 px-4">
                        {c.optOut ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-sm border border-rose-100">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            Opted Out
                          </span>
                        ) : c.marketingOptIn ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-sm border border-emerald-100">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Marketing Consented
                          </span>
                        ) : c.transactionalOptIn ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-sm border border-blue-100">
                            Transactional Only
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded-sm">
                            Not Consented
                          </span>
                        )}
                      </td>

                      {/* Status: Active | Invalid | Blocked (or Opted Out) */}
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            c.status === 'Active'
                              ? 'emerald'
                              : c.status === 'Opted Out'
                              ? 'amber'
                              : c.status === 'Blocked'
                              ? 'slate'
                              : 'rose'
                          }
                        >
                          {c.status}
                        </Badge>
                      </td>

                      {/* Actions: Context-aware Opt-out / Consent history / Consent details */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Context-aware opt action:
                              - Marketing Consented -> Opt Out button
                              - Opted Out -> View Consent History
                              - Transactional Only / Not Consented -> Consent Details
                          */}
                          {c.marketingOptIn && !c.optOut ? (
                            <button
                              type="button"
                              onClick={() => handleOptOutContact(c)}
                              className="px-2 py-1 text-[11px] font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                              title="Opt-Out from marketing broadcasts"
                            >
                              Opt Out
                            </button>
                          ) : c.optOut ? (
                            <button
                              type="button"
                              onClick={() => setConsentModalContact(c)}
                              className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                              title="View Consent History & Audit Log"
                            >
                              View Consent History
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConsentModalContact(c)}
                              className="px-2 py-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                              title="Consent Details"
                            >
                              Consent Details
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setContactToEdit(c);
                              setIsAddModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                            title="Edit Contact"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete contact ${displayName}?`)) {
                                onDeleteContact(c.id);
                                toast('Contact deleted.');
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
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

        {/* Pagination bar */}
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
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-medium text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
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
        onSelectExistingContact={(existing) => {
          setContactToEdit(existing);
        }}
      />

      <ImportContactsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingContacts={contacts}
        groups={groups}
        onImportConfirm={(rows, defGrp) => {
          onImportContacts(rows, defGrp);
          toast(`Successfully imported ${rows.length} contacts.`);
        }}
      />

      <GroupsModal
        isOpen={isGroupsModalOpen}
        onClose={() => setIsGroupsModalOpen(false)}
        groups={groups}
        onAddGroup={(name, desc) => {
          onAddGroup(name, desc);
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
        onResubscribe={(cid) => handleResubscribeContact(cid)}
      />
    </div>
  );
};
