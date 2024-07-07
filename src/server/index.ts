export { MeteorHookedCollection } from "../lib/collection";
export { CompatibleMeteorFindCursor } from "./cursor";
export * from "mongo-collection-hooks/es2015";

export function getBackingCollection(name: string, driver: any) {
  return driver.client.db().collection(name);
}
