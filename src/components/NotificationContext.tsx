import React, { createContext, useContext, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info';

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

interface NotificationContextType {
  showNotification: (message: string, type: NotificationType) => void;
  showConfirm: (message: string, onConfirm: () => void) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const showNotification = (message: string, type: NotificationType) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev, { id, message, type }]);
    
    // Automatically clear notification after 4 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  };

  const showConfirm = (message: string, onConfirm: () => void) => {
    setConfirmModal({ message, onConfirm });
  };

  const handleConfirm = () => {
    if (confirmModal) {
      confirmModal.onConfirm();
      setConfirmModal(null);
    }
  };

  return (
    <NotificationContext.Provider value={{ showNotification, showConfirm }}>
      {children}
      
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-55 flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        <AnimatePresence>
          {notifications.map((n) => {
            const Icon = n.type === 'success' ? CheckCircle2 : n.type === 'error' ? AlertCircle : Info;
            const borderClass = n.type === 'success' 
              ? 'border-emerald-500/20 bg-stone-900/90 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
              : n.type === 'error' 
                ? 'border-rose-500/20 bg-stone-900/90 text-rose-450 shadow-[0_0_20px_rgba(244,63,94,0.1)]' 
                : 'border-cyan-500/20 bg-stone-900/90 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.1)]';
            
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                className={`pointer-events-auto flex items-start justify-between gap-3 border rounded-2xl p-4 shadow-2xl backdrop-blur-md ${borderClass}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold leading-relaxed text-stone-200">{n.message}</p>
                  </div>
                </div>
                <button
                  onClick={() => setNotifications((prev) => prev.filter((notif) => notif.id !== n.id))}
                  className="text-stone-500 hover:text-stone-300 transition-colors shrink-0 mt-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(null)}
              className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-stone-850 bg-stone-950 p-7 shadow-2xl"
            >
              <h3 className="text-lg font-display font-semibold text-stone-100 mb-2">Confirm Action</h3>
              <p className="text-stone-400 text-xs md:text-sm leading-relaxed mb-6">{confirmModal.message}</p>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-5 py-2.5 border border-stone-800 bg-stone-900/40 text-stone-400 text-xs font-semibold rounded-xl hover:bg-stone-850 hover:text-stone-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-stone-950 text-xs font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.3)] cursor-pointer"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  );
}
