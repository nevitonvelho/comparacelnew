import { RiAppleFill, RiGooglePlayFill, RiChromeFill } from "@remixicon/react";

export function AppDownloads() {
  return <section className="app-downloads" aria-labelledby="app-downloads-title">
    <div className="app-downloads-copy">
      <span className="eyebrow">COMPARACEL COM VOCÊ</span>
      <h3 id="app-downloads-title">No celular e no navegador.</h3>
      <p>Em desenvolvimento: app para iPhone e Android e extensão para Google Chrome.</p>
    </div>
    <div className="app-store-buttons" aria-label="Disponibilidade do app e da extensão">
      <button type="button" className="app-store-button" disabled aria-label="App Store — em breve">
        <RiAppleFill aria-hidden="true" size={30} />
        <span><small>Em breve na</small><strong>App Store</strong></span>
      </button>
      <button type="button" className="app-store-button" disabled aria-label="Google Play — em breve">
        <RiGooglePlayFill aria-hidden="true" size={28} />
        <span><small>Em breve no</small><strong>Google Play</strong></span>
      </button>
      <button type="button" className="app-store-button" disabled aria-label="Extensão para Google Chrome — em breve">
        <RiChromeFill aria-hidden="true" size={28} />
        <span><small>Extensão em breve</small><strong>Google Chrome</strong></span>
      </button>
    </div>
  </section>;
}
