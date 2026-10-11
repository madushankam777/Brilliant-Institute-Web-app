// "are you sure?" pop-up - used before deleting
import ModalClose from './ModalClose';

// confirm dialog - Cancel, or the red button
function ConfirmDialog({ title, text, confirmLabel = 'Delete', busyLabel = 'Deleting...', isBusy = false, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={() => !isBusy && onCancel()}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <ModalClose onClose={onCancel} disabled={isBusy} />
        <h2 id="confirm-dialog-title">{title}</h2>
        <p className="muted">{text}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isBusy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isBusy}>
            {isBusy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
