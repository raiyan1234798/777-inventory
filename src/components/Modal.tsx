
import { X, Minus, Maximize2 } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  minimizeLabel?: string;
}

export default function Modal({
  isOpen, onClose, title, description, children, size = 'md',
  minimized = false, onMinimize, onRestore, minimizeLabel,
}: ModalProps) {
  if (!isOpen) return null;

  // Minimized state — show a floating pill at bottom-right
  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl shadow-gray-900/30 border border-gray-700">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black uppercase tracking-widest text-white/90">{title}</span>
            {minimizeLabel && (
              <span className="text-[10px] text-white/50 truncate max-w-[180px]">{minimizeLabel}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onRestore}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
            title="Restore"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-colors flex-shrink-0"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div
        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className={clsx(
        "bg-white rounded-2xl shadow-xl border border-gray-100 transform transition-all relative w-full flex flex-col max-h-[90vh]",
        size === 'sm' && "sm:max-w-md",
        size === 'md' && "sm:max-w-lg",
        size === 'lg' && "sm:max-w-2xl",
        size === 'xl' && "sm:max-w-4xl"
      )}>
        <div className="flex items-start justify-between p-6 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
            {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onMinimize && (
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full p-2 transition-colors"
                onClick={onMinimize}
                title="Minimize — keeps your selection"
              >
                <span className="sr-only">Minimize</span>
                <Minus className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="text-gray-400 hover:text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-full p-2 transition-colors"
              onClick={onClose}
            >
              <span className="sr-only">Close menu</span>
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
