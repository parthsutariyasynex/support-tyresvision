import { API_URL, getToken, gql } from './api';
import { zonedInstant } from './time';

// Reports section (owners and admins only on the server). The assignment report is the only place the
// Assignment Reason is ever shown: it is not part of chats, history or the activity timeline.
export type AssignmentParty = { memberId: string | null; userId: string | null; name: string };
export type AssignmentRecord = {
  id: string;
  conversationId: string;
  contactName: string | null;
  contactWaId: string;
  previousAssignee: AssignmentParty | null;
  newAssignee: AssignmentParty | null;
  assignedBy: { userId: string | null; name: string } | null;
  reason: string | null;
  createdAt: string;
};

export type ReportRange = { from?: string | null; to?: string | null; conversationId?: string | null };

export async function fetchAssignmentReport(range: ReportRange = {}, first = 1000) {
  const query = `query AssignmentReport($from: DateTime, $to: DateTime, $conversationId: ID, $first: Int) {
    assignmentReport(from: $from, to: $to, conversationId: $conversationId, first: $first) {
      id conversationId contactName contactWaId
      previousAssignee { memberId userId name }
      newAssignee { memberId userId name }
      assignedBy { userId name }
      reason createdAt
    }
  }`;
  return (
    await gql<{ assignmentReport: AssignmentRecord[] }>(query, {
      from: range.from ?? null,
      to: range.to ?? null,
      conversationId: range.conversationId ?? null,
      first,
    })
  ).assignmentReport;
}

// Downloads the CSV export (GET /reports/assignments.csv) with the signed-in user's token
export async function downloadAssignmentReportCsv(range: ReportRange = {}) {
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  if (range.conversationId) params.set('conversationId', range.conversationId);
  const token = getToken();
  const res = await fetch(`${API_URL}/reports/assignments.csv${params.size ? `?${params}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'assignment-report.csv';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return name;
}

// Conversation Reports: new customers in a range (contacts whose first chat started then) and their outcome now
export type ConversationOutcome = 'new' | 'won' | 'lost';
export type ConversationReportCustomer = {
  id: string;
  name: string | null;
  waId: string;
  email: string | null;
  createdAt: string;
  outcome: ConversationOutcome;
  // The customer's lifecycle stage now (its value); null = none
  stage: string | null;
  stageLabel: string | null;
  stageColor: string | null;
};
export type ConversationReport = {
  totalNew: number;
  totalWon: number;
  totalLost: number;
  totalOpen: number;
  truncated: boolean;
  colors: { new: string; won: string; lost: string };
  labels: { won: string; lost: string };
  // Every lifecycle stage in Settings order, with how many of these customers are on it now
  stages: { value: string; label: string; color: string; lost: boolean; isDefault: boolean; count: number }[];
  customers: ConversationReportCustomer[];
};

export async function fetchConversationReport(range: { from: string; to: string }) {
  const query = `query ConversationReport($from: DateTime!, $to: DateTime!) {
    conversationReport(from: $from, to: $to) {
      totalNew totalWon totalLost totalOpen truncated
      colors { new won lost }
      labels { won lost }
      stages { value label color lost isDefault count }
      customers { id name waId email createdAt outcome stage stageLabel stageColor }
    }
  }`;
  return (await gql<{ conversationReport: ConversationReport }>(query, range)).conversationReport;
}

// Dubai calendar day (yyyy-mm-dd) -> ISO bounds for the server (start of day / end of day in Dubai time)
export function dayStartIso(day: string) {
  return day ? zonedInstant(day, '00:00:00.000').toISOString() : null;
}
export function dayEndIso(day: string) {
  return day ? zonedInstant(day, '23:59:59.999').toISOString() : null;
}
