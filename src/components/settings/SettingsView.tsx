import React, { useState } from 'react';
import { 
  Building2, 
  Key, 
  Clock, 
  Users, 
  ShieldCheck, 
  Copy, 
  Check, 
  Save,
  Radio,
  ExternalLink,
  Bot
} from 'lucide-react';
import { Organization, UserProfile } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { useToast } from '../common/Toast.tsx';

export interface SettingsViewProps {
  organization: Organization;
  currentUser: UserProfile;
  onUpdateOrganization: (updates: Partial<Organization>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  organization,
  currentUser,
  onUpdateOrganization,
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'general' | 'whatsapp' | 'hours' | 'compliance'>('general');

  // Form states
  const [orgName, setOrgName] = useState(organization.name);
  const [phoneId, setPhoneId] = useState(organization.whatsappPhoneNumberId || organization.whatsappPhoneId || '');
  const [wabaId, setWabaId] = useState(organization.whatsappBusinessAccountId || organization.whatsappAccountId || '');
  const [accessToken, setAccessToken] = useState('');
  const [timezone, setTimezone] = useState(organization.businessHours?.timezone || 'UTC');
  const [startHour, setStartHour] = useState(organization.businessHours?.startHour || '09:00');
  const [endHour, setEndHour] = useState(organization.businessHours?.endHour || '17:00');
  const [isTesting, setIsTesting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const webhookUrl = `${window.location.origin}/api/webhook`;
  const webhookVerifyToken = 'whatsflow_verify_token_prod_2025';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateOrganization({ name: orgName });
    toast('Organization details saved');
  };

  const handleSaveWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    const hasCreds = Boolean(phoneId.trim());
    onUpdateOrganization({
      whatsappPhoneId: phoneId.trim(),
      whatsappPhoneNumberId: phoneId.trim(),
      whatsappAccountId: wabaId.trim(),
      whatsappBusinessAccountId: wabaId.trim(),
      whatsappConnected: hasCreds ? organization.whatsappConnected : false,
    });
    toast(hasCreds ? 'WhatsApp account details saved.' : 'WhatsApp credentials cleared. Workspace running in Demo Mode.');
  };

  const handleSaveHours = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateOrganization({
      businessHours: {
        enabled: true,
        startHour,
        endHour,
        timezone,
        days: [1, 2, 3, 4, 5],
      },
    });
    toast('Business hours saved');
  };

  const handleTestConnection = async () => {
    // If credentials are absent: Continue running normally in Demo Mode. Do not attempt a live Meta API call.
    if (!phoneId.trim() && !organization.whatsappPhoneNumberId && !organization.whatsappPhoneId) {
      toast('WhatsApp credentials are not configured. Enter your Phone Number ID and Access Token to test Meta connection.', 'info');
      return;
    }
    if (!accessToken.trim() && !organization.whatsappConnected) {
      toast('Please enter your WhatsApp Access Token to test live Meta connection.', 'info');
      return;
    }

    setIsTesting(true);
    try {
      const res = await fetch('/api/whatsapp/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: accessToken.trim() || undefined,
          phoneNumberId: phoneId.trim() || organization.whatsappPhoneNumberId || organization.whatsappPhoneId,
          wabaId: wabaId.trim() || organization.whatsappBusinessAccountId || organization.whatsappAccountId,
        }),
      });
      const data = await res.json();
      setIsTesting(false);
      if (data.connected) {
        toast(`WhatsApp Connection Verified! Verified Name: ${data.verifiedName || 'Business'}`);
        onUpdateOrganization({ whatsappConnected: true });
      } else {
        toast(data.error || 'Connection check failed: credentials not verified with Meta.', 'error');
      }
    } catch (e: any) {
      setIsTesting(false);
      toast('Could not contact server API endpoint.', 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">Workspace Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure Meta Cloud API credentials, webhook endpoints, and compliance guardrails.
        </p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-semibold text-slate-600">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'general'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          General Profile
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('whatsapp')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'whatsapp'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Key className="w-4 h-4" />
          WhatsApp Cloud API
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hours')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'hours'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          Business Hours
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('compliance')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'compliance'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Consent & Opt-Out
        </button>
      </div>

      {/* TAB 1: General */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveGeneral} className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Organization Profile</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Business / Organization Name
            </label>
            <input
              id="settings-org-name-input"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full max-w-md px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Organization Identifier (ID)
            </label>
            <input
              type="text"
              value={organization.id}
              disabled
              className="w-full max-w-md px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Active User Account
            </label>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg max-w-md text-xs flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900">{currentUser.displayName || 'Owner'}</div>
                <div className="text-slate-500 text-[11px]">{currentUser.email}</div>
              </div>
              <Badge variant="emerald" size="sm">
                {currentUser.role || 'Admin'}
              </Badge>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <button
              id="save-general-settings-btn"
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            >
              Save Organization
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: WhatsApp Cloud API */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveWhatsApp} className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Meta WhatsApp Cloud API Configuration</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Secure server-side credentials proxied through Node.js endpoints.
                </p>
              </div>
              {organization.whatsappConnected ? (
                <Badge variant="emerald">Live / Connected</Badge>
              ) : (
                <Badge variant="amber">Not Configured</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  WhatsApp Phone Number ID
                </label>
                <input
                  id="settings-phone-id-input"
                  type="text"
                  placeholder="e.g. 105938472910482"
                  value={phoneId}
                  onChange={(e) => setPhoneId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  WhatsApp Business Account ID (WABA)
                </label>
                <input
                  id="settings-waba-id-input"
                  type="text"
                  placeholder="e.g. 294820482910482"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  System User Access Token (Graph API)
                </label>
                <input
                  id="settings-access-token-input"
                  type="password"
                  placeholder={organization.whatsappConnected ? '••••••••••••••••' : 'EAAG... (Optional in Demo Mode)'}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Only required when connecting a live Meta WhatsApp Business account. In Demo Mode, no credentials or secrets are required.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                id="save-whatsapp-settings-btn"
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                Save Credentials
              </button>
              <button
                id="test-whatsapp-connection-btn"
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors"
              >
                {isTesting ? 'Testing Ping...' : 'Test API Connection'}
              </button>
              {organization.whatsappConnected && (
                <button
                  id="disconnect-whatsapp-btn"
                  type="button"
                  onClick={() => {
                    onUpdateOrganization({ whatsappConnected: false });
                    toast('Disconnected. Workspace is now in Demo Mode.', 'info');
                  }}
                  className="px-4 py-2 bg-white hover:bg-rose-50 text-rose-600 text-xs font-semibold rounded-lg border border-rose-200 transition-colors"
                >
                  Disconnect (Use Demo Mode)
                </button>
              )}
            </div>
          </form>

          {/* Webhook Endpoints Box */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Meta Webhook Registration</h3>
            <p className="text-xs text-slate-500">
              Configure these in your Meta App Dashboard under WhatsApp &gt; Configuration &gt; Callback URL.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Callback URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookUrl, 'url')}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1"
                  >
                    {copiedKey === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Verification Token</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookVerifyToken}
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookVerifyToken, 'token')}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1"
                  >
                    {copiedKey === 'token' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Business Hours */}
      {activeTab === 'hours' && (
        <form onSubmit={handleSaveHours} className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Operating Schedule & Off-Hours Logic</h3>
          <p className="text-xs text-slate-500">
            Automations can detect when incoming customer messages arrive outside of your working window.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              >
                <option value="UTC">UTC</option>
                <option value="Africa/Lagos">Africa/Lagos (GMT+1)</option>
                <option value="Africa/Accra">Africa/Accra (GMT+0)</option>
                <option value="Africa/Nairobi">Africa/Nairobi (GMT+3)</option>
                <option value="Europe/London">Europe/London (GMT+0)</option>
                <option value="America/New_York">America/New_York (EST)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Open Time</label>
              <input
                type="time"
                value={startHour}
                onChange={(e) => setStartHour(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Close Time</label>
              <input
                type="time"
                value={endHour}
                onChange={(e) => setEndHour(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <button
              id="save-hours-btn"
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            >
              Save Schedule
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: Consent & Opt-Out Policies */}
      {activeTab === 'compliance' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">WhatsApp Opt-In & Compliance Governance</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            WhatsApp Business terms mandate strict compliance with user consent. WhatsFlow enforces
            hardware-level protection before any message is sent.
          </p>

          <div className="space-y-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <span className="font-bold text-slate-800">Automatic Opt-Out Keywords (Zero-Latency)</span>
              <p className="text-slate-600">
                When a customer sends any of the following words, WhatsFlow immediately marks their
                contact record as opted-out and sends an unsubscribe receipt:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'ARRET'].map((k) => (
                  <span key={k} className="bg-rose-50 border border-rose-200 text-rose-800 font-mono text-[11px] px-2 py-0.5 rounded-sm">
                    {k}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <span className="font-bold text-slate-800">Automatic Resubscribe Keywords</span>
              <p className="text-slate-600">
                If an opted-out customer sends any of the following, consent is restored:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['START', 'UNSTOP', 'YES'].map((k) => (
                  <span key={k} className="bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[11px] px-2 py-0.5 rounded-sm">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
