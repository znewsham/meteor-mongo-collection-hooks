export { MeteorHookedCollection } from "../lib/collection";
export * from "mongo-collection-hooks";

export function getBackingCollection(name: string, driver: any) {
  return driver.client.db().collection(name);
}
