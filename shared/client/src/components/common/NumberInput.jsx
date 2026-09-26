// number box - digits only (and one "." when decimals > 0), never negative
function cleanNumber(raw, decimals) {
  let text = String(raw).replace(decimals > 0 ? /[^\d.]/g : /\D/g, '');
  if (decimals > 0) {
    const [whole, ...rest] = text.split('.');
    text = rest.length > 0 ? `${whole}.${rest.join('').slice(0, decimals)}` : whole;
  }
  return text;
}

function NumberInput({ value, onChange, decimals = 0, className = '', ...props }) {
  return (
    <input
      {...props}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={value}
      className={className}
      onKeyDown={(e) => {
        if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
      }}
      onChange={(e) => onChange(cleanNumber(e.target.value, decimals))}
    />
  );
}

export default NumberInput;
