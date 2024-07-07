import { MeteorHookedCollection } from "meteor/znewsham:mongo-collection-hooks";
import "./serverForClient";

const serverCollection = new MeteorHookedCollection("server");


describe("Collection Hooks", () => {
  beforeEach(() => serverCollection.deleteMany({}));
  it("observe works", async () => {
    let handle;
    const promise = new Promise(async (resolve) => {
      const cursor = serverCollection.find({});
      let actualItem;
      handle = cursor.observe({
        added(item: any) {
          actualItem = item;
        }
      });
      resolve(actualItem);
    });
    await serverCollection.insertOne({});
    await promise;
    handle.stop();
  });
  it("Observe on a mapped cursor works", async() => {
    serverCollection.insertOne({ _id: "test", x: 2, y: 3 });

    const cursor = serverCollection
    .find<{_id: string, x: number, y: number}>({}).map(({ _id, x, y }) => ({ _id, result: x * y }));


    const handle = cursor.observeChanges({
      added(_id, { result, ...rest }) {
        console.log("added", _id, result, rest);
      },
      changed(_id, { result, ...rest }) {
        console.log("changed", _id, result, rest);
      },
      removed(_id) {
        console.log("removed", _id);
      }
    });
    await serverCollection.updateMany({ _id: "test" }, { $set: { x: 3, y: 2 } });
  });
});
