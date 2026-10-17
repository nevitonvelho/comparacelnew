export function SeoEditorFeedback({ busy, generating, elapsed, error, notice }: {
  busy: string; generating: boolean; elapsed: number; error: string; notice: string;
}) {
  return <div className="seo-editor-feedback">
    <div role="status" aria-live="polite" aria-atomic="true">
      {busy && <div className="seo-progress"><span className="seo-spinner" aria-hidden="true" /><div><strong>{busy}</strong>{generating && <><span className="seo-elapsed" aria-hidden="true">{elapsed}s</span><p>{elapsed >= 20 ? "O Gemini está demorando mais que o habitual. A geração pode levar até 75 segundos; aguarde o resultado aqui." : "Analisando a ficha e preparando título, metadescrição, descrição e temas."}</p><small>Os campos serão preenchidos ao concluir. Nenhuma alteração será aplicada automaticamente.</small></>}</div></div>}
      {!busy && notice && <p className="admin-notice seo-inline-notice">{notice}</p>}
    </div>
    {!busy && error && <div role="alert" className="admin-alert seo-inline-error"><strong>Não foi possível concluir.</strong><p>{error}</p><small>Sua edição continua no formulário.</small></div>}
  </div>;
}

export function SeoDraftSkeleton() {
  return <div className="seo-draft-skeleton" aria-hidden="true">{["title", "meta", "description", "tags"].map(field => <div className={`seo-draft-skeleton-field ${field}`} key={field}><span className="skeleton-block seo-draft-skeleton-label" /><span className="skeleton-block seo-draft-skeleton-input" /></div>)}</div>;
}
