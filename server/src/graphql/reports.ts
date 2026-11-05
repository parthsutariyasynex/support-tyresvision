import { listAssignmentReport } from '../services/assignmentReports.js';
import { conversationReport } from '../services/conversationReports.js';
import { authed } from './shared.js';

// Reports section. Every query here is owner/admin only on the server (requireAdmin inside the service); the
// data lives in its own table and is not reachable through conversation, message or activity queries.
export const typeDefs = /* GraphQL */ `
  "A member who held a chat at the time of the assignment (names copied then, so removed members still read correctly)"
  type AssignmentParty {
    "Member id (table Role); null if that membership no longer exists at write time"
    memberId: ID
    userId: ID
    name: String!
  }

  "Who made the assignment; null for a system change (e.g. a removed member's chats being released)"
  type AssignmentActor {
    userId: ID
    name: String!
  }

  "One assignment, reassignment or unassignment of a chat, with the optional Assignment Reason. Admin report only."
  type AssignmentRecord {
    id: ID!
    "Chat ID"
    conversationId: ID!
    contactName: String
    contactWaId: String!
    "null = the chat was unassigned before"
    previousAssignee: AssignmentParty
    "null = unassigned"
    newAssignee: AssignmentParty
    assignedBy: AssignmentActor
    "The Assignment Reason typed in the Assign box, if any"
    reason: String
    "Assignment timestamp"
    createdAt: DateTime!
  }

  "A new customer in the Conversation Report: the contact, when their first chat started, and where they are now"
  type ConversationReportCustomer {
    "Contact id"
    id: ID!
    name: String
    waId: String!
    email: String
    "When the customer (contact) was created: their first chat"
    createdAt: DateTime!
    "new (still in progress) | won | lost, from the customer's lead stage now"
    outcome: String!
    "The customer's lead stage now (its value); null = none"
    stage: String
    "The customer's lead stage now, as Settings → Customer lifecycle names and colours it"
    stageLabel: String
    stageColor: String
  }

  type ConversationReportColors {
    new: String!
    won: String!
    lost: String!
  }

  "A lifecycle stage (Settings → Customer lifecycle) and how many of the report's customers are on it now"
  type ConversationReportStage {
    value: String!
    label: String!
    color: String!
    lost: Boolean!
    "The stage new contacts start on (the New stage)"
    isDefault: Boolean!
    count: Int!
  }

  type ConversationReportLabels {
    won: String!
    lost: String!
  }

  "Conversation Reports: the new customers in a date range, and how many of them were won or lost"
  type ConversationReport {
    totalNew: Int!
    totalWon: Int!
    totalLost: Int!
    "Neither won nor lost yet"
    totalOpen: Int!
    "true: more than 10000 customers in the range; only the first 10000 are listed and counted"
    truncated: Boolean!
    "The New / Won / Lost stage colours of this workspace"
    colors: ConversationReportColors!
    labels: ConversationReportLabels!
    "Every lifecycle stage, in Settings order (progressing stages, then lost ones)"
    stages: [ConversationReportStage!]!
    "Oldest first"
    customers: [ConversationReportCustomer!]!
  }

  extend type Query {
    "Owners and admins only (FORBIDDEN otherwise). Newest first; from/to bound the assignment time; first caps the rows (max 10000)."
    assignmentReport(from: DateTime, to: DateTime, conversationId: ID, first: Int): [AssignmentRecord!]!
    "Owners and admins only (FORBIDDEN otherwise). Customers whose first chat started between from and to."
    conversationReport(from: DateTime!, to: DateTime!): ConversationReport!
  }
`;

export const resolvers = {
  Query: {
    assignmentReport: authed(
      (args: { from?: Date | null; to?: Date | null; conversationId?: string | null; first?: number | null }, auth) =>
        listAssignmentReport(auth, args),
    ),
    conversationReport: authed((args: { from: Date; to: Date }, auth) => conversationReport(auth, args)),
  },
};
