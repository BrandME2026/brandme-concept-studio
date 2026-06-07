"use client";

import { useState } from "react";

const T = {
  es: {
    title: "¿Te interesa esta franquicia?",
    subtitle: "Déjanos tus datos y te contactamos.",
    nombre: "Nombre",
    telefono: "Teléfono / WhatsApp",
    email: "Correo",
    ciudad: "Ciudad",
    inversion: "Inversión disponible",
    mensaje: "Mensaje (opcional)",
    send: "Quiero información",
    sending: "Enviando…",
    ok: "¡Gracias! Te contactaremos pronto.",
    err: "No se pudo enviar. Revisa los datos.",
    needContact: "Deja un teléfono o un correo.",
  },
  en: {
    title: "Interested in this franchise?",
    subtitle: "Leave your details and we'll reach out.",
    nombre: "Name",
    telefono: "Phone / WhatsApp",
    email: "Email",
    ciudad: "City",
    inversion: "Available investment",
    mensaje: "Message (optional)",
    send: "I want info",
    sending: "Sending…",
    ok: "Thanks! We'll contact you soon.",
    err: "Couldn't send. Check your details.",
    needContact: "Leave a phone or an email.",
  },
};

/** Campos seleccionables del formulario. nombre va siempre primero. */
export type FormField = "nombre" | "email" | "telefono" | "ciudad" | "inversion" | "mensaje";
const ALL_FIELDS: FormField[] = ["nombre", "email", "telefono", "ciudad", "inversion", "mensaje"];
const DEFAULT_FIELDS: FormField[] = ["nombre", "telefono", "email", "mensaje"];

export function LeadForm({
  slug,
  brand,
  lang,
  fields,
}: {
  slug: string;
  brand: string;
  lang: "es" | "en";
  /** Campos a mostrar; si no se pasa, set por defecto. */
  fields?: FormField[];
}) {
  const t = T[lang];
  const active = (fields && fields.length ? fields : DEFAULT_FIELDS).filter((f) =>
    ALL_FIELDS.includes(f),
  );
  const has = (f: FormField) => active.includes(f);

  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    ciudad: "",
    inversion: "",
    message: "",
    website: "",
  });

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Contacto mínimo: si el form pide teléfono o email, exige al menos uno.
    if ((has("telefono") || has("email")) && !form.phone.trim() && !form.email.trim()) {
      setState("error");
      setError(t.needContact);
      return;
    }
    setState("sending");
    setError("");
    // ciudad/inversión no son columnas de `leads`: se anexan al mensaje con etiqueta.
    const extras = [
      has("ciudad") && form.ciudad.trim() ? `${t.ciudad}: ${form.ciudad.trim()}` : "",
      has("inversion") && form.inversion.trim() ? `${t.inversion}: ${form.inversion.trim()}` : "",
    ].filter(Boolean);
    const message = [form.message.trim(), ...extras].filter(Boolean).join("\n");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email,
          message,
          website: form.website,
          slug,
          source: "form",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? t.err);
      setState("ok");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : t.err);
    }
  };

  if (state === "ok") {
    return (
      <div style={wrap}>
        <p style={{ ...title, marginBottom: 0 }}>✅ {t.ok}</p>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <p style={title}>{brand ? `${t.title}` : t.title}</p>
      <p style={subtitle}>{t.subtitle}</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        {has("nombre") && (
          <input style={input} placeholder={t.nombre} value={form.name} onChange={set("name")} required />
        )}
        {has("telefono") && (
          <input style={input} placeholder={t.telefono} value={form.phone} onChange={set("phone")} />
        )}
        {has("email") && (
          <input style={input} type="email" placeholder={t.email} value={form.email} onChange={set("email")} />
        )}
        {has("ciudad") && (
          <input style={input} placeholder={t.ciudad} value={form.ciudad} onChange={set("ciudad")} />
        )}
        {has("inversion") && (
          <input style={input} placeholder={t.inversion} value={form.inversion} onChange={set("inversion")} />
        )}
        {has("mensaje") && (
          <textarea style={{ ...input, minHeight: 64, resize: "vertical" }} placeholder={t.mensaje} value={form.message} onChange={set("message")} />
        )}
        {/* Honeypot: oculto para humanos, los bots lo rellenan */}
        <input
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
          value={form.website}
          onChange={set("website")}
        />
        {state === "error" && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={state === "sending"} style={button}>
          {state === "sending" ? t.sending : t.send}
        </button>
      </form>
    </div>
  );
}

const wrap: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, sans-serif",
  padding: 16,
  maxWidth: 420,
  margin: "0 auto",
};
const title: React.CSSProperties = { fontSize: 18, fontWeight: 600, margin: "0 0 4px", color: "#111" };
const subtitle: React.CSSProperties = { fontSize: 14, color: "#555", margin: "0 0 14px" };
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 15,
  boxSizing: "border-box",
};
const button: React.CSSProperties = {
  padding: "11px 16px",
  background: "#fc4c02",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};
