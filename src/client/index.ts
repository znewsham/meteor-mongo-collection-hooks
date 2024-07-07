import { ClientCollection } from "./collection";

export { MeteorHookedCollection } from "../lib/collection";
export { ClientCollection };
export { CompatibleMeteorFindCursor } from "./cursor";
export * from "mongo-collection-hooks/es2015";

export function getBackingCollection(name: string, connection: any) {
  return new ClientCollection(name, { connection });
}
