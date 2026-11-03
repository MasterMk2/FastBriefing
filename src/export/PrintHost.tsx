// Owner: Export (P3 系統). Moved out of the shell in P0 without a change of behaviour (contract 5).
// The printable briefing is always mounted and hidden on screen, so Ctrl+P from any screen prints the
// export plan. Maps that are not drawn yet print as "準備中", so printing is never blocked (SPEC 5.1, F9).
// The print map readiness is no longer reported to the workspace (the export screen does not read it).
import PrintDocument from './printDocument';
import { useExportModel } from './useExportModel';

export default function PrintHost() {
  const { model, title, viewLabel, outT } = useExportModel();

  return (
    <div className="print-briefing">
      <PrintDocument
        pages={model.pages}
        title={title}
        viewLabel={viewLabel}
        t={outT}
      />
    </div>
  );
}
