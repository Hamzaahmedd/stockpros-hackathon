import React from 'react';
import { createPortal } from 'react-dom';

interface ConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'success' | 'info';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info'
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 text-white">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onCancel}
      ></div>

      {/* Modal Content */}
      <div className="relative w-full max-w-[360px] overflow-hidden bg-[#111318] rounded-[28px] shadow-2xl border border-white/5 p-8 animate-in fade-in zoom-in-95 duration-200">

        <div className="flex flex-col items-center text-center">
          <h3 className="text-[22px] font-bold text-white mb-3 leading-tight tracking-tight">
            {title}
          </h3>

          <p className="text-[15px] leading-relaxed text-gray-400 mb-8 px-2">
            {message}
          </p>

          <div className="flex flex-col w-full gap-3">
            <button
              onClick={() => {
                onConfirm();
                onCancel();
              }}
              className={`w-full py-3.5 rounded-full text-[15px] font-bold text-white transition-all active:scale-[0.98] shadow-lg ${
                variant === 'success' ? 'bg-[#10b981] hover:bg-[#059669] shadow-emerald-500/10' :
                variant === 'danger' ? 'bg-[#ef4444] hover:bg-[#dc2626] shadow-red-500/10' :
                'bg-[#06b6d4] hover:bg-[#0891b2] shadow-cyan-500/10'
              }`}
            >
              {confirmText}
            </button>

            <button
              onClick={onCancel}
              className="w-full py-3.5 rounded-full text-[15px] font-bold text-white bg-[#1f2229] hover:bg-[#2a2e38] active:scale-[0.98] transition-all"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
