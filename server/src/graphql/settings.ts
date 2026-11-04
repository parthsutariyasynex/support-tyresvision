import { connectWhatsApp, getWhatsAppAccount, testWhatsAppConnection } from '../services/settings.js';
import { authed } from './shared.js';

export const typeDefs = /* GraphQL */ `
  "Connected WhatsApp number. The access token is write-only and never returned."
  type WhatsAppAccount {
    displayPhone: String
    phoneNumberId: String!
    wabaId: String!
  }

  input ConnectWhatsAppInput {
    wabaId: String!
    phoneNumberId: String!
    accessToken: String!
  }

  "One check of a WhatsApp connection test: number, account, token, app, permissions, expiry or webhook"
  type WhatsAppConnectionCheck {
    key: String!
    ok: Boolean!
    detail: String!
  }

  "Result of testing a number's details with Meta (nothing saved, the token is never returned)"
  type WhatsAppConnectionTest {
    ok: Boolean!
    displayPhone: String
    verifiedName: String
    checks: [WhatsAppConnectionCheck!]!
  }

  extend type Query {
    whatsappAccount: WhatsAppAccount
  }

  extend type Mutation {
    "Runs the same checks as testWhatsAppConnection, then connects (or updates) this workspace's number; saves nothing if any fails"
    connectWhatsApp(input: ConnectWhatsAppInput!): WhatsAppAccount!
    "Checks the details with Meta without saving them (admins only)"
    testWhatsAppConnection(input: ConnectWhatsAppInput!): WhatsAppConnectionTest!
  }
`;

export const resolvers = {
  Query: {
    whatsappAccount: authed((_args, { workspaceId }) => getWhatsAppAccount(workspaceId)),
  },
  Mutation: {
    connectWhatsApp: authed(({ input }: { input: unknown }, auth) => connectWhatsApp(auth, input)),
    testWhatsAppConnection: authed(({ input }: { input: unknown }, auth) => testWhatsAppConnection(auth, input)),
  },
};
