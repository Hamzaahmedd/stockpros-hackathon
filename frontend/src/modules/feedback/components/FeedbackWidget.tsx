// src/modules/feedback/components/FeedbackWidget.tsx
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { FiMessageSquare, FiCheckCircle, FiX } from "react-icons/fi";
import { feedbackService } from "../services";

const MAX_LENGTH = 2000;

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const { pathname } = useLocation();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
    // Reset after the close animation would run; safe since the portal unmounts.
    setMessage("");
    setError(null);
    setSubmitted(false);
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Please enter a message before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await feedbackService.submit({ message: trimmed, page: pathname });
      setSubmitted(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "Something went wrong sending your feedback. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#000000]/80 backdrop-blur-md transition-opacity"
        onClick={handleClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-[420px] overflow-hidden bg-[#111318] rounded-[28px] shadow-2xl border border-white/5 p-8 animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-5 right-5 text-gray-500 hover:text-white transition-colors"
        >
          <FiX size={20} />
        </button>

        {submitted ? (
          <div className="flex flex-col items-center text-center py-4">
            <FiCheckCircle className="text-cyan-400 mb-4" size={40} />
            <h3 className="text-[20px] font-bold text-white mb-2">
              Thanks for the feedback!
            </h3>
            <p className="text-[14px] text-gray-400 mb-6 px-2">
              We read every message and use it to improve StockPros.
            </p>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-full text-[15px] font-bold text-white bg-[#1f2229] hover:bg-[#2a2e38] active:scale-[0.98] transition-all"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-[20px] font-bold text-white mb-2 leading-tight">
              Send feedback
            </h3>
            <p className="text-[14px] text-gray-400 mb-5">
              Found a bug, or have an idea for StockPros? Let us know.
            </p>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
              placeholder="Tell us what's on your mind..."
              rows={5}
              autoFocus
              className="w-full resize-none rounded-2xl bg-[#1a1c24] border border-white/10 focus:border-cyan-500/50 focus:outline-none text-[14px] text-gray-200 placeholder:text-gray-600 p-4 mb-2 transition-colors"
            />
            <div className="flex items-center justify-between mb-5">
              <span className="text-[11px] text-gray-600">
                {message.length}/{MAX_LENGTH}
              </span>
              {error && (
                <span className="text-[12px] text-red-400">{error}</span>
              )}
            </div>

            <div className="flex flex-col w-full gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting || !message.trim()}
                className="w-full py-3.5 rounded-full text-[15px] font-bold text-white bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] transition-all shadow-lg shadow-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {submitting ? "Sending..." : "Send feedback"}
              </button>
              <button
                onClick={handleClose}
                className="w-full py-3.5 rounded-full text-[15px] font-bold text-white bg-[#1f2229] hover:bg-[#2a2e38] active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export const FeedbackWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Send feedback"
        className="relative p-2.5 rounded-xl transition-all group border border-transparent text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/5 hover:border-black/5 dark:hover:border-white/5"
      >
        <FiMessageSquare className="text-xl group-active:scale-95 transition-transform" />
      </button>

      <FeedbackModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
