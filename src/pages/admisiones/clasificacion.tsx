import { escalaAdmision, type Clasificacion } from "./escalaAdmision";

export function ClasificarAdmision({ valor, onChange }: {
  valor: Clasificacion | "";
  onChange: (valor: Clasificacion) => void;
}) {
  return <fieldset className="en-classification">
    <legend>Clasificación interna de admisión</legend>
    {Object.entries(escalaAdmision).map(([color, [nombre, descripcion]]) =>
      <label key={color} className={`en-class-${color}`}>
        <input type="radio" name="clasificacion-admision" value={color} checked={valor === color}
          onChange={() => onChange(color as Clasificacion)} />
        <span><strong>{nombre}</strong><small>{descripcion}</small></span>
      </label>
    )}
  </fieldset>;
}
