import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'motion/react';
import { Upload, FileText, XCircle, Briefcase, IndianRupee, Loader2, Users, Cpu, Mail, Building2, Send } from 'lucide-react';
import { LocalModelOption } from '../types';

interface UploadPanelProps {
  role: string;
  setRole: (r: string) => void;
  salaryMin: string;
  setSalaryMin: (s: string) => void;
  salaryMax: string;
  setSalaryMax: (s: string) => void;
  files: File[];
  setFiles: (f: File[] | ((prev: File[]) => File[])) => void;
  availableModels: LocalModelOption[];
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  isLoadingModels: boolean;
  modelError: string | null;
  isProcessing: boolean;
  processResumes: () => void;
  removeFile: (index: number) => void;
  // New SaaS fields
  hrEmail: string;
  setHrEmail: (e: string) => void;
  hrName: string;
  setHrName: (n: string) => void;
  companyName: string;
  setCompanyName: (c: string) => void;
  autoSendEmails: boolean;
  setAutoSendEmails: (a: boolean) => void;
}

export function UploadPanel({
  role,
  setRole,
  salaryMin,
  setSalaryMin,
  salaryMax,
  setSalaryMax,
  files,
  setFiles,
  availableModels,
  selectedModelId,
  setSelectedModelId,
  isLoadingModels,
  modelError,
  isProcessing,
  processResumes,
  removeFile,
  hrEmail,
  setHrEmail,
  hrName,
  setHrName,
  companyName,
  setCompanyName,
  autoSendEmails,
  setAutoSendEmails,
}: UploadPanelProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles]);
  }, [setFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    }
  } as any);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-[2rem] p-8 shadow-xl shadow-black/45"
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-stone-50">Start a screening batch</h2>
          <p className="mt-1 text-xs md:text-sm text-stone-500">Upload resumes, set the role budget, and let TalentLens score on anonymized inputs.</p>
        </div>
        <div className="rounded-xl border border-stone-850 bg-stone-900/40 px-4 py-1.5 text-xs text-stone-400">
          PDF, DOCX, TXT
        </div>
      </div>

      {/* Row 1: Role + Model + Salary */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div>
          <label htmlFor="target-role" className="mb-2 block text-xs font-medium text-stone-400">Target Role</label>
          <div className="relative">
            <Briefcase className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
            <input 
              id="target-role"
              type="text" 
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Senior Frontend Developer"
              className="w-full rounded-2xl border border-stone-850 bg-stone-900/40 py-2.5 pl-11 pr-4 text-sm text-stone-100 outline-none transition-all placeholder:text-stone-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
            />
          </div>
        </div>
        <div>
          <label htmlFor="ai-model" className="mb-2 block text-xs font-medium text-stone-400">AI Evaluation Model</label>
          <div className="relative">
            <Cpu className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
            <select
              id="ai-model"
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              disabled={isLoadingModels}
              className="w-full appearance-none rounded-2xl border border-stone-850 bg-stone-900/40 py-2.5 pl-11 pr-10 text-sm text-stone-100 outline-none transition-all focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60"
            >
              {[...new Set(availableModels.map(m => m.provider))].map(provider => (
                <optgroup key={provider} label={provider.toUpperCase() === 'BUILTIN' ? 'DETERMINISTIC' : provider.toUpperCase()}>
                  {availableModels
                    .filter(m => m.provider === provider)
                    .map(model => (
                      <option key={model.id} value={model.id}>
                        {model.label} {model.status === 'missing_key' ? '(Fallback)' : ''} {['openai', 'anthropic', 'google', 'groq'].includes(model.provider) ? '☁️' : '🏠'}
                      </option>
                    ))
                  }
                </optgroup>
              ))}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <div className={`h-2 w-2 rounded-full ${['openai', 'anthropic', 'google', 'groq'].includes(availableModels.find(m => m.id === selectedModelId)?.provider || '') ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-stone-500 flex items-center gap-1.5">
            {isLoadingModels ? (
              <>
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Scanning AI runtimes...
              </>
            ) : (
              <>
                {['openai', 'anthropic', 'google', 'groq'].includes(availableModels.find(m => m.id === selectedModelId)?.provider || '') ? (
                  <span className="text-amber-400/80">⚠️ Cloud: Anonymized data sent to {availableModels.find(m => m.id === selectedModelId)?.provider}.</span>
                ) : (
                  <span className="text-emerald-400/80">🔒 Privacy: Data stays 100% local.</span>
                )}
              </>
            )}
          </p>
          {modelError && (
            <p className="mt-2 text-[10px] text-amber-300">{modelError}</p>
          )}
        </div>
        <div>
          <label htmlFor="salary-min" className="mb-2 block text-xs font-medium text-stone-400">Salary Range Min (LPA)</label>
          <div className="relative">
            <IndianRupee className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
            <input 
              id="salary-min"
              type="number" 
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
              placeholder="e.g. 1200000"
              className="w-full rounded-2xl border border-stone-850 bg-stone-900/40 py-2.5 pl-11 pr-4 text-sm text-stone-100 outline-none transition-all placeholder:text-stone-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
            />
          </div>
        </div>
        <div>
          <label htmlFor="salary-max" className="mb-2 block text-xs font-medium text-stone-400">Salary Range Max (LPA)</label>
          <div className="relative">
            <IndianRupee className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
            <input 
              id="salary-max"
              type="number" 
              value={salaryMax}
              onChange={(e) => setSalaryMax(e.target.value)}
              placeholder="e.g. 1800000"
              className="w-full rounded-2xl border border-stone-850 bg-stone-900/40 py-2.5 pl-11 pr-4 text-sm text-stone-100 outline-none transition-all placeholder:text-stone-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
            />
          </div>
        </div>
      </div>

      {/* Row 2: Email Automation Settings */}
      <div className="mb-8 rounded-2xl border border-stone-850/60 bg-stone-900/20 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-medium text-stone-400 uppercase tracking-wider">
          <Send className="h-4 w-4 text-emerald-400" />
          Email Automation
          <span className="text-[10px] font-normal text-stone-500 lowercase tracking-normal">(Candidates will be notified automatically)</span>
        </h3>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <div>
            <label className="mb-2 block text-[10px] font-medium text-stone-500 uppercase tracking-wider">Your Name</label>
            <div className="relative">
              <Users className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
              <input 
                type="text" 
                value={hrName}
                onChange={(e) => setHrName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="w-full rounded-xl border border-stone-850 bg-stone-900/40 py-2 pl-9 pr-4 text-xs text-stone-100 outline-none transition-all placeholder:text-stone-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-medium text-stone-500 uppercase tracking-wider">Your Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
              <input 
                type="email" 
                value={hrEmail}
                onChange={(e) => setHrEmail(e.target.value)}
                placeholder="hr@company.com"
                className="w-full rounded-xl border border-stone-850 bg-stone-900/40 py-2 pl-9 pr-4 text-xs text-stone-100 outline-none transition-all placeholder:text-stone-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-medium text-stone-500 uppercase tracking-wider">Company Name</label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
              <input 
                type="text" 
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full rounded-xl border border-stone-850 bg-stone-900/40 py-2 pl-9 pr-4 text-xs text-stone-100 outline-none transition-all placeholder:text-stone-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
              />
            </div>
          </div>
          <div className="flex items-end">
            <label className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-stone-850 bg-stone-900/40 px-4 py-2 transition-all hover:border-emerald-500/20">
              <div className="relative">
                <input 
                  type="checkbox"
                  checked={autoSendEmails}
                  onChange={(e) => setAutoSendEmails(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full border border-stone-700 bg-stone-800 transition-colors peer-checked:border-emerald-400/40 peer-checked:bg-emerald-500/15" />
                <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-stone-500 transition-all peer-checked:translate-x-4 peer-checked:bg-emerald-400" />
              </div>
              <span className="text-xs text-stone-300 font-medium">Auto-notify</span>
            </label>
          </div>
        </div>
        {autoSendEmails && (
          <p className="mt-3 text-[10px] text-emerald-400/70 leading-normal">
            ✉️ After scoring, candidates will automatically receive selection/rejection emails from "{hrName || 'HR'} via TalentLens". 
            Candidates can reply directly to {hrEmail || 'your email'}.
          </p>
        )}
      </div>

      <div 
        {...getRootProps()} 
        className={`relative cursor-pointer overflow-hidden rounded-[1.75rem] border-2 border-dashed p-10 text-center transition-all duration-300 ${
          isDragActive
            ? 'border-emerald-400 bg-emerald-500/5'
            : 'border-stone-850 hover:border-emerald-400/45 hover:bg-stone-900/40'
        }`}
      >
        <input {...getInputProps()} />
        <motion.div 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-stone-800 bg-stone-900/60"
        >
          <Upload className="h-6 w-6 text-emerald-400" />
        </motion.div>
        <p className="text-sm font-medium text-stone-200">Drag and drop resumes here</p>
        <p className="mt-1.5 text-xs text-stone-500 leading-normal">TalentLens will parse malformed files gracefully and flag missing fields.</p>
      </div>

      {files.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-8"
        >
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">Selected Files ({files.length})</h3>
          <ul className="space-y-2">
            {files.map((file, index) => (
              <motion.li 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                key={index} 
                className="group flex items-center justify-between rounded-xl border border-stone-850/60 bg-stone-900/30 px-4 py-2.5 transition-colors hover:border-stone-800"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4.5 w-4.5 text-cyan-400" />
                  <span className="max-w-xs truncate text-xs text-stone-300 md:max-w-md">{file.name}</span>
                </div>
                <button onClick={() => removeFile(index)} className="p-1 text-stone-600 transition-colors hover:text-rose-400">
                  <XCircle className="h-4 w-4" />
                </button>
              </motion.li>
            ))}
          </ul>
          
          <div className="mt-6 flex justify-end">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={processResumes}
              disabled={isProcessing || !role || !salaryMin || !salaryMax}
              className="relative flex items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-6 py-3 text-xs font-semibold text-stone-950 transition-all shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:shadow-[0_0_30px_rgba(52,211,153,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing Batch...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  Run TalentLens
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
