import { gql } from './api';

export type WhatsAppAccount = { wabaId: string; phoneNumberId: string; displayPhone: string | null };

export async function connectWhatsApp(input: { wabaId: string; phoneNumberId: string; accessToken: string }) {
  const query = `mutation ConnectWhatsApp($input: ConnectWhatsAppInput!) {
    connectWhatsApp(input: $input) { wabaId phoneNumberId displayPhone }
  }`;
  return (await gql<{ connectWhatsApp: WhatsAppAccount }>(query, { input })).connectWhatsApp;
}

export type WhatsAppConnectionTest = {
  ok: boolean;
  displayPhone: string | null;
  verifiedName: string | null;
  checks: { key: string; ok: boolean; detail: string }[];
};

// Checks the details with Meta without saving anything (admins only)
export async function testWhatsAppConnection(input: { wabaId: string; phoneNumberId: string; accessToken: string }) {
  const query = `mutation TestWhatsAppConnection($input: ConnectWhatsAppInput!) {
    testWhatsAppConnection(input: $input) { ok displayPhone verifiedName checks { key ok detail } }
  }`;
  return (await gql<{ testWhatsAppConnection: WhatsAppConnectionTest }>(query, { input })).testWhatsAppConnection;
}
