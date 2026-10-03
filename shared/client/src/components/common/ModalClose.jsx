// close (X) button for pop-ups - Esc closes too
import { useEffect } from 'react';
import Icon from './Icon';

// close btn - the X on every pop-up
function ModalClose({ onClose, disabled = false }) {
  // pressing Esc closes the pop-up too
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape' && !disabled) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, disabled]);

  return (
    <button type="button" className="modal-close" onClick={onClose} disabled={disabled} aria-label="Close">
      <Icon name="x" size={18} />
    </button>
  );
}

export default ModalClose;
