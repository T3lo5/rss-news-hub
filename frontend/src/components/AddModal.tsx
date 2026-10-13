import { type FormEvent, useState } from 'react';

interface AddModalProps {
  onSubmit: (data: { title: string; link: string; source?: string; description?: string }) => void;
  onClose: () => void;
}

export function AddModal({ onSubmit, onClose }: AddModalProps) {
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [source, setSource] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!(title.trim() && link.trim())) return;

    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        link: link.trim(),
        source: source.trim() || 'Manual',
        description: description.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-modal-title"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="add-modal-title">＋ Adicionar Notícia Manual</h3>
          <button className="close-btn" onClick={onClose} aria-label="Fechar modal">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="add-modal-form">
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="addTitle">Título *</label>
              <input
                id="addTitle"
                type="text"
                placeholder="Título da notícia"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="addLink">Link *</label>
              <input
                id="addLink"
                type="url"
                placeholder="https://exemplo.com/noticia"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="addSource">Fonte</label>
              <input
                id="addSource"
                type="text"
                placeholder="Nome da fonte (opcional)"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="addDesc">Descrição/Resumo</label>
              <textarea
                id="addDesc"
                placeholder="Descrição ou resumo da notícia (opcional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
