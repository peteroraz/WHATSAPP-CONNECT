import React from 'react';
import { ShieldCheck, Mail, ArrowUpRight } from 'lucide-react';
import { AppLogo } from '../common/AppLogo.tsx';

interface PublicFooterProps {
  onNavigate: (path: string) => void;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-slate-900 text-slate-300 py-12 px-4 sm:px-6 border-t border-slate-800 mt-16">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10 border-b border-slate-800">
          {/* Brand & Purpose */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AppLogo size="sm" />
              <span className="font-bold text-white text-base">WatsManager</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Enterprise customer messaging, broadcast campaigns, and automated response engine built directly on Meta's official WhatsApp Business Cloud API.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Compliant with WhatsApp Business Messaging Policies</span>
            </div>
          </div>

          {/* Quick Legal Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Legal & Compliance
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('/privacy');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('/data-deletion');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Data Deletion Instructions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('/');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Sign In / Workspace
                </button>
              </li>
            </ul>
          </div>

          {/* Privacy & Support Contact */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Privacy Enquiries
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              For privacy audits, compliance questions, or manual data erasure requests, please contact our Data Protection team:
            </p>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <Mail className="w-4 h-4 shrink-0" />
              <a
                href="mailto:peter.orazulike@gmail.com?subject=WatsManager%20Privacy%20Enquiry"
                className="hover:underline text-slate-200 hover:text-emerald-300"
              >
                peter.orazulike@gmail.com
              </a>
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>© {new Date().getFullYear()} WatsManager. All rights reserved.</p>
          <p className="text-center sm:text-right">
            WhatsApp is a registered trademark of Meta Platforms, Inc. WatsManager is an independent platform utilizing Meta's official Cloud API.
          </p>
        </div>
      </div>
    </footer>
  );
};
