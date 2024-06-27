import { ClientCollection } from "./collection";

export { MeteorHookedCollection } from "../lib/collection";
export { ClientCollection };
export * from "mongo-collection-hooks";

export function getBackingCollection(name: string, connection: any) {
  return new ClientCollection(name, { connection });
}
