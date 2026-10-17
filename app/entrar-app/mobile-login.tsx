"use client";
import { useEffect, useState } from "react";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseApp } from "@/lib/firebase/client";
export function MobileLogin({ requestId }: { requestId: string }) {
  const [code, setCode] = useState("");
  const [returnUrl, setReturnUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    if (!requestId) return;
    fetch(`/api/mobile-auth?request=${requestId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) {
          setReturnUrl(data.returnUrl);
          setReady(data.status === "ready");
        }
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [requestId]);
  async function login() {
    setMessage("");
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(getAuth(getFirebaseApp()), provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.idToken)
        throw new Error("Não foi possível confirmar a conta. Tente novamente.");
      const response = await fetch("/api/mobile-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await result.user.getIdToken()}`,
        },
        body: JSON.stringify({
          action: "complete",
          id: requestId,
          code,
          googleIdToken: credential.idToken,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReady(true);
    } catch (error) {
      const authCode = (error as { code?: string }).code;
      setMessage(
        authCode === "auth/popup-closed-by-user"
          ? "Login cancelado. Você pode tentar novamente."
          : authCode
            ? "Não foi possível abrir o Google. Permita a janela de login e tente novamente."
            : error instanceof Error
              ? error.message
              : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      style={{
        maxWidth: 420,
        margin: "36px auto",
        padding: 24,
        border: "1px solid #e8e9ed",
        borderRadius: 20,
        background: "#fff",
      }}
    >
      <span className="eyebrow">CONECTAR AO APLICATIVO</span>
      <h1 style={{ fontSize: 28 }}>
        {ready ? "Sua conta está pronta." : "Entre com Google."}
      </h1>
      <p>
        {ready
          ? "Volte ao aplicativo para concluir o acesso aos seus favoritos."
          : "Digite o código mostrado no app aberto neste celular. Depois, escolha sua conta Google."}
      </p>
      {!requestId ? (
        <p role="alert">Abra esta página pelo botão de login do aplicativo.</p>
      ) : ready ? (
        <a
          className="button primary"
          href={returnUrl}
          style={{ width: "100%" }}
        >
          Voltar ao aplicativo
        </a>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
        >
          <label
            htmlFor="mobile-code"
            style={{ display: "block", fontSize: 13, marginBottom: 8 }}
          >
            Código exibido no app
          </label>
          <input
            id="mobile-code"
            aria-label="Código exibido no app"
            inputMode="numeric"
            pattern="[0-9]{6}"
            required
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 10,
              border: "1px solid #d9dce2",
              fontSize: 24,
              letterSpacing: 6,
              marginBottom: 16,
            }}
          />
          <button
            type="submit"
            className="button primary"
            disabled={busy || code.length !== 6 || !returnUrl}
            style={{ width: "100%" }}
          >
            {busy ? "Conectando…" : "Continuar com Google"}
          </button>
          <p style={{ fontSize: 12 }}>
            Use apenas o código exibido no seu aplicativo. Não use códigos
            recebidos de outras pessoas.
          </p>
        </form>
      )}
      {message && (
        <p role="alert" style={{ color: "#a04b24" }}>
          {message}
        </p>
      )}
    </section>
  );
}
