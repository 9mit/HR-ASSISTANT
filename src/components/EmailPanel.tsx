import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Send, CheckCircle2, Loader2 } from 'lucide-react';

interface EmailPanelProps {
  emailContent: string;
  candidateName: string;
  candidateEmail: string;
  candidateId: string;
}

export function EmailPanel({ emailContent, candidateName, candidateEmail, candidateId }: EmailPanelProps) {
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

  const handleSend = async () => {
    setIsSending(true);
    setSendError(null);
    try {
      const response = await fetch(`${apiUrl}/api/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          candidate_id: candidateId,
          email: candidateEmail,
          subject: `Update on your application at our company`,
          body: emailContent
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        setTransactionId(data.transactionId);
        setIsSent(true);
      } else {
        setSendError(data.detail || 'Failed to send email.');
      }
    } catch (error) {
      console.error('Failed to send email:', error);
      setSendError('Mail server unreachable. Please check that the backend is running.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-display font-semibold text-stone-100 flex items-center gap-2">
          <Mail className="w-5 h-5 text-emerald-400" />
          Automated Rejection Template
        </h3>
        <span className="text-xs font-medium text-stone-500 bg-stone-800 px-3 py-1 rounded-full">Draft</span>
      </div>
      
      <div className="bg-stone-950 border border-stone-800 rounded-xl p-6 text-sm text-stone-300 whitespace-pre-wrap font-mono leading-relaxed shadow-inner">
        {emailContent || 'No email template available for this candidate.'}
      </div>

      {sendError && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {sendError}
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <AnimatePresence mode="wait">
          {isSent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-end gap-1"
            >
              <div className="flex items-center gap-2 text-emerald-400 font-medium px-6 py-2">
                <CheckCircle2 className="w-5 h-5" />
                Email Sent Successfully
              </div>
              {transactionId && (
                <span className="text-xs text-stone-500 font-mono px-6">
                  ID: {transactionId}
                </span>
              )}
            </motion.div>
          ) : (
            <motion.button
              key="send"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSend}
              disabled={isSending}
              className="flex items-center gap-2 bg-stone-100 hover:bg-white disabled:opacity-70 disabled:hover:bg-stone-100 text-stone-950 px-8 py-3 rounded-xl font-medium transition-colors shadow-lg"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send to {candidateName}
                </>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
