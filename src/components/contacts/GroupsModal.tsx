import React, { useState } from 'react';
import { Modal } from '../common/Modal.tsx';
import { ContactGroup } from '../../types/index.ts';
import { Plus, Trash2, Edit2, Check, X, Users } from 'lucide-react';

export interface GroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: ContactGroup[];
  onAddGroup: (name: string, description: string) => void;
  onRenameGroup: (id: string, newName: string) => void;
  onDeleteGroup: (id: string) => void;
}

export const GroupsModal: React.FC<GroupsModalProps> = ({
  isOpen,
  onClose,
  groups,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    onAddGroup(newGroupName.trim(), '');
    setNewGroupName('');
  };

  const startEdit = (group: ContactGroup) => {
    setEditingGroupId(group.id);
    setEditNameValue(group.name);
  };

  const saveEdit = (groupId: string) => {
    if (editNameValue.trim()) {
      onRenameGroup(groupId, editNameValue.trim());
    }
    setEditingGroupId(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Contact Groups"
      subtitle="Organize audiences for targeted broadcast campaigns."
      maxWidth="md"
      id="groups-manager-modal"
    >
      <div className="space-y-4">
        {/* Add Group Form */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            id="new-group-name-input"
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="e.g. Wholesale Distributors"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
          <button
            id="create-group-btn"
            type="submit"
            disabled={!newGroupName.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Group
          </button>
        </form>

        {/* Groups List */}
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No groups defined yet. Add your first group above.
            </div>
          ) : (
            groups.map((g) => (
              <div
                key={g.id}
                className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50 transition-colors"
              >
                {editingGroupId === g.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      className="flex-1 px-2.5 py-1 text-xs border border-emerald-500 rounded-sm outline-hidden"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(g.id)}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-sm"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingGroupId(null)}
                      className="p-1 text-slate-400 hover:bg-slate-100 rounded-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {g.name}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                        <Users className="w-3 h-3" />
                        <span>{g.memberCount || 0} members</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(g)}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-sm"
                        title="Rename Group"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete group "${g.name}"? Contacts will remain.`)) {
                            onDeleteGroup(g.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-sm"
                        title="Delete Group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
