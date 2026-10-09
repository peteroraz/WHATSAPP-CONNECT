import React, { useState } from 'react';

export interface AppLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtext?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
  subtext,
}) => {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: 'w-7 h-7 rounded-lg text-sm',
    md: 'w-9 h-9 rounded-xl text-base',
    lg: 'w-11 h-11 rounded-xl text-lg',
    xl: 'w-14 h-14 rounded-2xl text-2xl',
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`${sizeClasses[size]} relative overflow-hidden bg-gradient-to-tr from-emerald-700 via-emerald-600 to-teal-500 shadow-sm flex items-center justify-center shrink-0 border border-emerald-400/20`}
      >
        {!imageError ? (
          <img
            src="/logo.png"
            alt="WatsManager Logo"
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="font-extrabold text-white tracking-tight">W</span>
        )}
      </div>

      {showText && (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 tracking-tight leading-tight">
            WatsManager
          </span>
          {subtext && (
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {subtext}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
