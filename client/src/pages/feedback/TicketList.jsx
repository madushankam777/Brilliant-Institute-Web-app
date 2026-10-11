// ticket list - coloured by category, unread tickets marked, a delete button on each and the buttons above the list
import { categoryTone } from '../../../../shared/client/src/constants/feedbackCategories';
import CategoryBadge from '../../../../shared/client/src/components/common/CategoryBadge';
import Icon from '../../../../shared/client/src/components/common/Icon';

// badge colour for Resolved, In Progress or Pending
function statusBadgeClass(status) {
  if (status === 'RESOLVED') return 'badge badge-success';
  if (status === 'IN_PROGRESS') return 'badge badge-warning';
  return 'badge badge-neutral';
}

// the status words
function statusLabel(status) {
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'RESOLVED') return 'Resolved';
  return 'Pending';
}

// the list
function TicketList({ tickets, selectedId, onOpen, onDelete, onBulk, isWorking, describe }) {
  const unreadTickets = tickets.filter((ticket) => ticket.unreadCount > 0).length;
  const readTickets = tickets.length - unreadTickets;

  return (
    <div>
      {/* mark all read, delete read, delete all */}
      <div className="ticket-tools">
        <button
          type="button"
          className="icon-text-btn"
          onClick={() => onBulk('read-all')}
          disabled={isWorking || unreadTickets === 0}
        >
          <Icon name="checkCircle" size={14} /> Mark all read
        </button>
        <button
          type="button"
          className="icon-text-btn"
          onClick={() => onBulk('clear-read')}
          disabled={isWorking || readTickets === 0}
        >
          <Icon name="trash" size={14} /> Delete read
        </button>
        <button
          type="button"
          className="icon-text-btn is-danger"
          onClick={() => onBulk('clear-all')}
          disabled={isWorking || tickets.length === 0}
        >
          <Icon name="trash" size={14} /> Delete all
        </button>
      </div>

      <div className="ticket-list">
        {tickets.map((ticket) => (
          <div key={ticket.id} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => onOpen(ticket.id)}
              className={`ticket-card tone-${categoryTone(ticket.category)}${selectedId === ticket.id ? ' is-selected' : ''}${
                ticket.unreadCount > 0 ? ' is-unread' : ''
              }`}
              aria-current={selectedId === ticket.id ? 'true' : undefined}
            >
              <div className="ticket-card-top">
                <span className="ticket-card-number">
                  {ticket.ticketNumber}
                  {ticket.unreadCount > 0 && (
                    <span className="ticket-new">
                      <span className="unread-dot" aria-hidden="true" />
                      {ticket.unreadCount} new
                    </span>
                  )}
                </span>
                <span className={statusBadgeClass(ticket.status)}>{statusLabel(ticket.status)}</span>
              </div>
              <CategoryBadge category={ticket.category} />
              <div className="ticket-card-subject">{ticket.subject}</div>
              <div className="ticket-card-meta">{describe(ticket)}</div>
            </button>
            {/* delete btn - off my list only */}
            <button
              type="button"
              className="ticket-delete"
              onClick={() => onDelete(ticket)}
              aria-label={`Delete ${ticket.ticketNumber} from my list`}
              title="Delete from my list"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export { statusBadgeClass, statusLabel };
export default TicketList;
