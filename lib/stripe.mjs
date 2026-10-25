// Integrazione minima con le API Stripe (senza SDK).
import { createHmac, timingSafeEqual } from "node:crypto";

export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

// Converte un oggetto annidato nel formato form di Stripe: a[b][0][c]=...
function encode(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params ? encode(params) : undefined
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || `Stripe HTTP ${res.status}`);
    err.code = data.error?.code;
    throw err;
  }
  return data;
}

// Verifica la firma dei webhook (header Stripe-Signature).
export function verifyWebhook(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")).map(([k, ...v]) => [k, v.join("=")]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const signatures = header.split(",").filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  return signatures.some(sig => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

export const cents = euro => Math.round(euro * 100);
