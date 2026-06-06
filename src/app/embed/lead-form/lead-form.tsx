"use client";

import { useState } from "react";

const T = {
  es: {
    title: "¿Te interesa esta franquicia?",
    subtitle: "Déjanos tus datos y te contactamos.",
    name: "Nombre",
    phone: "Teléfono / WhatsApp",
    email: "Correo",
    message: "Mensaje (opcional)",
    send: "Quiero información",
    sending: "Enviando…",
    ok: "¡Gracias! Te contactaremos pronto.",
    err: "No se pudo enviar. Revisa los datos.",
    needContact: "Deja un teléfono o un correo.",
  },
  en: {
    title: "Interested in this franchise?",
    subtitle: "Leave your details and we'll reach out.",
    name: "Name",
    phone: "Phone / WhatsApp",
    email: "Email",
    message: "Message (optional)",
    send: "I want info",
    sending: "Sending…",
    ok: "Thanks! We'll contact you soon.",
    err: "Couldn't send. Check your details.",
    needContact: "Leave a phone or an email.",
  },
};

export function LeadForm({
  slug,
  brand,
  lang,
}: {
  slug: string;
  brand: string;
  lang: "es" | "en";
}) {
  const t = T[lang];
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "", website: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone.trim() && !form.email.trim()) {
      setState("error");
      setError(t.needContact);
      return;
    }
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, slug, source: "form" }),
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
        <input style={input} placeholder={t.name} value={form.name} onChange={set("name")} required />
        <input style={input} placeholder={t.phone} value={form.phone} onChange={set("phone")} />
        <input style={input} type="email" placeholder={t.email} value={form.email} onChange={set("email")} />
        <textarea style={{ ...input, minHeight: 64, resize: "vertical" }} placeholder={t.message} value={form.message} onChange={set("message")} />
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
