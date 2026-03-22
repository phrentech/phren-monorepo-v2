interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(apiKey: string, options: SendEmailOptions): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: options.from || 'Phren <noreply@phrentech.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
    }),
  });
  return res.ok;
}

export const emailTemplates = {
  appointmentConfirmed: (providerName: string, dateTime: string) => ({
    subject: 'Appointment Confirmed',
    html: `<p>Your appointment with ${providerName} on ${dateTime} has been confirmed.</p>`,
  }),
  appointmentReminder: (providerName: string, dateTime: string, sessionUrl: string) => ({
    subject: 'Upcoming Appointment Reminder',
    html: `<p>Reminder: You have an appointment with ${providerName} on ${dateTime}.</p><p><a href="${sessionUrl}">Join Session</a></p>`,
  }),
  newProviderRegistration: (providerEmail: string) => ({
    subject: 'New Provider Registration — Review Required',
    html: `<p>A new provider (${providerEmail}) has registered and is pending license verification.</p>`,
  }),
};
