import { CheckCircle2, X, XCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

interface StatusProps {
  message: string;
  type: 'success' | 'error';
  onClose?: () => void;
}

/**
 * Toast fixo no topo-centro da tela.
 *
 * Portal em `document.body` de propósito: dentro de um modal, `position: fixed`
 * é relativo ao ancestral mais próximo que tenha `transform` — e `.modal` tem
 * (`modalIn`, 0.32s). Um erro que chega durante essa animação (ex.: falha ao
 * carregar ao abrir) ficaria deslocado e ainda recortado pelo `overflow: hidden`
 * do modal, que é exatamente o "fora do campo de visão" que este componente
 * existe para evitar.
 */
export function Status({ message, type, onClose }: StatusProps) {
  return createPortal(
    <div className={`status ${type}`} role="alert" aria-live="polite">
      {type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      <span>{message}</span>
      {onClose && (
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>
      )}
    </div>,
    document.body
  );
}
