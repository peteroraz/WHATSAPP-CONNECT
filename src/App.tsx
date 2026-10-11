import React, { useState, useEffect } from 'react';
import { authService } from './services/authService.ts';
import { dataStore } from './services/dataStore.ts';
import { Organization, UserProfile } from './types/index.ts';
import { ToastProvider, useToast } from './components/common/Toast.tsx';
import { AppLayout, ActiveTab } from './components/layout/AppLayout.tsx';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { ClientsView } from './components/clients/ClientsView.tsx';
import { ContactsView } from './components/contacts/ContactsView.tsx';
import { BroadcastsView } from './components/broadcasts/BroadcastsView.tsx';
import { InboxView } from './components/inbox/InboxView.tsx';
import { AutomationsView } from './components/automations/AutomationsView.tsx';
import { TemplatesView } from './components/templates/TemplatesView.tsx';
import { SettingsView } from './components/settings/SettingsView.tsx';
import { AuthView } from './components/auth/AuthView.tsx';
import { SimulatorModal } from './components/inbox/SimulatorModal.tsx';
import { AppLogo } from './components/common/AppLogo.tsx';
import { PrivacyPolicyView } from './components/public/PrivacyPolicyView.tsx';
import { DataDeletionView } from './components/public/DataDeletionView.tsx';

interface MainAppProps {
  onNavigate: (path: string) => void;
}

function MainApp({ onNavigate }: MainAppProps) {
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
    // 1. Authoritative check of server WhatsApp status on application initialization
    dataStore.checkServerWhatsAppStatus();

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

  useEffect(() => {
    if (currentTab === 'inbox' && selectedConversationId) {
      dataStore.setActiveConversationId(selectedConversationId);
    } else if (currentTab !== 'inbox') {
      dataStore.setActiveConversationId(null);
    }
  }, [selectedConversationId, currentTab]);

  // Ensure selected conversation always belongs to the currently active client
  // Declared at top-level before conditional returns to adhere to React Rules of Hooks
  useEffect(() => {
    if (selectedConversationId) {
      const activeClientId = dataStore.activeClientId;
      const belongsToActive = dataStore.conversations.some(
        (c) => c.clientId === activeClientId && c.id === selectedConversationId
      );
      if (!belongsToActive) {
        setSelectedConversationId(null);
        dataStore.setActiveConversationId(null);
      }
    }
  }, [selectedConversationId, dataStore.activeClientId, dataStore.conversations]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <AppLogo size="lg" className="animate-pulse" />
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
        onNavigate={onNavigate}
      />
    );
  }

  const activeClientId = dataStore.activeClientId;

  // Client-scoped collections for operational screens (Requirement 8)
  const clientContacts = dataStore.contacts.filter((c) => c.clientId === activeClientId);
  const clientGroups = dataStore.groups.filter((g) => g.clientId === activeClientId);
  const clientTemplates = dataStore.templates.filter((t) => t.clientId === activeClientId);
  const clientCampaigns = dataStore.campaigns.filter((c) => c.clientId === activeClientId);
  const clientConversations = dataStore.conversations.filter((c) => c.clientId === activeClientId);
  const clientMessages = dataStore.messages.filter((m) => m.clientId === activeClientId);
  const clientAutomationRules = dataStore.automationRules.filter((r) => r.clientId === activeClientId);
  const clientOptInHistory = dataStore.optInHistory.filter((h) => h.clientId === activeClientId);

  const unreadCount = clientConversations.reduce(
    (acc, c) => acc + (c.unreadCount || 0),
    0
  );

  const handleClientChange = (clientId: string) => {
    setSelectedConversationId(null);
    dataStore.setActiveConversationId(null);
    dataStore.setActiveClient(clientId);
  };

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

  const isWhatsAppConnected = dataStore.serverWhatsAppStatus === 'Connected';
  const effectiveOrg = currentOrg ? { ...currentOrg, whatsappConnected: isWhatsAppConnected } : currentOrg;

  return (
    <AppLayout
      currentTab={currentTab}
      onSelectTab={(tab) => setCurrentTab(tab)}
      organization={effectiveOrg}
      user={currentUser}
      unreadMessagesCount={unreadCount}
      clients={dataStore.clients}
      activeClientId={dataStore.activeClientId}
      onSelectClient={handleClientChange}
      onLogout={handleLogout}
      onOpenSimulator={() => setIsSimulatorOpen(true)}
      onResetDemoData={handleResetDemoData}
      onNavigate={onNavigate}
    >
      {currentTab === 'dashboard' && (
        <DashboardView
          contacts={clientContacts}
          campaigns={clientCampaigns}
          conversations={clientConversations}
          automationRules={clientAutomationRules}
          whatsappConnected={isWhatsAppConnected}
          onNavigateTab={(tab) => setCurrentTab(tab)}
          onSelectConversation={(convId) => {
            setSelectedConversationId(convId);
            dataStore.markConversationAsRead(convId);
          }}
        />
      )}

      {currentTab === 'clients' && (
        <ClientsView
          clients={dataStore.clients}
          activeClientId={dataStore.activeClientId}
          contacts={dataStore.contacts}
          campaigns={dataStore.campaigns}
          conversations={dataStore.conversations}
          whatsappConnections={dataStore.whatsappConnections}
          isWhatsAppConnected={isWhatsAppConnected}
          onSelectActiveClient={handleClientChange}
          onAddClient={(data) => dataStore.addClient(data)}
          onUpdateClient={(id, updates) => dataStore.updateClient(id, updates)}
          onToggleClientStatus={(id) => dataStore.toggleClientStatus(id)}
        />
      )}

      {currentTab === 'contacts' && (
        <ContactsView
          contacts={clientContacts}
          groups={clientGroups}
          optInHistory={clientOptInHistory}
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
          campaigns={clientCampaigns}
          contacts={clientContacts}
          groups={clientGroups}
          templates={clientTemplates}
          isWhatsAppConnected={isWhatsAppConnected}
          onLaunchCampaign={(data) => dataStore.createAndSendCampaign(data)}
        />
      )}

      {currentTab === 'inbox' && (
        <InboxView
          conversations={clientConversations}
          messages={clientMessages}
          contacts={clientContacts}
          organization={effectiveOrg}
          templates={clientTemplates}
          selectedConversationId={selectedConversationId}
          onSelectConversation={(id) => {
            setSelectedConversationId(id);
            dataStore.markConversationAsRead(id);
          }}
          onSendMessage={(convId, text) =>
            dataStore.sendManualMessage(convId, text)
          }
          onSendTemplateMessage={(convId, tpl, vars) =>
            dataStore.sendManualTemplateMessage(convId, tpl, vars)
          }
          onToggleStatus={(convId) => dataStore.toggleConversationStatus(convId)}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
          onRefreshEvents={() => dataStore.pollEvents()}
        />
      )}

      {currentTab === 'automations' && (
        <AutomationsView
          rules={clientAutomationRules}
          onAddRule={(data) => dataStore.addAutomationRule(data)}
          onUpdateRule={(id, updates) => dataStore.updateAutomationRule(id, updates)}
          onDeleteRule={(id) => dataStore.deleteAutomationRule(id)}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
        />
      )}

      {currentTab === 'templates' && (
        <TemplatesView
          templates={clientTemplates}
          onAddTemplate={(data) => dataStore.addTemplate(data)}
          onSyncMetaTemplates={() => dataStore.syncTemplatesFromMeta()}
          isWhatsAppConnected={isWhatsAppConnected}
        />
      )}

      {currentTab === 'settings' && (
        <SettingsView
          organization={effectiveOrg}
          currentUser={currentUser}
          onUpdateOrganization={(updates) => {
            const updatedOrg = { ...currentOrg, ...updates };
            setCurrentOrg(updatedOrg);
          }}
          onNavigate={onNavigate}
        />
      )}

      {/* Inbound WhatsApp Message Simulator Modal */}
      <SimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        contacts={clientContacts}
        organization={effectiveOrg}
        onSimulateIncoming={(phone, text) =>
          dataStore.processSimulatedIncoming(phone, text, effectiveOrg)
        }
      />
    </AppLayout>
  );
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.replace(/\/+$/, '') || '/';
      return p;
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname.replace(/\/+$/, '') || '/';
      setCurrentRoute(p);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    const cleanPath = path.replace(/\/+$/, '') || '/';
    if (window.location.pathname !== cleanPath) {
      window.history.pushState(null, '', cleanPath);
    }
    setCurrentRoute(cleanPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Public Unauthenticated Route: Privacy Policy
  if (currentRoute === '/privacy') {
    return <PrivacyPolicyView onNavigate={navigate} />;
  }

  // Public Unauthenticated Route: Data Deletion Instructions
  if (currentRoute === '/data-deletion') {
    return <DataDeletionView onNavigate={navigate} />;
  }

  return (
    <ToastProvider>
      <MainApp onNavigate={navigate} />
    </ToastProvider>
  );
}
