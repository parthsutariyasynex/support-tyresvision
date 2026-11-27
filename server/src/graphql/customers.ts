import { type CustomerInput, createCustomer, importCustomers, listCustomers, updateCustomer } from '../services/customers.js';
import { authed } from './shared.js';

// Settings → Contacts and data → Customers (services/customers.ts). Delete uses deleteContact (owners/admins).
export const typeDefs = /* GraphQL */ `
  "One page of the Customers grid, newest first"
  type CustomersPage {
    total: Int!
    page: Int!
    pageSize: Int!
    customers: [Contact!]!
  }

  "A custom property's value: empty or null = not set"
  input CustomValueInput {
    propertyId: ID!
    value: String
  }

  input CustomerInput {
    "Add only (required): digits with country code; spaces, + and dashes are ignored. Can't be changed later."
    waId: String
    firstName: String
    lastName: String
    email: String
    companyName: String
    jobTitle: String
    "Empty = not set. Left out when adding: the workspace's default stage"
    leadStage: String
    leadSource: String
    priority: String
    country: String
    "Left out when adding: yes"
    subscribed: Boolean
    "Only the properties sent are changed"
    customValues: [CustomValueInput!]
    "The full list of lists the customer is in; left out = unchanged"
    listIds: [ID!]
  }

  type CustomerImportError {
    "Row number in the file (the headings are row 1)"
    row: Int!
    message: String!
  }

  type CustomerImportResult {
    added: Int!
    "Already customers: left as they are"
    skipped: Int!
    failed: Int!
    "The first 50 rows that couldn't be added"
    errors: [CustomerImportError!]!
  }

  extend type Query {
    "Any member. search: name, email, company, or 3+ digits of the number. countries: ISO codes of the number's calling code. cities: values of the City property. from/to: added date."
    customers(search: String, countries: [String!], cities: [String!], from: DateTime, to: DateTime, "newest (default) or oldest" sort: String, page: Int, pageSize: Int): CustomersPage!
  }

  extend type Mutation {
    "Any member. Saves the customer only: no chat is opened and nothing is sent"
    createCustomer(input: CustomerInput!): Contact!
    "Any member. The number can't be changed"
    updateCustomer(id: ID!, input: CustomerInput!): Contact!
    "Owners and admins: a CSV file's text (first row = column headings)"
    importCustomers(csv: String!): CustomerImportResult!
  }
`;

type ListArgs = { search?: string | null; countries?: string[] | null; cities?: string[] | null; from?: Date | null; to?: Date | null; sort?: string | null; page?: number | null; pageSize?: number | null };

export const resolvers = {
  Query: {
    customers: authed(async (args: ListArgs, auth) => listCustomers(auth, args)),
  },
  Mutation: {
    createCustomer: authed(async ({ input }: { input: CustomerInput }, auth) => createCustomer(auth, input)),
    updateCustomer: authed(async ({ id, input }: { id: string; input: CustomerInput }, auth) => updateCustomer(auth, id, input)),
    importCustomers: authed(async ({ csv }: { csv: string }, auth) => importCustomers(auth, csv)),
  },
};
