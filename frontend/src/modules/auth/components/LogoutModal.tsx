// src/components/LogoutModal.tsx
import React from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/modules/auth/hooks/useAuth';

interface LogoutModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const LogoutModal: React.FC<LogoutModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  const { user } = useAuth();

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#000000]/80 backdrop-blur-md transition-opacity"
        onClick={onCancel}
      ></div>

      {/* Modal Content */}
      <div className="relative w-full max-w-[360px] overflow-hidden bg-[#111318] rounded-[28px] shadow-2xl border border-white/5 p-8 animate-in fade-in zoom-in-95 duration-200">

        <div className="flex flex-col items-center text-center">
          <h3 className="text-[22px] font-bold text-white mb-3 leading-tight">
            Are you sure you want to log out?
          </h3>

          <p className="text-[15px] text-gray-400 mb-8 px-2">
            Log out of <span className="text-gray-300 font-medium">StockPros</span> as <br />
            <span className="text-gray-300 italic">{user?.email || 'user'}</span>?
          </p>

          <div className="flex flex-col w-full gap-3">
            {/* Logout Button - Red from Sample 2 */}
            <button
              onClick={onConfirm}
              className="w-full py-3.5 rounded-full text-[15px] font-bold text-white bg-[#ef4444] hover:bg-[#dc2626] active:scale-[0.98] transition-all shadow-lg shadow-red-500/10"
            >
              Log out
            </button>

            {/* Cancel Button - Dark Gray from Sample 2 */}
            <button
              onClick={onCancel}
              className="w-full py-3.5 rounded-full text-[15px] font-bold text-white bg-[#1f2229] hover:bg-[#2a2e38] active:scale-[0.98] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
