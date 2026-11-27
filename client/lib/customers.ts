import { gql } from './api';
import type { ContactProfile } from './contacts';
import { downloadCsv } from './reports';

// Settings → Contacts and data → Customers: the customer grid with Add, Edit, Delete, Import and Export.
// Adding a customer only saves them: no chat is opened and nothing is sent (the server says the same).

export const CUSTOMERS_PAGE_SIZE = 25;
export type CustomerFilter = {
  search?: string;
  countries?: string[];
  cities?: string[];
  from?: string | null; // ISO (start of a Dubai day)
  to?: string | null; // ISO (end of a Dubai day)
  sort?: 'newest' | 'oldest'; // Added date
  page?: number;
  pageSize?: number;
};
export type CustomersPage = { total: number; page: number; pageSize: number; customers: ContactProfile[] };
export type CustomerInput = {
  waId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  companyName?: string;
  jobTitle?: string;
  leadStage?: string;
  leadSource?: string;
  priority?: string;
  country?: string;
  subscribed?: boolean;
  customValues?: { propertyId: string; value: string }[];
  listIds?: string[];
};
export type ImportResult = { added: number; skipped: number; failed: number; errors: { row: number; message: string }[] };

const FIELDS =
  'id waId name firstName lastName email companyName jobTitle leadStage leadSource priority country phoneCountry subscribed waBsuid waUsername lists { id name } customValues { propertyId value } conversationId createdAt updatedAt';

const list = (a?: string[]) => (a?.length ? a : null);

export async function fetchCustomers(f: CustomerFilter) {
  const query = `query Customers($search: String, $countries: [String!], $cities: [String!], $from: DateTime, $to: DateTime, $sort: String, $page: Int, $pageSize: Int) {
    customers(search: $search, countries: $countries, cities: $cities, from: $from, to: $to, sort: $sort, page: $page, pageSize: $pageSize) {
      total page pageSize customers { ${FIELDS} }
    }
  }`;
  return (
    await gql<{ customers: CustomersPage }>(query, {
      search: f.search?.trim() || null,
      countries: list(f.countries),
      cities: list(f.cities),
      from: f.from ?? null,
      to: f.to ?? null,
      sort: f.sort ?? 'newest',
      page: f.page ?? 1,
      pageSize: f.pageSize ?? CUSTOMERS_PAGE_SIZE,
    })
  ).customers;
}

export async function createCustomer(input: CustomerInput) {
  return (await gql<{ createCustomer: ContactProfile }>(`mutation CreateCustomer($i: CustomerInput!) { createCustomer(input: $i) { ${FIELDS} } }`, { i: input })).createCustomer;
}
export async function updateCustomer(id: string, input: CustomerInput) {
  return (await gql<{ updateCustomer: ContactProfile }>(`mutation UpdateCustomer($id: ID!, $i: CustomerInput!) { updateCustomer(id: $id, input: $i) { ${FIELDS} } }`, { id, i: input }))
    .updateCustomer;
}
// Owners and admins: the customer, their chat and messages are removed for good
export async function deleteCustomer(id: string) {
  await gql(`mutation DeleteCustomer($id: ID!) { deleteContact(id: $id) }`, { id });
}
export async function importCustomers(csv: string) {
  return (
    await gql<{ importCustomers: ImportResult }>(`mutation ImportCustomers($c: String!) { importCustomers(csv: $c) { added skipped failed errors { row message } } }`, { c: csv })
  ).importCustomers;
}

// Every customer the filters match (not only this page), with the columns Import reads
export function downloadCustomersCsv(f: CustomerFilter) {
  const params = new URLSearchParams();
  const set = (key: string, value: string | null | undefined) => {
    if (value?.trim()) params.set(key, value.trim());
  };
  set('search', f.search);
  set('countries', f.countries?.join(','));
  set('cities', f.cities?.join(','));
  set('from', f.from);
  set('to', f.to);
  set('sort', f.sort);
  return downloadCsv('customers.csv', params, 'customers.csv');
}

// "+971 50 123 4567" → "971501234567" (the server checks it's a real WhatsApp number)
export const digitsOnly = (s: string) => s.replace(/\D/g, '');

// The Import template: the headings Import reads (custom properties by their names)
export function importTemplate(propertyNames: string[]) {
  const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const headers = ['WhatsApp number', 'First name', 'Last name', 'Email', 'Company name', 'Job title', 'Lead stage', 'Lead source', 'Priority', 'Country', 'Subscriber', ...propertyNames, 'Lists'];
  return `﻿${headers.map(cell).join(',')}\r\n`;
}
