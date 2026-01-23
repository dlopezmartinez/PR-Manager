export function passwordResetTemplate(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #333; margin-bottom: 24px;">Reset Your Password</h1>

  <p style="color: #555; font-size: 16px; line-height: 1.5;">
    You requested to reset your password. Click the button below to create a new password.
  </p>

  <a href="${resetUrl}"
     style="display: inline-block; background-color: #0066cc; color: white; padding: 14px 28px;
            text-decoration: none; border-radius: 6px; margin: 24px 0; font-weight: 500;">
    Reset Password
  </a>

  <p style="color: #888; font-size: 14px;">
    This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
  <p style="color: #aaa; font-size: 12px;">PR Manager</p>
</body>
</html>`;
}

export function paymentFailedTemplate(userName: string, billingUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #333; margin-bottom: 24px;">Payment Failed</h1>

  <p style="color: #555; font-size: 16px; line-height: 1.5;">
    Hi ${userName},
  </p>

  <p style="color: #555; font-size: 16px; line-height: 1.5;">
    We couldn't process your latest payment. Please update your payment method to continue using PR Manager.
  </p>

  <a href="${billingUrl}"
     style="display: inline-block; background-color: #dc3545; color: white; padding: 14px 28px;
            text-decoration: none; border-radius: 6px; margin: 24px 0; font-weight: 500;">
    Update Payment Method
  </a>

  <p style="color: #888; font-size: 14px;">
    If you have any questions, please contact support.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
  <p style="color: #aaa; font-size: 12px;">PR Manager</p>
</body>
</html>`;
}
