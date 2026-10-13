interface StatusProps {
  message: string;
  type: 'success' | 'error';
}

export function Status({ message, type }: StatusProps) {
  return (
    <div className={`status ${type}`} role="alert" aria-live="polite">
      {type === 'success' ? '✅' : '❌'} {message}
    </div>
  );
}
