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

  const logoWidths = {
    sm: 'w-28',
    md: 'w-36',
    lg: 'w-48',
    xl: 'w-60',
  };

  if (imageError) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-700 via-emerald-600 to-teal-500 flex items-center justify-center">
          <span className="font-extrabold text-white">W</span>
        </div>

        <div className="flex flex-col">
          <span className="font-bold text-slate-900">WatsManager</span>
          {subtext && (
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              {subtext}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center ${className}`}>
      <img
        src="/watsmanager-logo.png"
        alt="WatsManager Cloud API Platform"
        className={`${logoWidths[size]} h-auto object-contain`}
        onError={() => setImageError(true)}
      />
    </div>
  );
};
