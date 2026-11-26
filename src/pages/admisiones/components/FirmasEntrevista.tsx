import { useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";

export type Firma = {
  nombre: string;
  documento: string;
  imagen: string;
  aceptacion: boolean;
  fecha: string;
};

export type Firmas = {
  orientador: Firma;
  acudiente: Firma;
};

type RolFirma = keyof Firmas;

type Props = {
  onContinuar: (firmas: Firmas) => void;
  onVolver: () => void;
};

const ACEPTACION =
  "He revisado el contenido de esta entrevista y manifiesto mi aprobación mediante esta firma.";

export default function FirmasEntrevista({ onContinuar, onVolver }: Props) {
  const [firmas, setFirmas] = useState<Firmas>({
    orientador: {
      nombre: "",
      documento: "",
      imagen: "",
      aceptacion: false,
      fecha: "",
    },
    acudiente: {
      nombre: "",
      documento: "",
      imagen: "",
      aceptacion: false,
      fecha: "",
    },
  });

  const [error, setError] = useState("");

  const lienzos = useRef<Record<RolFirma, HTMLCanvasElement | null>>({
    orientador: null,
    acudiente: null,
  });

  const dibujando = useRef<RolFirma | null>(null);

  function actualizar(rol: RolFirma, cambios: Partial<Firma>) {
    setFirmas((prev) => ({
      ...prev,
      [rol]: {
        ...prev[rol],
        ...cambios,
      },
    }));

    setError("");
  }

  function coordenadas(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function iniciar(event: PointerEvent<HTMLCanvasElement>, rol: RolFirma) {
    if (!event.isPrimary || event.button !== 0) return;

    const canvas = event.currentTarget;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    dibujando.current = rol;

    // Cualquier modificación exige volver a aceptar.
    actualizar(rol, { aceptacion: false, fecha: "" });

    const { x, y } = coordenadas(event);

    ctx.strokeStyle = "#173c3a";
    ctx.fillStyle = "#173c3a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(event: PointerEvent<HTMLCanvasElement>, rol: RolFirma) {
    if (dibujando.current !== rol) return;

    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;

    const { x, y } = coordenadas(event);

    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function finalizar(event: PointerEvent<HTMLCanvasElement>, rol: RolFirma) {
    if (dibujando.current !== rol) return;

    dibujando.current = null;

    actualizar(rol, {
      imagen: event.currentTarget.toDataURL("image/png"),
      aceptacion: false,
      fecha: "",
    });

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function limpiar(rol: RolFirma) {
    const canvas = lienzos.current[rol];
    const ctx = canvas?.getContext("2d");

    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    dibujando.current = null;

    actualizar(rol, {
      imagen: "",
      aceptacion: false,
      fecha: "",
    });
  }

  function continuar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    for (const rol of ["orientador", "acudiente"] as const) {
      const firma = firmas[rol];

      if (
        !firma.nombre.trim() ||
        !firma.documento.trim() ||
        !firma.imagen ||
        !firma.aceptacion ||
        !firma.fecha
      ) {
        setError(`Completa los datos, la firma y la aceptación del ${rol}.`);
        return;
      }
    }

    onContinuar({
      orientador: {
        ...firmas.orientador,
        nombre: firmas.orientador.nombre.trim(),
        documento: firmas.orientador.documento.trim(),
      },
      acudiente: {
        ...firmas.acudiente,
        nombre: firmas.acudiente.nombre.trim(),
        documento: firmas.acudiente.documento.trim(),
      },
    });
  }

  return (
    <form className="panel en-section" onSubmit={continuar}>
      <div className="panel-heading">
        <div>
          <h2>Firmas de la entrevista</h2>
          <p>
            Revisa la entrevista de arriba antes de firmar. Estas firmas no
            incluyen las notas confidenciales.
          </p>
        </div>
      </div>

      <p className="en-warning">
        Captura de demostración. Usa nombres y firmas ficticios.
      </p>

      <div className="en-signatures-grid">
        {(["orientador", "acudiente"] as const).map((rol) => (
          <fieldset className="en-signature-card" key={rol}>
            <legend>
              {rol === "orientador"
                ? "Firma del orientador"
                : "Firma del acudiente"}
            </legend>

            <label className="en-field">
              Nombre completo *
              <input
                required
                value={firmas[rol].nombre}
                onChange={(event) =>
                  actualizar(rol, {
                    nombre: event.target.value,
                    aceptacion: false,
                    fecha: "",
                  })
                }
              />
            </label>

            <label className="en-field en-section">
              Documento de identidad *
              <input
                required
                value={firmas[rol].documento}
                onChange={(event) =>
                  actualizar(rol, {
                    documento: event.target.value,
                    aceptacion: false,
                    fecha: "",
                  })
                }
              />
            </label>

            <p className="en-muted en-section">
              Dibuja la firma con el mouse, el dedo o un lápiz táctil.
            </p>

            <canvas
              ref={(element) => {
                lienzos.current[rol] = element;
              }}
              className="en-signature-canvas"
              width={600}
              height={200}
              aria-label={`Área de firma del ${rol}`}
              onPointerDown={(event) => iniciar(event, rol)}
              onPointerMove={(event) => mover(event, rol)}
              onPointerUp={(event) => finalizar(event, rol)}
              onPointerCancel={(event) => finalizar(event, rol)}
            />

            <button
              type="button"
              className="text-button"
              onClick={() => limpiar(rol)}
            >
              Borrar firma
            </button>

            <label className="en-signature-consent">
              <input
                required
                type="checkbox"
                disabled={
                  !firmas[rol].imagen ||
                  !firmas[rol].nombre.trim() ||
                  !firmas[rol].documento.trim()
                }
                checked={firmas[rol].aceptacion}
                onChange={(event) =>
                  actualizar(rol, {
                    aceptacion: event.target.checked,
                    fecha: event.target.checked ? new Date().toISOString() : "",
                  })
                }
              />
              {ACEPTACION}
            </label>
          </fieldset>
        ))}
      </div>

      {error && (
        <p className="en-warning en-section" role="alert">
          {error}
        </p>
      )}

      <div className="en-actions en-section">
        <button type="submit" className="primary-button">
          Confirmar firmas y continuar →
        </button>

        <button type="button" className="en-secondary" onClick={onVolver}>
          Volver y editar entrevista
        </button>
      </div>
    </form>
  );
}
