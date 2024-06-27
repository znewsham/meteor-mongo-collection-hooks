import { MeteorHookedCollection } from "meteor/znewsham:mongo-collection-hooks";
import "./serverForClient";

const serverCollection = new MeteorHookedCollection("server");


describe("Collection Hooks", () => {
  beforeEach(() => serverCollection.deleteMany({}));
  it("does something that should be tested", async () => {
    const promise = new Promise((resolve) => {
      serverCollection.find({}).observe({
        added(item: any) {
          resolve(item);
        }
      });
    });
    await serverCollection.insertOne({});
    console.log(await promise);
  });
});
