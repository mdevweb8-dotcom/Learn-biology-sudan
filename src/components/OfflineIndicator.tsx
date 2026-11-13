import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-950/95 border border-amber-700/80 px-3.5 py-2 text-[11px] font-bold text-amber-200 shadow-lg backdrop-blur-md">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>وضع عدم الاتصال — يعمل بالكامل من الذاكرة المحلية</span>
    </div>
  );
};
