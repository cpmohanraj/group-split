import "server-only";
import nodemailer from "nodemailer";
import { config } from "./config";

export async function sendLoginEmail(to: string, name: string, link: string) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

  if (!SMTP_HOST) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP is not configured");
    console.log(`\n[dev] Sign-in link for ${to}:\n${link}\n`);
    return;
  }

  const port = Number(SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  const subject = `Your ${config.groupName} sign-in link`;
  const text = `Hi ${name},\n\nUse this link to sign in. It works once and expires in 15 minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`;
  const safeName = name.replace(/[<>&"]/g, "");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1b1f1d">
  <p>Hi ${safeName},</p>
  <p>Tap the button to sign in to <b>${config.groupName}</b>. The link works once and expires in 15 minutes.</p>
  <p style="margin:28px 0"><a href="${link}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Sign in</a></p>
  <p style="color:#667;font-size:13px">If you didn't ask for this, you can ignore this email.</p></div>`;

  await transport.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject, text, html });
}
