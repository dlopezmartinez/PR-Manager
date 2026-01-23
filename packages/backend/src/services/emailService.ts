/**
 * Email Service
 * Handles sending emails via Resend
 */

import { Resend } from 'resend';
import logger from '../lib/logger.js';

// Lazy initialization to avoid errors when API key is not set
let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email via Resend
 * Returns true if successful, false otherwise
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const client = getResendClient();

  if (!client) {
    logger.warn('[Email] RESEND_API_KEY not configured, skipping email');
    return false;
  }

  try {
    const { data, error } = await client.emails.send({
      from: process.env.EMAIL_FROM || 'PR Manager <noreply@prmanager.app>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      logger.error('[Email] Failed to send', { error, to: options.to });
      return false;
    }

    logger.info(`[Email] Sent to ${options.to}: ${options.subject}`, { id: data?.id });
    return true;
  } catch (error) {
    logger.error('[Email] Error sending email', { error });
    return false;
  }
}
