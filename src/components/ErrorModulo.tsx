import { Component, type ReactNode } from "react";

export default class ErrorModulo extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <section className="panel" role="alert">
      <h2>No se pudo abrir este módulo</h2>
      <p>Puedes abrir otra sección desde el menú.</p>
      <button type="button" className="primary-button" onClick={() => window.location.reload()}>
        Recargar página
      </button>
    </section>;
  }
}
