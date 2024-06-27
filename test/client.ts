import { MeteorHookedCollection } from "meteor/znewsham:mongo-collection-hooks";
import { Meteor } from "meteor/meteor";

const collection = new MeteorHookedCollection("client");

describe("Collection Hooks", () => {
  it("Client insert is observed", async () => {
    const promise = new Promise((resolve) => {
      const handle = collection.find({}).observe({
        added(item: any) {
          resolve(item);
          setTimeout(() => handle.stop());
        }
      });
    });
    const id = await collection.insertOne({});
    console.log(id);
    console.log(await promise);
  });
  it("Server insert is observed", async () => {
    Meteor.subscribe("testClient");
    const promise = new Promise((resolve) => {
      const handle = collection.find({}).observe({
        added(item: any) {
          resolve(item);
          setTimeout(() => handle.stop());
        }
      });
    });
    Meteor.call("testInsert");
    await promise;
  });
});
