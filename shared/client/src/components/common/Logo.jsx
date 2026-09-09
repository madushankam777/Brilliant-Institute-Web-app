import logoImg from '../../assets/logo.jpeg';

// Crest mark + wordmark used in every navbar/footer/auth panel so the
// brand looks identical across both independently-deployed modules.
function Logo({ tagline, dark = false }) {
  return (
    <span className="brand">
      <span className="brand-mark">
        <img src={logoImg} alt="Brilliant Institute" className="brand-mark-img" />
      </span>
      <span>
        <span className="brand-name" style={dark ? { color: '#fff' } : undefined}>
          Brilliant Institute
        </span>
        {tagline && <span className="brand-tagline" style={{ display: 'block' }}>{tagline}</span>}
      </span>
    </span>
  );
}

export default Logo;
