// Contact Us page
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendContactMessage } from '../../api/contactApi';
import { useAuth } from '../../context/AuthContext';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Footer from '../../../../shared/client/src/components/layout/Footer';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import { INSTITUTE, MAP_EMBED_URL, MAP_LINK_URL } from '../../../../shared/client/src/constants/institute';

// what a message can be about
const TOPICS = [
  { value: 'ADMISSIONS', label: 'Joining the institute' },
  { value: 'CLASSES', label: 'Classes and timetables' },
  { value: 'FEES', label: 'Fees and payments' },
  { value: 'TECHNICAL', label: 'Website or login help' },
  { value: 'OTHER', label: 'Something else' },
];

// a message can be up to 2000 characters
const MESSAGE_MAX = 2000;
// a simple email check
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// contact page - address, phone, email, a map and the message form
function ContactPage() {
  const { user, isLoggedIn } = useAuth();
  // a blank form - name and email are filled in for a logged-in user
  const emptyForm = {
    fullName: user ? user.fullName : '',
    email: user ? user.email : '',
    phone: '',
    topic: '',
    message: '',
    website: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [isSending, setIsSending] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const { fieldErrors, formError, validate, captureError, clearFieldError } = useFormErrors();

  // change one field and clear its error
  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    clearFieldError(field);
  }

  // send btn - validate, send the message, then clear the form
  async function handleSubmit(event) {
    event.preventDefault();
    const ok = validate({
      fullName: form.fullName.trim().length < 2 && 'Please enter your name.',
      email: !EMAIL_PATTERN.test(form.email.trim()) && 'Please enter a valid email address.',
      phone: form.phone.trim() && !/^[0-9+\-\s()]{7,20}$/.test(form.phone.trim()) && 'Please enter a valid phone number.',
      topic: !form.topic && 'Please choose what your message is about.',
      message: form.message.trim().length < 10 && 'Please write at least 10 characters.',
    });
    if (!ok) return;

    setIsSending(true);
    try {
      const result = await sendContactMessage({
        ...form,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
      });
      setSentMessage(result.message);
      setForm(emptyForm);
    } catch (error) {
      captureError(error);
    } finally {
      setIsSending(false);
    }
  }

  // the page - hero, contact details with a map, and the message form
  return (
    <>
      {/* hero */}
      <section className="container contact-hero">
        <span className="eyebrow">Contact Us</span>
        <h1>We&apos;d love to hear from you</h1>
        <p className="muted">
          Questions about classes, fees or joining the institute? Call, email or visit us - or send a message below
          and our office will get back to you.
        </p>
      </section>

      {/* contact details and map */}
      <section className="container contact-layout">
        <div className="contact-details">
          <a href={INSTITUTE.phoneHref} className="contact-card">
            <span className="feature-icon-box">
              <Icon name="phone" size={20} />
            </span>
            <span>
              <span className="contact-card-label">Call us</span>
              <span className="contact-card-value">{INSTITUTE.phone}</span>
            </span>
          </a>
          <a href={`mailto:${INSTITUTE.email}`} className="contact-card">
            <span className="feature-icon-box">
              <Icon name="mail" size={20} />
            </span>
            <span>
              <span className="contact-card-label">Email us</span>
              <span className="contact-card-value">{INSTITUTE.email}</span>
            </span>
          </a>
          <a href={MAP_LINK_URL} target="_blank" rel="noreferrer" className="contact-card">
            <span className="feature-icon-box">
              <Icon name="mapPin" size={20} />
            </span>
            <span>
              <span className="contact-card-label">Visit us</span>
              <span className="contact-card-value">{INSTITUTE.address}</span>
            </span>
          </a>

          <div className="contact-map">
            <iframe
              title="Map showing Brilliant Institute"
              src={MAP_EMBED_URL}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <a href={MAP_LINK_URL} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm contact-map-link">
            <Icon name="external" size={14} /> Open in Google Maps
          </a>
        </div>

        {/* message form */}
        <div className="card contact-form-card">
          <h2>Send us a message</h2>
          {isLoggedIn && user.role !== 'ADMIN' && (
            <p className="field-help" style={{ marginTop: 0 }}>
              Already studying with us? You can also use <Link to="/feedback">Feedback</Link> in your portal to message
              the office or your tutor.
            </p>
          )}

          {/* the thank-you message once it is sent, otherwise the form */}
          {sentMessage ? (
            <div className="contact-sent" role="status">
              <Icon name="checkCircle" size={36} />
              <h3>Message sent</h3>
              <p className="muted">{sentMessage}</p>
              <button type="button" className="btn btn-secondary" onClick={() => setSentMessage('')}>
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <Alert type="error" message={formError} />

              <div className="card-field-row">
                <div className="form-field">
                  <label htmlFor="contact-name">Your name *</label>
                  <input
                    id="contact-name"
                    autoComplete="name"
                    maxLength={120}
                    value={form.fullName}
                    className={fieldErrors.fullName ? 'input-error' : ''}
                    onChange={(e) => updateField('fullName', e.target.value)}
                  />
                  {fieldErrors.fullName && <p className="field-error">{fieldErrors.fullName}</p>}
                </div>
                <div className="form-field">
                  <label htmlFor="contact-phone">Phone (optional)</label>
                  <input
                    id="contact-phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={20}
                    placeholder="07X XXX XXXX"
                    value={form.phone}
                    className={fieldErrors.phone ? 'input-error' : ''}
                    onChange={(e) => updateField('phone', e.target.value)}
                  />
                  {fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="contact-email">Email *</label>
                <input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  maxLength={190}
                  value={form.email}
                  className={fieldErrors.email ? 'input-error' : ''}
                  onChange={(e) => updateField('email', e.target.value)}
                />
                {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
              </div>

              <div className="form-field">
                <label htmlFor="contact-topic">What is it about? *</label>
                <select
                  id="contact-topic"
                  value={form.topic}
                  className={fieldErrors.topic ? 'input-error' : ''}
                  onChange={(e) => updateField('topic', e.target.value)}
                >
                  <option value="">Choose a topic</option>
                  {TOPICS.map((topic) => (
                    <option key={topic.value} value={topic.value}>
                      {topic.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.topic && <p className="field-error">{fieldErrors.topic}</p>}
              </div>

              <div className="form-field">
                <label htmlFor="contact-message">Message *</label>
                <textarea
                  id="contact-message"
                  rows={6}
                  maxLength={MESSAGE_MAX}
                  value={form.message}
                  className={fieldErrors.message ? 'input-error' : ''}
                  onChange={(e) => updateField('message', e.target.value)}
                />
                <p className="field-help">
                  {form.message.length}/{MESSAGE_MAX}
                </p>
                {fieldErrors.message && <p className="field-error">{fieldErrors.message}</p>}
              </div>

              {/* left empty by people; bots fill it in */}
              <div className="contact-trap" aria-hidden="true">
                <label htmlFor="contact-website">Website</label>
                <input
                  id="contact-website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => updateField('website', e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={isSending}>
                <Icon name="send" size={16} /> {isSending ? 'Sending...' : 'Send message'}
              </button>
            </form>
          )}
        </div>
      </section>

      <Footer />
    </>
  );
}

export default ContactPage;
