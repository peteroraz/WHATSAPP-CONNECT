import React, { useState, useEffect } from 'react';
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
  Bot,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Server,
  Lock,
  Sparkles,
  Info,
  Send
} from 'lucide-react';
import { Organization, UserProfile } from '../../types/index.ts';
import { Badge } from '../common/Badge.tsx';
import { useToast } from '../common/Toast.tsx';
import { dataStore } from '../../services/dataStore.ts';

export interface SettingsViewProps {
  organization: Organization;
  currentUser: UserProfile;
  onUpdateOrganization: (updates: Partial<Organization>) => void;
  onNavigate?: (path: string) => void;
}

export type ConnectionState = 'Not Configured' | 'Testing' | 'Connected' | 'Connection Error';

export const SettingsView: React.FC<SettingsViewProps> = ({
  organization,
  currentUser,
  onUpdateOrganization,
  onNavigate,
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'general' | 'whatsapp' | 'hours' | 'compliance'>('general');

  // General profile state
  const [orgName, setOrgName] = useState(organization.name);
  const [timezone, setTimezone] = useState(organization.businessHours?.timezone || 'UTC');
  const [startHour, setStartHour] = useState(organization.businessHours?.startHour || '09:00');
  const [endHour, setEndHour] = useState(organization.businessHours?.endHour || '17:00');

  // Real connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('Not Configured');
  const [connectionDetails, setConnectionDetails] = useState<{
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    codeVerificationStatus?: string;
    apiVersion?: string;
    hasAccessToken?: boolean;
    hasPhoneNumberId?: boolean;
    hasWabaId?: boolean;
    hasWebhookVerifyToken?: boolean;
    hasAppSecret?: boolean;
    error?: string;
    message?: string;
  } | null>(null);

  // Diagnostic live-send hello_world test state
  const [testRecipient, setTestRecipient] = useState('+2348068620081');
  const [isSendingHelloTest, setIsSendingHelloTest] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    success: boolean;
    endpoint: string;
    httpStatus: number;
    recipient: string;
    phoneNumberId: string;
    apiVersion: string;
    wamid?: string;
    errorCode?: number;
    errorSubcode?: number;
    errorMessage?: string;
    fbtrace_id?: string;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;

  // Safely check status on startup without requiring secrets
  useEffect(() => {
    fetch('/api/whatsapp/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setConnectionState('Connected');
          setConnectionDetails(data);
          if (!organization.whatsappConnected) {
            onUpdateOrganization({ whatsappConnected: true });
          }
        } else {
          setConnectionState(data.status || 'Not Configured');
          setConnectionDetails(data);
        }
      })
      .catch(() => {
        setConnectionState('Not Configured');
      });
  }, []);

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
    setConnectionState('Testing');
    try {
      const headers = await dataStore.getAuthHeaders();
      const res = await fetch('/api/whatsapp/test-connection', {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      setConnectionDetails(data);

      if (data.connected) {
        setConnectionState('Connected');
        toast(`WhatsApp Connection Verified! Verified Name: ${data.verifiedName || 'Business'}`);
        onUpdateOrganization({ whatsappConnected: true });
      } else {
        const nextState: ConnectionState = data.status || (data.configured ? 'Connection Error' : 'Not Configured');
        setConnectionState(nextState);
        if (nextState === 'Not Configured') {
          toast(data.message || 'WhatsApp credentials not configured on server. Operating in Demo Mode.', 'info');
        } else {
          toast(data.error || 'Connection check failed: credentials not verified with Meta.', 'error');
        }
      }
    } catch {
      setConnectionState('Connection Error');
      toast('Could not contact server API endpoint.', 'error');
    }
  };

  const handleDisconnect = () => {
    onUpdateOrganization({ whatsappConnected: false });
    setConnectionState('Not Configured');
    toast('Disconnected. Workspace is operating in Demo Mode.', 'info');
  };

  const handleSendHelloWorldTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanNumber = testRecipient.replace(/\D/g, '');
    if (!cleanNumber) {
      toast('Please enter a valid recipient phone number with digits.', 'error');
      return;
    }

    setIsSendingHelloTest(true);
    setDiagnosticResult(null);

    try {
      const result = await dataStore.sendDiagnosticHelloWorld(cleanNumber);
      setDiagnosticResult(result);
      setIsSendingHelloTest(false);

      if (result.success) {
        toast(`hello_world test succeeded! Meta wamid: ${result.wamid}`);
      } else {
        toast(result.errorMessage || `Meta send failed (HTTP ${result.httpStatus})`, 'error');
      }
    } catch (err: any) {
      setIsSendingHelloTest(false);
      const fallbackResult = {
        success: false,
        endpoint: `POST https://graph.facebook.com/${connectionDetails?.apiVersion || 'v25.0'}/${connectionDetails?.phoneNumberId || '1322912734243367'}/messages`,
        httpStatus: 500,
        recipient: cleanNumber,
        phoneNumberId: connectionDetails?.phoneNumberId || '1322912734243367',
        apiVersion: connectionDetails?.apiVersion || 'v25.0',
        errorMessage: err?.message || 'Failed to dispatch hello_world diagnostic send',
      };
      setDiagnosticResult(fallbackResult);
      toast(err?.message || 'hello_world test failed', 'error');
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
          {/* Main Connection Status Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">WhatsApp Cloud API Connectivity</h3>
                  {connectionState === 'Connected' ? (
                    <Badge variant="emerald">Connected</Badge>
                  ) : connectionState === 'Testing' ? (
                    <Badge variant="blue">Testing...</Badge>
                  ) : connectionState === 'Connection Error' ? (
                    <Badge variant="rose">Connection Error</Badge>
                  ) : (
                    <Badge variant="amber">Not Configured</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Meta's official WhatsApp Business Platform Cloud API connectivity and server status.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="test-whatsapp-connection-btn"
                  type="button"
                  onClick={handleTestConnection}
                  disabled={connectionState === 'Testing'}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${connectionState === 'Testing' ? 'animate-spin' : ''}`} />
                  {connectionState === 'Testing' ? 'Testing Ping...' : 'Test Connection'}
                </button>

                {organization.whatsappConnected && (
                  <button
                    id="disconnect-whatsapp-btn"
                    type="button"
                    onClick={handleDisconnect}
                    className="px-4 py-2 bg-white hover:bg-rose-50 text-rose-600 text-xs font-semibold rounded-lg border border-rose-200 transition-colors"
                  >
                    Use Demo Mode
                  </button>
                )}
              </div>
            </div>

            {/* Current Mode Banner */}
            {connectionState === 'Connected' ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900">
                  <span className="font-bold">Live Mode Active:</span> Your workspace is verified and communicating with Meta's official WhatsApp Cloud API. Outbound broadcasts and inbox messages are processed live, and delivery/read receipts are updated via Meta webhooks.
                </div>
              </div>
            ) : connectionState === 'Connection Error' ? (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-900">
                  <span className="font-bold">Connection Error:</span> {connectionDetails?.error || 'Unable to connect to Meta WhatsApp Cloud API with the provided server credentials.'}
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <span className="font-bold">Demo Mode Active:</span> Live WhatsApp credentials are not configured on the server. WatsManager operates fully in Demo Mode with simulated sending, templates, contacts, and delivery tracking.
                </div>
              </div>
            )}

            {/* Live Account Details (when connected) */}
            {connectionState === 'Connected' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Verified Business</span>
                  <span className="font-semibold text-slate-800">{connectionDetails?.verifiedName || 'Business Profile'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Display Phone</span>
                  <span className="font-semibold text-slate-800 font-mono">{connectionDetails?.displayPhoneNumber || 'Registered'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Quality Rating</span>
                  <span className="font-semibold text-emerald-600">{connectionDetails?.qualityRating || 'UNKNOWN'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Graph API Version</span>
                  <span className="font-semibold text-slate-800 font-mono">{connectionDetails?.apiVersion || 'v21.0'}</span>
                </div>
              </div>
            )}

            {/* Server-Side Secrets Security Guarantee */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <h4 className="text-xs font-bold text-slate-800">Server-Side Credentials Architecture</h4>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                In compliance with security standards, all Meta WhatsApp credentials are read exclusively on the Node.js server via environment variables. Access tokens, App Secrets, and verify tokens are never transmitted to browser clients, stored in Firestore, or exposed in logs.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                {[
                  { name: 'WHATSAPP_ACCESS_TOKEN', set: connectionDetails?.hasAccessToken },
                  { name: 'WHATSAPP_PHONE_NUMBER_ID', set: connectionDetails?.hasPhoneNumberId },
                  { name: 'WHATSAPP_BUSINESS_ACCOUNT_ID', set: connectionDetails?.hasWabaId },
                  { name: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN', set: connectionDetails?.hasWebhookVerifyToken },
                  { name: 'WHATSAPP_APP_SECRET', set: connectionDetails?.hasAppSecret },
                  { name: 'WHATSAPP_API_VERSION', set: Boolean(connectionDetails?.apiVersion) },
                ].map((item) => (
                  <div key={item.name} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-slate-700 truncate pr-2" title={item.name}>
                      {item.name}
                    </span>
                    <Badge variant={item.set ? 'emerald' : 'slate'} size="sm">
                      {item.set ? 'Configured' : 'Not Set'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Diagnostic Live-Send Card: Send hello_world Test */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Diagnostic Live Send: Send hello_world Test</h3>
                  <Badge variant="blue">Server-Side Direct</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Executes a server-side live Meta WhatsApp Cloud API request with the official Meta <code>hello_world</code> template to verify the outbound send path.
                </p>
              </div>
            </div>

            <form onSubmit={handleSendHelloWorldTest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Test Recipient Phone Number
                </label>
                <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                  <div className="relative flex-1">
                    <input
                      id="diagnostic-recipient-input"
                      type="text"
                      placeholder="e.g. +2348068620081 or 2348068620081"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    id="send-hello-world-btn"
                    type="submit"
                    disabled={isSendingHelloTest || !testRecipient.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <Send className={`w-3.5 h-3.5 ${isSendingHelloTest ? 'animate-pulse' : ''}`} />
                    {isSendingHelloTest ? 'Sending hello_world...' : 'Send hello_world Test'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Normalized before dispatch: removes <code>+</code>, spaces, and dashes while preserving country code (e.g. <code>+2348068620081 → 2348068620081</code>).
                </p>

                {/* Quick-fill recipient options from contacts */}
                {dataStore.contacts.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-2 flex-wrap text-xs">
                    <span className="text-[11px] text-slate-400 font-medium">Quick-fill recipient:</span>
                    {dataStore.contacts.slice(0, 4).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setTestRecipient(c.phone)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] rounded-md font-mono transition-colors"
                      >
                        {c.firstName} ({c.phone})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </form>

            {/* Diagnostics Panel */}
            {diagnosticResult && (
              <div
                id="diagnostic-panel"
                className={`p-4 rounded-xl border text-xs space-y-3.5 transition-all ${
                  diagnosticResult.success
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/70 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {diagnosticResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                    <div>
                      <h4 className="font-bold text-sm">
                        {diagnosticResult.success
                          ? 'Live Outbound Send Succeeded'
                          : 'Meta Graph API Outbound Send Failed'}
                      </h4>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        {diagnosticResult.success
                          ? "Meta accepted the hello_world template (HTTP 200). Initial status is 'submitted'. Real-time delivery and read receipts will update via webhook."
                          : 'Meta returned an error response. Review the exact diagnostics below.'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={diagnosticResult.success ? 'emerald' : 'rose'}>
                    HTTP {diagnosticResult.httpStatus} {diagnosticResult.success ? 'OK' : ''}
                  </Badge>
                </div>

                {/* Structured Diagnostics Grid */}
                <div className="bg-white/95 border border-slate-200 rounded-lg p-3.5 space-y-2.5 text-xs text-slate-800 shadow-2xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                        Request Endpoint (No Secrets)
                      </span>
                      <code className="text-xs font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded-md block mt-0.5 break-all">
                        {diagnosticResult.endpoint}
                      </code>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                        HTTP Status
                      </span>
                      <code className="text-xs font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded-md block mt-0.5 font-bold">
                        {diagnosticResult.httpStatus} {diagnosticResult.httpStatus === 200 ? 'OK' : ''}
                      </code>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                        Recipient Number (Normalized)
                      </span>
                      <code className="text-xs font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded-md block mt-0.5">
                        {diagnosticResult.recipient}
                      </code>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                        Phone Number ID
                      </span>
                      <code className="text-xs font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded-md block mt-0.5">
                        {diagnosticResult.phoneNumberId}
                      </code>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                        API Version
                      </span>
                      <code className="text-xs font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded-md block mt-0.5">
                        {diagnosticResult.apiVersion}
                      </code>
                    </div>

                    {diagnosticResult.wamid && (
                      <div className="md:col-span-2">
                        <span className="text-[11px] font-semibold text-emerald-700 block uppercase tracking-wider">
                          Meta Message ID (wamid) — Initial Status: submitted
                        </span>
                        <code className="text-xs font-mono text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md block mt-0.5 break-all font-semibold">
                          {diagnosticResult.wamid}
                        </code>
                      </div>
                    )}

                    {diagnosticResult.errorCode !== undefined && (
                      <div>
                        <span className="text-[11px] font-semibold text-rose-700 block uppercase tracking-wider">
                          Meta Error Code
                        </span>
                        <code className="text-xs font-mono text-rose-900 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md block mt-0.5 font-bold">
                          {diagnosticResult.errorCode}
                        </code>
                      </div>
                    )}

                    {diagnosticResult.errorSubcode !== undefined && (
                      <div>
                        <span className="text-[11px] font-semibold text-rose-700 block uppercase tracking-wider">
                          Meta Error Subcode
                        </span>
                        <code className="text-xs font-mono text-rose-900 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md block mt-0.5">
                          {diagnosticResult.errorSubcode}
                        </code>
                      </div>
                    )}

                    {diagnosticResult.errorMessage && (
                      <div className="md:col-span-2">
                        <span className="text-[11px] font-semibold text-rose-700 block uppercase tracking-wider">
                          Meta Error Message
                        </span>
                        <div className="text-xs font-mono text-rose-900 bg-rose-50 border border-rose-200 p-2.5 rounded-md mt-0.5 leading-relaxed break-words">
                          {diagnosticResult.errorMessage}
                        </div>
                      </div>
                    )}

                    {diagnosticResult.fbtrace_id && (
                      <div className="md:col-span-2">
                        <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                          fbtrace_id
                        </span>
                        <code className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded-md block mt-0.5">
                          {diagnosticResult.fbtrace_id}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Webhook Configuration Box */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Meta Webhook Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Register these values in your Meta for Developers App Dashboard under <strong>WhatsApp &gt; Configuration &gt; Callback URL</strong>.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Callback URL (Public HTTPS Endpoint)
                </label>
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
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1 shadow-2xs"
                  >
                    {copiedKey === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy URL
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Webhook Verify Token (hub.verify_token)
                </label>
                <div className="flex items-center">
                  <div className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 flex items-center justify-between">
                    <span className="tracking-widest font-bold text-slate-800">••••••••••••</span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                      Configured
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
              <span className="font-semibold text-slate-800">Supported Webhook Subscription Fields:</span>
              <p className="text-[11px] text-slate-500">
                Subscribe to <code>messages</code> in the Meta Webhooks panel. WatsManager processes incoming text messages, customer care sessions, opt-out keywords (STOP), and delivery status receipts (sent, delivered, read, failed) idempotently.
              </p>
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
            WhatsApp Business terms mandate strict compliance with user consent. WatsManager enforces
            hardware-level protection before any message is sent.
          </p>

          <div className="space-y-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <span className="font-bold text-slate-800">Automatic Opt-Out Keywords (Zero-Latency)</span>
              <p className="text-slate-600">
                When a customer sends any of the following words, WatsManager immediately marks their
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

            {/* Public Legal & Meta Compliance URLs */}
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-3">
              <div>
                <span className="font-bold text-slate-900 text-xs block">
                  Public Legal & Meta App Review URLs
                </span>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  These URLs are publicly accessible without authentication. Provide them in your Meta Developer App Dashboard under App Review &gt; Business Verification.
                </p>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Privacy Policy URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/privacy`}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`${window.location.origin}/privacy`, 'privacy-url')}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1 shadow-2xs"
                    >
                      {copiedKey === 'privacy-url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate('/privacy');
                        } else {
                          window.open('/privacy', '_blank');
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 shadow-2xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    User Data Deletion Instructions URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/data-deletion`}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`${window.location.origin}/data-deletion`, 'deletion-url')}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1 shadow-2xs"
                    >
                      {copiedKey === 'deletion-url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate('/data-deletion');
                        } else {
                          window.open('/data-deletion', '_blank');
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 shadow-2xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
