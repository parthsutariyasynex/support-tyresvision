import { gql } from './api';

// A customer's vehicles (chat header car button, contact profile "Add Vehicle"). Dates are yyyy-mm-dd.
export type Vehicle = {
  id: string;
  contactId: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  registrationDate: string | null;
  lastServiceDate: string | null;
  tireSize1: string;
  tireSize2: string | null;
  createdAt: string;
};
export type VehicleInput = Omit<Vehicle, 'id' | 'createdAt'>;
export type VehicleCustomer = { id: string; name: string | null; waId: string };

// Window event relayed from the socket's contact:vehicles ({ contactId }): open vehicle lists reload
export const VEHICLES_EVENT = 'crm:contact-vehicles';

const FIELDS = 'id contactId plateNumber make model year registrationDate lastServiceDate tireSize1 tireSize2 createdAt';

export async function listVehicles(contactId: string) {
  return (await gql<{ contactVehicles: Vehicle[] }>(`query ContactVehicles($c: ID!) { contactVehicles(contactId: $c) { ${FIELDS} } }`, { c: contactId })).contactVehicles;
}

export async function searchVehicleCustomers(search: string) {
  const query = `query VehicleCustomers($s: String) { vehicleCustomers(search: $s) { id name waId } }`;
  return (await gql<{ vehicleCustomers: VehicleCustomer[] }>(query, { s: search.trim() || null })).vehicleCustomers;
}

export async function addVehicle(input: VehicleInput) {
  const query = `mutation AddVehicle($input: VehicleInput!) { addVehicle(input: $input) { ${FIELDS} } }`;
  return (await gql<{ addVehicle: Vehicle }>(query, { input })).addVehicle;
}

export async function deleteVehicle(id: string) {
  await gql(`mutation DeleteVehicle($id: ID!) { deleteVehicle(id: $id) }`, { id });
}

// "Toyota Land Cruiser 2022"
export const vehicleTitle = (v: Pick<Vehicle, 'make' | 'model' | 'year'>) => [v.make, v.model, v.year].filter(Boolean).join(' ');
