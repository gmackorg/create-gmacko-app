import { Resend } from "resend";

import { integrations } from "@gmacko/config";

let resendClient: Resend | null = null;

export interface EmailConfig {
  apiKey: string;
  from: string;
}

/**
 * Initialize email client (Resend)
 * Only initializes if email integration is enabled
 */
export function initEmail(config: EmailConfig): Resend | null {
  if (!integrations.email.enabled) {
    console.log("[Email disabled] Email initialization skipped");
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(config.apiKey);
  }

  return resendClient;
}

/**
 * Get the email client instance
 */
export function getEmailClient(): Resend | null {
  if (!integrations.email.enabled) {
    return null;
  }
  return resendClient;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

/**
 * Send an email
 */
export async function sendEmail(
  params: SendEmailParams,
  defaultFrom: string,
): Promise<{ id: string } | null> {
  const client = getEmailClient();
  if (!client) {
    console.log("[Email disabled] Cannot send email:", params.subject);
    return null;
  }

  const result = await client.emails.send({
    from: params.from ?? defaultFrom,
    to: params.to,
    subject: params.subject,
    html: params.html ?? "",
    text: params.text ?? "",
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { id: result.data?.id ?? "" };
}

export { Resend };
