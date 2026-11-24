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
  return downloadCsv('assignments.csv', params, 'assignment-report.csv');
}

// GET /reports/<file>?<params> with the signed-in user's token, saved as the file the server names
async function downloadCsv(file: string, params: URLSearchParams, fallbackName: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/reports/${file}${params.size ? `?${params}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
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

// countries: ISO codes (e.g. "AE") for the Country code filter; empty = every country
export async function fetchConversationReport(range: { from: string; to: string; countries?: string[] }) {
  const query = `query ConversationReport($from: DateTime!, $to: DateTime!, $countries: [String!]) {
    conversationReport(from: $from, to: $to, countries: $countries) {
      totalNew totalWon totalLost totalOpen truncated
      colors { new won lost }
      labels { won lost }
      stages { value label color lost isDefault count }
      customers { id name waId email createdAt outcome stage stageLabel stageColor }
    }
  }`;
  return (
    await gql<{ conversationReport: ConversationReport }>(query, {
      from: range.from,
      to: range.to,
      countries: range.countries?.length ? range.countries : null,
    })
  ).conversationReport;
}

// Dubai calendar day (yyyy-mm-dd) -> ISO bounds for the server (start of day / end of day in Dubai time)
export function dayStartIso(day: string) {
  return day ? zonedInstant(day, '00:00:00.000').toISOString() : null;
}
export function dayEndIso(day: string) {
  return day ? zonedInstant(day, '23:59:59.999').toISOString() : null;
}

// Contact Reports: one page of customers matching the filters (newest first), and the choices for the filter menus
export const NO_STAGE = '__none';
export type ContactReportLabel = { id: string; name: string; color: string };
export type ContactReportVehicle = { make: string | null; model: string | null; year: number | null; tireSize1: string; tireSize2: string | null };
export type ContactReportContact = {
  id: string;
  conversationId: string | null;
  name: string | null;
  waId: string;
  createdAt: string;
  stage: string | null;
  stageLabel: string | null;
  stageColor: string | null;
  labels: ContactReportLabel[];
  vehicles: ContactReportVehicle[];
};
export type ContactReport = {
  total: number;
  page: number;
  pageSize: number;
  contacts: ContactReportContact[];
  stages: { value: string; label: string; color: string }[];
  labels: ContactReportLabel[];
  makes: string[];
};
export type ContactReportFilter = {
  search?: string;
  from?: string | null;
  to?: string | null;
  countries?: string[];
  stages?: string[];
  labelIds?: string[];
  make?: string;
  model?: string;
  tyreSize?: string;
  page?: number;
  pageSize?: number;
};

export async function fetchContactReport(f: ContactReportFilter) {
  const query = `query ContactReport($search: String, $from: DateTime, $to: DateTime, $countries: [String!], $stages: [String!], $labelIds: [ID!], $make: String, $model: String, $tyreSize: String, $page: Int, $pageSize: Int) {
    contactReport(search: $search, from: $from, to: $to, countries: $countries, stages: $stages, labelIds: $labelIds, make: $make, model: $model, tyreSize: $tyreSize, page: $page, pageSize: $pageSize) {
      total page pageSize
      contacts { id conversationId name waId createdAt stage stageLabel stageColor labels { id name color } vehicles { make model year tireSize1 tireSize2 } }
      stages { value label color }
      labels { id name color }
      makes
    }
  }`;
  const list = (a?: string[]) => (a?.length ? a : null);
  const str = (s?: string) => s?.trim() || null;
  return (
    await gql<{ contactReport: ContactReport }>(query, {
      search: str(f.search),
      from: f.from ?? null,
      to: f.to ?? null,
      countries: list(f.countries),
      stages: list(f.stages),
      labelIds: list(f.labelIds),
      make: str(f.make),
      model: str(f.model),
      tyreSize: str(f.tyreSize),
      page: f.page ?? 1,
      pageSize: f.pageSize ?? 25,
    })
  ).contactReport;
}

// Contact Reports → Export CSV (GET /reports/contacts.csv): every customer the filters match, not only this page
export function downloadContactReportCsv(f: ContactReportFilter) {
  const params = new URLSearchParams();
  const set = (key: string, value: string | null | undefined) => {
    if (value?.trim()) params.set(key, value.trim());
  };
  set('search', f.search);
  set('from', f.from);
  set('to', f.to);
  set('countries', f.countries?.join(','));
  set('stages', f.stages?.join(','));
  set('labelIds', f.labelIds?.join(','));
  set('make', f.make);
  set('model', f.model);
  set('tyreSize', f.tyreSize);
  return downloadCsv('contacts.csv', params, 'contact-report.csv');
}
