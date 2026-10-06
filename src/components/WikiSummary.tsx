import { useEffect, useState } from 'react';
import { fetchWikiSummary, type WikiSummary as Summary } from '../lib/polities';

// Lead paragraph and image of a Wikipedia article, fetched live.
export function WikiSummary({ title }: { title: string | null | undefined }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSummary(null);
    if (!title) return;
    let cancelled = false;
    setLoading(true);
    fetchWikiSummary(title).then((s) => {
      if (cancelled) return;
      setSummary(s);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [title]);

  if (!title) return null;
  return (
    <>
      {summary?.thumbnail && <img className="thumb" src={summary.thumbnail.source} alt="" />}
      {loading && <p className="muted">Consulting the archives…</p>}
      {summary && <p className="extract">{summary.extract}</p>}
      {!loading && !summary && <p className="muted">No summary available.</p>}
      {summary?.content_urls && (
        <p className="links">
          <a href={summary.content_urls.desktop.page} target="_blank" rel="noreferrer">
            Read more on Wikipedia
          </a>
        </p>
      )}
    </>
  );
}
