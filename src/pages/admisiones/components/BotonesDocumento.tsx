import type { CSSProperties } from "react";

type Props = {
  onVistaPrevia: () => void;
  onDescargar: () => void;
  vistaPreviaId?: string;
  vistaPreviaAbierta?: boolean;
};

const base: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  minHeight: 36,
  padding: "8px 11px",
  borderRadius: 7,
  border: "1px solid",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.2,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default function BotonesDocumento({
  onVistaPrevia,
  onDescargar,
  vistaPreviaId,
  vistaPreviaAbierta,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 10,
      }}
    >
      <button
        type="button"
        onClick={onVistaPrevia}
        aria-expanded={vistaPreviaAbierta}
        aria-controls={vistaPreviaAbierta ? vistaPreviaId : undefined}
        style={{
          ...base,
          color: "#285886",
          background: "#edf5ff",
          borderColor: "#c7dbef",
        }}
      >
        <svg
          width="18"
          height="18"
          style={{ width: 18, height: 18, flexShrink: 0 }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {vistaPreviaAbierta ? "Ocultar vista previa" : "Vista previa"}
      </button>

      <button
        type="button"
        onClick={onDescargar}
        style={{
          ...base,
          color: "#a63139",
          background: "#fff0f1",
          borderColor: "#efc6ca",
        }}
      >
        <svg
          width="18"
          height="20"
          style={{ width: 18, height: 20, flexShrink: 0 }}
          viewBox="0 0 24 28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H5a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Z" />
          <path d="M14 2v7h7" />
          <path d="M7 13h10" />
          <text
            x="12"
            y="21"
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontSize="7"
            fontFamily="Arial, sans-serif"
            fontWeight="bold"
          >
            PDF
          </text>
        </svg>
        Descargar PDF
      </button>
    </div>
  );
}
