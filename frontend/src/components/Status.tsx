import { CheckCircle2, X, XCircle } from 'lucide-react';

interface StatusProps {
  message: string;
  type: 'success' | 'error';
  onClose?: () => void;
}

export function Status({ message, type, onClose }: StatusProps) {
  return (
    <div className={`status ${type}`} role="alert" aria-live="polite">
      {type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      <span>{message}</span>
      {onClose && (
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
