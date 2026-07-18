import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { AnimatePresence, motion } from 'motion/react';
import {
  Upload,
  FileText,
  XCircle,
  Briefcase,
  IndianRupee,
  Loader2,
  Users,
  Cpu,
  Mail,
  Building2,
  Send,
  ChevronDown,
  Check,
  Cloud,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { LocalModelOption } from '../types';

const CLOUD_PROVIDERS = new Set(['openai', 'anthropic', 'google', 'groq']);

function providerGroupLabel(provider: string): string {
  if (provider.toLowerCase() === 'builtin') return 'Deterministic';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function isCloudProvider(provider: string): boolean {
  return CLOUD_PROVIDERS.has(provider.toLowerCase());
}

interface ModelPickerProps {
  models: LocalModelOption[];
  selectedModelId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

function ModelPicker({ models, selectedModelId, onSelect, disabled }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = models.find((m) => m.id === selectedModelId) || models[0];
  const selectedIsCloud = selected ? isCloudProvider(selected.provider) : false;

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, LocalModelOption[]>();
    for (const model of models) {
      if (!map.has(model.provider)) {
        map.set(model.provider, []);
        order.push(model.provider);
      }
      map.get(model.provider)!.push(model);
    }
    return order.map((provider) => ({
      provider,
      label: providerGroupLabel(provider),
      models: map.get(provider)!,
    }));
  }, [models]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id="ai-model"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled || models.length === 0}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-stone-850 bg-stone-900/40 py-2.5 pl-4 pr-3 text-left outline-none transition-all hover:border-stone-700 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Cpu className="h-4 w-4 shrink-0 text-stone-500 transition-colors group-hover:text-emerald-400/80" />
        <span className="min-w-0 flex-1 truncate text-sm text-stone-100">
          {selected?.label || 'Select a model'}
        </span>
        {selected && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              selectedIsCloud
                ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
                : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
            }`}
          >
            {selectedIsCloud ? <Cloud className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
            {selectedIsCloud ? 'Cloud' : 'Local'}
          </span>
        )}
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            selectedIsCloud ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
          }`}
        />
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-stone-500 transition-transform duration-200 ${
            open ? 'rotate-180 text-emerald-400' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            role="listbox"
            aria-labelledby="ai-model"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-950/95 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl"
          >
            <div className="custom-scrollbar max-h-72 overflow-y-auto p-1.5">
              {groups.map((group, groupIndex) => (
                <div key={group.provider} className={groupIndex > 0 ? 'mt-1.5' : ''}>
                  <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      {group.label}
                    </span>
                    <span className="h-px flex-1 bg-stone-800/80" />
                  </div>
                  <div className="space-y-0.5">
                    {group.models.map((model) => {
                      const active = model.id === selectedModelId;
                      const cloud = isCloudProvider(model.provider);
                      const fallback = model.status === 'missing_key';
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            onSelect(model.id);
                            setOpen(false);
                          }}
                          className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                            active
                              ? 'bg-emerald-500/10 text-stone-50 ring-1 ring-inset ring-emerald-400/25'
                              : 'text-stone-300 hover:bg-stone-900/80 hover:text-stone-50'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                              cloud
                                ? 'border-amber-400/15 bg-amber-400/5 text-amber-300'
                                : 'border-emerald-400/15 bg-emerald-400/5 text-emerald-300'
                            }`}
                          >
                            {cloud ? <Cloud className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{model.label}</span>
                              {fallback && (
                                <span className="shrink-0 rounded-md border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                                  Fallback
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-stone-500">
                              {model.description ||
                                (cloud
                                  ? 'Anonymized evaluation via cloud API'
                                  : 'Runs fully on-device — data stays local')}
                            </span>
                          </span>
                          {active && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
          <ModelPicker
            models={availableModels}
            selectedModelId={selectedModelId}
            onSelect={setSelectedModelId}
            disabled={isLoadingModels}
          />
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-stone-500">
            {isLoadingModels ? (
              <>
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Scanning AI runtimes...
              </>
            ) : isCloudProvider(availableModels.find((m) => m.id === selectedModelId)?.provider || '') ? (
              <span className="inline-flex items-center gap-1 text-amber-400/80">
                <AlertTriangle className="h-2.5 w-2.5" />
                Cloud: anonymized data is sent to{' '}
                {availableModels.find((m) => m.id === selectedModelId)?.provider}.
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-400/80">
                <Lock className="h-2.5 w-2.5" />
                Privacy: data stays 100% local.
              </span>
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
          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-normal text-emerald-400/70">
            <Mail className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              After scoring, candidates will automatically receive selection/rejection emails from &ldquo;{hrName || 'HR'} via TalentLens&rdquo;.
              Candidates can reply directly to {hrEmail || 'your email'}.
            </span>
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
