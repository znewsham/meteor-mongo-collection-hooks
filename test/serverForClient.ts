import { MeteorHookedCollection } from "meteor/znewsham:mongo-collection-hooks";
import { Meteor } from "meteor/meteor";
import { Promise as MeteorPromise } from "meteor/promise";

const clientCollection = new MeteorHookedCollection("client");
MeteorPromise.await(clientCollection.deleteMany({}));

clientCollection.allow({
  insert() { return true; },
  update() { return true; },
  remove() { return true; }
});

Meteor.methods({
  async testInsert() {
    await clientCollection.insertOne({});
  }
});

Meteor.publish("testClient", () => clientCollection.find() as unknown as Mongo.Cursor<any>);
