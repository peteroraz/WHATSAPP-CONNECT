import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Send, 
  Inbox, 
  Zap, 
  FileText, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  Radio,
  RotateCcw,
  Sparkles,
  Bot
} from 'lucide-react';
import { Organization, UserProfile } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { AppLogo } from '../common/AppLogo.tsx';

export type ActiveTab = 
  | 'dashboard' 
  | 'contacts' 
  | 'broadcasts' 
  | 'inbox' 
  | 'automations' 
  | 'templates' 
  | 'settings';

export interface AppLayoutProps {
  currentTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  organization: Organization;
  user: UserProfile;
  unreadMessagesCount: number;
  onLogout: () => void;
  onOpenSimulator: () => void;
  onResetDemoData: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  onSelectTab,
  organization,
  user,
  unreadMessagesCount,
  onLogout,
  onOpenSimulator,
  onResetDemoData,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [devMode, setDevMode] = useState(false);

  interface NavItem {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'broadcasts', label: 'Broadcasts', icon: Send },
    { 
      id: 'inbox', 
      label: 'Inbox', 
      icon: Inbox, 
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined 
    },
    { id: 'automations', label: 'Automations', icon: Zap },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (tab: ActiveTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800 antialiased font-sans">
      {/* Mobile Top Bar */}
      <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-30 sticky top-0">
        <div className="flex items-center gap-2.5">
          <AppLogo size="sm" />
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">WatsManager</h1>
            <p className="text-xs text-slate-500 truncate max-w-[150px]">{organization.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(!organization.whatsappConnected || devMode) && (
            <button
              id="mobile-simulator-btn"
              type="button"
              onClick={onOpenSimulator}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
              title="Simulate Inbound WhatsApp Message"
            >
              <Bot className="w-5 h-5 text-emerald-600" />
            </button>
          )}
          <button
            id="mobile-nav-toggle"
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Desktop & Mobile Sidebar */}
      <aside
        id="app-sidebar"
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top: Brand and Org */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <AppLogo size="md" showText subtext="Cloud API V1" />
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
              Organization
            </div>
            <div className="text-sm font-semibold text-slate-800 truncate" title={organization.name}>
              {organization.name}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${organization.whatsappConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span className="text-xs text-slate-500">
                {organization.whatsappConnected ? 'WhatsApp Live' : 'Dev / Demo Mode'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="bg-emerald-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Quick Utility Actions in Nav */}
          {(!organization.whatsappConnected || devMode) && (
            <div className="pt-4 mt-4 border-t border-slate-100 space-y-1">
              <div className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Testing & Controls</span>
                {organization.whatsappConnected && (
                  <Badge variant="amber" size="sm">Dev Mode</Badge>
                )}
              </div>
              <button
                id="sidebar-simulator-btn"
                type="button"
                onClick={onOpenSimulator}
                className="w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
              >
                <Bot className="w-4 h-4 text-emerald-600" />
                <span>Inbound Simulator</span>
              </button>
              <button
                id="sidebar-reset-btn"
                type="button"
                onClick={onResetDemoData}
                className="w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4 text-slate-400" />
                <span>Reset Demo Data</span>
              </button>
            </div>
          )}
        </nav>

        {/* User Account & Logout */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {user.displayName || 'Owner'}
                </div>
                <div className="text-[11px] text-slate-500 truncate" title={user.email}>
                  {user.email}
                </div>
              </div>
            </div>
            <button
              id="sidebar-logout-btn"
              type="button"
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Context Bar */}
        <div className="hidden md:flex items-center justify-between px-8 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 capitalize">
              {currentTab}
            </h2>
            {organization.whatsappConnected ? (
              <Badge variant="emerald" size="sm" id="header-whatsapp-status-badge">
                WhatsApp Cloud API (Live)
              </Badge>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="amber" size="sm" id="header-whatsapp-status-badge">
                  Demo Mode
                </Badge>
                <span className="text-xs text-slate-400 font-medium hidden lg:inline">
                  WhatsApp Not Connected
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {organization.whatsappConnected && (
              <button
                id="dev-mode-toggle-btn"
                type="button"
                onClick={() => setDevMode(!devMode)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  devMode
                    ? 'bg-amber-100 text-amber-900 border-amber-300 font-semibold'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                }`}
                title="Toggle sandbox developer controls in Live Mode"
              >
                <Bot className="w-3.5 h-3.5 text-amber-600" />
                <span>{devMode ? 'Dev Sandbox: ON' : 'Developer Sandbox'}</span>
              </button>
            )}

            {(!organization.whatsappConnected || devMode) && (
              <>
                <button
                  id="header-simulator-btn"
                  type="button"
                  onClick={onOpenSimulator}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors"
                >
                  <Bot className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Simulate Customer Message</span>
                </button>
                <button
                  id="header-reset-btn"
                  type="button"
                  onClick={onResetDemoData}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Reset Demo Data</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 p-4 md:p-8 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};
