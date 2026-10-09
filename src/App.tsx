import React, { useState, useEffect } from 'react';
import { authService } from './services/authService.ts';
import { dataStore } from './services/dataStore.ts';
import { Organization, UserProfile } from './types/index.ts';
import { ToastProvider, useToast } from './components/common/Toast.tsx';
import { AppLayout, ActiveTab } from './components/layout/AppLayout.tsx';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { ContactsView } from './components/contacts/ContactsView.tsx';
import { BroadcastsView } from './components/broadcasts/BroadcastsView.tsx';
import { InboxView } from './components/inbox/InboxView.tsx';
import { AutomationsView } from './components/automations/AutomationsView.tsx';
import { TemplatesView } from './components/templates/TemplatesView.tsx';
import { SettingsView } from './components/settings/SettingsView.tsx';
import { AuthView } from './components/auth/AuthView.tsx';
import { SimulatorModal } from './components/inbox/SimulatorModal.tsx';

function MainApp() {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // View state
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  // Reactive dataStore listener state
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribeAuth = authService.onAuthStateChanged((user, org) => {
      setCurrentUser(user);
      setCurrentOrg(org);
      setAuthLoading(false);

      if (org) {
        dataStore.initialize(org.id);
      }
    });

    const unsubscribeStore = dataStore.subscribe(() => {
      setTick((t) => t + 1);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeStore();
    };
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xl animate-pulse">
            W
          </div>
          <span className="text-xs text-slate-500 font-medium">Initializing WatsManager...</span>
        </div>
      </div>
    );
  }

  if (!currentUser || !currentOrg) {
    return (
      <AuthView
        onSuccess={(user, org) => {
          setCurrentUser(user);
          setCurrentOrg(org);
          dataStore.initialize(org.id);
        }}
      />
    );
  }

  const unreadCount = dataStore.conversations.reduce(
    (acc, c) => acc + (c.unreadCount || 0),
    0
  );

  const handleLogout = async () => {
    await authService.signOut();
    setCurrentUser(null);
    setCurrentOrg(null);
    toast('Logged out successfully.');
  };

  const handleResetDemoData = () => {
    if (confirm('Reset workspace sample contacts, campaigns, and automations?')) {
      dataStore.resetData(currentOrg.id);
      toast('Demo workspace data reset successfully.');
    }
  };

  return (
    <AppLayout
      currentTab={currentTab}
      onSelectTab={(tab) => setCurrentTab(tab)}
      organization={currentOrg}
      user={currentUser}
      unreadMessagesCount={unreadCount}
      onLogout={handleLogout}
      onOpenSimulator={() => setIsSimulatorOpen(true)}
      onResetDemoData={handleResetDemoData}
    >
      {currentTab === 'dashboard' && (
        <DashboardView
          contacts={dataStore.contacts}
          campaigns={dataStore.campaigns}
          conversations={dataStore.conversations}
          automationRules={dataStore.automationRules}
          whatsappConnected={currentOrg.whatsappConnected}
          onNavigateTab={(tab) => setCurrentTab(tab)}
          onSelectConversation={(convId) => {
            setSelectedConversationId(convId);
            dataStore.markConversationAsRead(convId);
          }}
        />
      )}

      {currentTab === 'contacts' && (
        <ContactsView
          contacts={dataStore.contacts}
          groups={dataStore.groups}
          optInHistory={dataStore.optInHistory}
          onAddContact={(data) => dataStore.addContact(data)}
          onUpdateContact={(id, updates) => dataStore.updateContact(id, updates)}
          onDeleteContact={(id) => dataStore.deleteContact(id)}
          onBulkAddToGroup={(ids, groupName) => dataStore.bulkAddToGroup(ids, groupName)}
          onBulkRemoveFromGroup={(ids, groupName) => dataStore.bulkRemoveFromGroup(ids, groupName)}
          onImportContacts={(rows, defGrp) => dataStore.importContacts(rows, defGrp)}
          onAddGroup={(name, desc) => dataStore.addGroup(name, desc)}
          onRenameGroup={(id, newName) => dataStore.renameGroup(id, newName)}
          onDeleteGroup={(id) => dataStore.deleteGroup(id)}
        />
      )}

      {currentTab === 'broadcasts' && (
        <BroadcastsView
          campaigns={dataStore.campaigns}
          contacts={dataStore.contacts}
          groups={dataStore.groups}
          templates={dataStore.templates}
          isWhatsAppConnected={currentOrg.whatsappConnected}
          onLaunchCampaign={(data) => dataStore.createAndSendCampaign(data)}
        />
      )}

      {currentTab === 'inbox' && (
        <InboxView
          conversations={dataStore.conversations}
          messages={dataStore.messages}
          contacts={dataStore.contacts}
          organization={currentOrg}
          templates={dataStore.templates}
          selectedConversationId={selectedConversationId}
          onSelectConversation={(id) => {
            setSelectedConversationId(id);
            dataStore.markConversationAsRead(id);
          }}
          onSendMessage={(convId, text) =>
            dataStore.sendManualMessage(convId, text, currentOrg.whatsappConnected)
          }
          onSendTemplateMessage={(convId, tpl, vars) =>
            dataStore.sendManualTemplateMessage(convId, tpl, vars, currentOrg.whatsappConnected)
          }
          onToggleStatus={(convId) => dataStore.toggleConversationStatus(convId)}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
        />
      )}

      {currentTab === 'automations' && (
        <AutomationsView
          rules={dataStore.automationRules}
          onAddRule={(data) => dataStore.addAutomationRule(data)}
          onUpdateRule={(id, updates) => dataStore.updateAutomationRule(id, updates)}
          onDeleteRule={(id) => dataStore.deleteAutomationRule(id)}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
        />
      )}

      {currentTab === 'templates' && (
        <TemplatesView
          templates={dataStore.templates}
          onAddTemplate={(data) => dataStore.addTemplate(data)}
          onSyncMetaTemplates={() => dataStore.syncTemplatesFromMeta()}
          isWhatsAppConnected={currentOrg.whatsappConnected}
        />
      )}

      {currentTab === 'settings' && (
        <SettingsView
          organization={currentOrg}
          currentUser={currentUser}
          onUpdateOrganization={(updates) => {
            const updatedOrg = { ...currentOrg, ...updates };
            setCurrentOrg(updatedOrg);
          }}
        />
      )}

      {/* Inbound WhatsApp Message Simulator Modal */}
      <SimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        contacts={dataStore.contacts}
        organization={currentOrg}
        onSimulateIncoming={(phone, text) =>
          dataStore.processSimulatedIncoming(phone, text, currentOrg)
        }
      />
    </AppLayout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <MainApp />
    </ToastProvider>
  );
}
