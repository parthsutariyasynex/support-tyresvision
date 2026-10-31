import { createQuickReply, deleteQuickReply, listQuickReplies, updateQuickReply } from '../services/quickReplies.js';
import { prisma } from '../prisma.js';
import { authed } from './shared.js';

export const typeDefs = /* GraphQL */ `
  "A canned reply offered when typing / in the message box (WhatsApp Business-style quick replies)"
  type QuickReply {
    id: ID!
    "Typed after /, e.g. tyrescart"
    shortcut: String!
    "The message text it inserts"
    description: String
    "e.g. car_tyres, car_services, car_insurance, battery, other"
    category: String
    sortOrder: Int!
    "Null for some imported rows"
    createdAt: DateTime
    "Who added it in this app (null for imported replies)"
    createdByName: String
    updatedAt: DateTime
    "Who last edited it in this app (null if never edited here)"
    updatedByName: String
  }

  extend type Query {
    "This workspace's enabled quick replies. search: case-insensitive partial match on shortcut, text or category (best shortcut matches first). first: 1-100 (default 50)"
    quickReplies(search: String, first: Int): [QuickReply!]!
  }

  input CreateQuickReplyInput {
    "Without the /, e.g. tyrescart (letters, numbers, _ and -)"
    shortcut: String!
    description: String!
    "Free text, stored lowercase with _ for spaces. Empty or null = none"
    category: String
    "Position in the / menu (lower first). Default: last"
    sortOrder: Int
  }

  input UpdateQuickReplyInput {
    shortcut: String
    description: String
    "Empty string clears it"
    category: String
    sortOrder: Int
  }

  # Managing saved replies: owners, admins and supervisors
  extend type Mutation {
    createQuickReply(input: CreateQuickReplyInput!): QuickReply!
    updateQuickReply(id: ID!, input: UpdateQuickReplyInput!): QuickReply!
    "Soft delete. Returns the deleted id."
    deleteQuickReply(id: ID!): ID!
  }
`;

export const resolvers = {
  Query: {
    quickReplies: authed(({ search, first }: { search?: string | null; first?: number | null }, { workspaceId }) =>
      listQuickReplies(workspaceId, { search: search ?? undefined, first: first ?? undefined }),
    ),
  },
  Mutation: {
    createQuickReply: authed(({ input }: { input: unknown }, auth) => createQuickReply(auth, input)),
    updateQuickReply: authed(({ id, input }: { id: string; input: Record<string, unknown> }, auth) =>
      // GraphQL sends explicit nulls for omitted fields; drop them so they stay unchanged
      updateQuickReply(auth, id, Object.fromEntries(Object.entries(input).filter(([, v]) => v != null))),
    ),
    deleteQuickReply: authed(({ id }: { id: string }, auth) => deleteQuickReply(auth, id)),
  },
  // Names only when asked for (Settings → Saved replies), so the / menu stays a single query
  QuickReply: {
    createdByName: (r: { createdBy?: string | null }) => userName(r.createdBy),
    updatedByName: (r: { updatedBy?: string | null }) => userName(r.updatedBy),
  },
};

async function userName(id: string | null | undefined) {
  if (!id) return null;
  return (await prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}
