import React from 'react';
import { AppLogo } from '../common/AppLogo.tsx';
import { ShieldCheck, ArrowRight, ExternalLink } from 'lucide-react';

interface PublicHeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({ currentPath, onNavigate }) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2.5 focus:outline-hidden group text-left"
          >
            <AppLogo size="sm" />
            <div>
              <span className="font-bold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                WatsManager
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] uppercase font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-sm">
                Legal & Compliance
              </span>
            </div>
          </button>
        </div>

        <nav className="flex items-center gap-2 sm:gap-4 text-xs">
          <button
            type="button"
            onClick={() => onNavigate('/privacy')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              currentPath === '/privacy'
                ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Privacy Policy
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/data-deletion')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              currentPath === '/data-deletion'
                ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Data Deletion
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="hidden sm:inline-flex items-center gap-1.5 ml-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-colors shadow-2xs"
          >
            <span>Open App</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </nav>
      </div>
    </header>
  );
};
