import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Save, Loader2, CheckCircle2, StickyNote } from 'lucide-react';

interface NotesPanelProps {
  candidateId: string;
  initialNotes?: string;
  onUpdateNotes: (notes: string) => void;
}

export function NotesPanel({ candidateId, initialNotes = '', onUpdateNotes }: NotesPanelProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // API call to save notes
      const response = await fetch(`${apiUrl}/api/save-note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ candidate_id: candidateId, notes }),
      });
      
      if (response.ok) {
        onUpdateNotes(notes);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save notes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-display font-semibold text-stone-100 flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-emerald-400" />
          Private Notes
        </h3>
        <span className="text-xs font-medium text-stone-500 bg-stone-800 px-3 py-1 rounded-full">Internal Only</span>
      </div>
      
      <div className="flex-1 flex flex-col">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add your private notes about this candidate here..."
          className="flex-1 w-full bg-stone-950 border border-stone-800 rounded-xl p-6 text-sm text-stone-300 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all resize-none min-h-[300px]"
        />
      </div>

      <div className="mt-8 flex justify-end">
        <AnimatePresence mode="wait">
          {isSaved ? (
            <motion.div
              key="saved"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 text-emerald-400 font-medium px-6 py-3"
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
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-70 disabled:hover:bg-emerald-600 text-stone-950 px-8 py-3 rounded-xl font-medium transition-colors shadow-lg shadow-emerald-500/20"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
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
