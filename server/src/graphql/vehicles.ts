import { addVehicle, deleteVehicle, listVehicles, searchVehicleCustomers, updateVehicle } from '../services/vehicles.js';
import { vehicleCatalogEnabled, vehicleMakes, vehicleModels, vehicleYears } from '../services/vehicleCatalog.js';
import { authed } from './shared.js';

export const typeDefs = /* GraphQL */ `
  "A customer's vehicle (one CRM contact has any number)"
  type Vehicle {
    id: ID!
    contactId: ID!
    "Uppercase, e.g. DUBAI A 12345"
    plateNumber: String
    make: String
    model: String
    year: Int
    "yyyy-mm-dd"
    registrationDate: String
    "yyyy-mm-dd: last tyre purchase or service"
    lastServiceDate: String
    tireSize1: String!
    tireSize2: String
    "Free-text notes about this vehicle"
    remarks: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  "A contact offered by the CRM Customer picker"
  type VehicleCustomer {
    id: ID!
    name: String
    waId: String!
  }

  "A make or model for the vehicle form's dropdowns (Wheel API)"
  type VehicleCatalogOption {
    "Wheel API slug: pass it to vehicleModels / vehicleYears"
    slug: String!
    name: String!
    logo: String
  }

  input VehicleInput {
    contactId: ID!
    plateNumber: String
    make: String
    model: String
    year: Int
    "yyyy-mm-dd, not in the future"
    registrationDate: String
    "yyyy-mm-dd, not in the future"
    lastServiceDate: String
    tireSize1: String!
    tireSize2: String
    remarks: String
  }

  "Edit: only the fields sent change; null clears an optional one"
  input UpdateVehicleInput {
    plateNumber: String
    make: String
    model: String
    year: Int
    registrationDate: String
    lastServiceDate: String
    tireSize1: String
    tireSize2: String
    remarks: String
  }

  extend type Query {
    "This contact's vehicles, newest first"
    contactVehicles(contactId: ID!): [Vehicle!]!
    "Up to 20 contacts matching name, first/last name or WhatsApp number digits"
    vehicleCustomers(search: String): [VehicleCustomer!]!
    "Whether the Make / Model / Year lists are set up (WHEEL_API_KEY); false: the form takes typed values"
    vehicleCatalogEnabled: Boolean!
    "Every vehicle make, A-Z"
    vehicleMakes: [VehicleCatalogOption!]!
    "A make's models, A-Z (make: a slug from vehicleMakes)"
    vehicleModels(make: String!): [VehicleCatalogOption!]!
    "A model's production years, newest first"
    vehicleYears(make: String!, model: String!): [Int!]!
  }

  extend type Mutation {
    addVehicle(input: VehicleInput!): Vehicle!
    updateVehicle(id: ID!, input: UpdateVehicleInput!): Vehicle!
    "Soft delete"
    deleteVehicle(id: ID!): Boolean!
  }
`;

export const resolvers = {
  Query: {
    contactVehicles: authed(({ contactId }: { contactId: string }, auth) => listVehicles(auth, contactId)),
    vehicleCustomers: authed(({ search }: { search?: string | null }, auth) => searchVehicleCustomers(auth, search)),
    vehicleCatalogEnabled: authed(async () => vehicleCatalogEnabled()),
    vehicleMakes: authed(() => vehicleMakes()),
    vehicleModels: authed(({ make }: { make: string }) => vehicleModels(make)),
    vehicleYears: authed(({ make, model }: { make: string; model: string }) => vehicleYears(make, model)),
  },
  Mutation: {
    addVehicle: authed(({ input }: { input: unknown }, auth) => addVehicle(auth, input)),
    updateVehicle: authed(({ id, input }: { id: string; input: unknown }, auth) => updateVehicle(auth, id, input)),
    deleteVehicle: authed(({ id }: { id: string }, auth) => deleteVehicle(auth, id)),
  },
};
