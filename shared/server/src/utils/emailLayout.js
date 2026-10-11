// the institute email layout - every notification email uses it
const config = require('../config/env');

// makes text safe to put inside the email
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// one email: greeting, heading, message, a button to the website and the institute footer
function renderEmail({ name, heading, message, buttonText, buttonUrl }) {
  const { institute } = config;
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'there';
  const paragraphs = String(message || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  // the HTML version
  const body = paragraphs
    .map((part) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = buttonUrl
    ? `<div style="margin:22px 0 6px">
          <a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${escapeHtml(buttonText || 'Open Brilliant Institute')}</a>
        </div>`
    : '';
  const html = `
  <div style="background:#f1f5f9;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(paragraphs[0] || heading || '')}</div>
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#1e3a8a;padding:18px 24px;border-bottom:3px solid #c9a961">
        <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px">Brilliant Institute</div>
        <div style="color:#cbd5e1;font-size:12px;margin-top:2px">Brilliant Makes Brilliance</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Hi ${escapeHtml(firstName)},</p>
        ${heading ? `<h2 style="margin:0 0 14px;font-size:18px;color:#1e3a8a">${escapeHtml(heading)}</h2>` : ''}
        ${body}
        ${button}
      </div>
      <div style="background:#f8fafc;padding:14px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">
        You get this email because you have an account at ${escapeHtml(institute.name)}. It is also in the bell on the website.<br>
        ${escapeHtml(institute.address)}<br>
        <a href="mailto:${escapeHtml(institute.email)}" style="color:#1d4ed8;text-decoration:none">${escapeHtml(institute.email)}</a> &nbsp;|&nbsp; ${escapeHtml(institute.phone)}
      </div>
    </div>
  </div>`;

  // the plain-text version
  const text = [
    `Hi ${firstName},`,
    heading || '',
    ...paragraphs,
    buttonUrl ? `${buttonText || 'Open Brilliant Institute'}: ${buttonUrl}` : '',
    `${institute.name}\n${institute.address}\n${institute.email} | ${institute.phone}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { html, text };
}

module.exports = { renderEmail, escapeHtml };
