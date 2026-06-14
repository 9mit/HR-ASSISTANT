import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Save, Loader2, CheckCircle2, StickyNote } from 'lucide-react';
import { buildApiHeaders, getApiUrl } from '../api';
import { useNotifications } from './NotificationContext';

interface NotesPanelProps {
  candidateId: string;
  initialNotes?: string;
  onUpdateNotes: (notes: string) => void;
}

export function NotesPanel({ candidateId, initialNotes = '', onUpdateNotes }: NotesPanelProps) {
  const { showNotification } = useNotifications();
  const [notes, setNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const apiUrl = getApiUrl();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // API call to save notes
      const response = await fetch(`${apiUrl}/api/save-note`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ candidate_id: candidateId, notes }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save notes');
      }

      onUpdateNotes(notes);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to save notes.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-8 h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-display font-semibold text-stone-100 flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-emerald-400 text-glow-emerald" />
            Private Notes
          </h3>
          <span className="text-[10px] font-bold tracking-wider text-stone-500 bg-stone-900/50 border border-stone-850 px-3 py-1 rounded-full uppercase">Internal Only</span>
        </div>
        
        <div className="flex-1 flex flex-col">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add your private notes about this candidate here..."
            className="flex-1 w-full bg-stone-950/60 border border-stone-850 rounded-xl p-6 text-sm text-stone-300 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-450/15 focus:border-emerald-400/50 transition-all resize-none min-h-[250px]"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <AnimatePresence mode="wait">
          {isSaved ? (
            <motion.div
              key="saved"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 text-emerald-400 font-semibold px-6 py-3 text-xs uppercase tracking-wider"
            >
              <CheckCircle2 className="w-5 h-5" />
              Notes Saved
            </motion.div>
          ) : (
            <motion.button
              key="save"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-stone-950 px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-stone-950" />
                  Save Notes
                </>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
