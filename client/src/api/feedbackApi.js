// feedback API calls - submit, list, read, reply to and resolve tickets
import httpClient from '../../../shared/client/src/api/httpClient';

// submit btn - send a new ticket
export async function submitFeedback(payload) {
  const response = await httpClient.post('/feedback', payload);
  return response.data.data.ticket;
}

// my tickets
export async function fetchMyTickets() {
  const response = await httpClient.get('/feedback/my');
  return response.data.data.tickets;
}

// staff inbox - tickets addressed to me, optionally by status
export async function fetchAllTickets(status) {
  const response = await httpClient.get('/feedback/all', { params: status ? { status } : {} });
  return response.data.data.tickets;
}

// one ticket with its replies
export async function fetchTicketDetails(ticketId) {
  const response = await httpClient.get(`/feedback/${ticketId}`);
  return response.data.data.ticket;
}

// send reply btn - add a reply
export async function replyToTicket(ticketId, message) {
  const response = await httpClient.post(`/feedback/${ticketId}/reply`, { message });
  return response.data.data.ticket;
}

// resolve btn - close a ticket
export async function resolveTicket(ticketId) {
  const response = await httpClient.patch(`/feedback/${ticketId}/resolve`);
  return response.data.data.ticket;
}

// how many tickets are in each state
export async function fetchTicketStatusCounts() {
  const response = await httpClient.get('/feedback/status-counts');
  return response.data.data.counts;
}
