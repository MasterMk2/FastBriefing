// Owner: Export (P3 系統). The printable briefing is always mounted and hidden on screen, so Ctrl+P from
// any screen prints the export plan (SPEC 5.1, F9). Its maps are drawn only once the export screen has been
// opened or printing starts (decision 7). Reading the mission alone draws nothing and requests no tile.
// Maps that are not drawn yet print as "準備中", so printing is never blocked.
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useWorkspace } from '../shell/workspace';
import PrintDocument from './printDocument';
import { usePrintPreviewOpen } from './printPreview';
import { useExportModel } from './useExportModel';

export default function PrintHost() {
  const { model, title, viewLabel, outT } = useExportModel();
  const { screen } = useWorkspace();
  // The preview shows this copy full screen, so only then is it visible to assistive technology. Otherwise it is
  // an off-screen duplicate of the export screen, and is hidden from assistive technology.
  const previewOpen = usePrintPreviewOpen();
  // Once true it stays true, so leaving the export screen does not take the drawn maps away.
  const [drawMaps, setDrawMaps] = useState(false);

  useEffect(() => {
    if (screen === 'export') setDrawMaps(true);
  }, [screen]);

  useEffect(() => {
    // flushSync puts the map (or its wait text) into the DOM before the browser takes the print snapshot.
    // The drawing itself is not awaited, so printing is not blocked.
    const start = () => {
      flushSync(() => setDrawMaps(true));
    };
    window.addEventListener('beforeprint', start);
    // Some browsers do not fire beforeprint; the print media query covers them. jsdom has no matchMedia.
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
    const onQueryChange = (event: MediaQueryListEvent) => {
      if (event.matches) start();
    };
    query?.addEventListener('change', onQueryChange);
    return () => {
      window.removeEventListener('beforeprint', start);
      query?.removeEventListener('change', onQueryChange);
    };
  }, []);

  return (
    <div className="print-briefing" aria-hidden={previewOpen ? undefined : true}>
      <PrintDocument
        pages={model.pages}
        title={title}
        viewLabel={viewLabel}
        t={outT}
        drawMaps={drawMaps}
      />
    </div>
  );
}
