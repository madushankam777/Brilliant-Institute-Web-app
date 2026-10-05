// the item a notification pointed at (?highlight=ID) - gives its id and scrolls it into view
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// ready = the page has finished loading its list
function useHighlight(ready, paramName = 'highlight') {
  const [params] = useSearchParams();
  const id = Number(params.get(paramName)) || null;

  // once the list is on screen, bring the highlighted row into view
  useEffect(() => {
    if (!ready || !id) return undefined;
    const timer = setTimeout(() => {
      const row = document.querySelector('.row-highlight');
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => clearTimeout(timer);
  }, [ready, id]);

  return id;
}

export default useHighlight;
