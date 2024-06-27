# znewsham:mongo-collection-hooks

This meteor package is a wrapper around the [mongo-collection-hooks](https://www.npmjs.com/package/mongo-collection-hooks) package, it extends that functionality while exposing a collection that is compatible with meteor's isomorphic code.

## Example usage

```typescript
const MyCollection = new MeteorHookedCollection<{ _id: string, name?: string }>(
  "MyCollection",
  // all these are optional, the defaults are shown
  {
    transform: doc => doc,
    defineMutationMethods = true,
    connection: Meteor.server || Meteor.connection
    driver: MongoInternals.defaultRemoteCollectionDriver(),
    idGeneration: "STRING"
  }
);

if (Meteor.isServer) {
  Meteor.publish("myStuff", () => MyCollection.find())
}

if (Meteor.isClient) {
  MyCollection.insertOne({ _id: "whatever" });
}

```


On the client, `insertOne`, `updateOne`, `deleteOne` mutations are suported, as well as `find` and `findOne`.

On the `FindCursor` - the following methods are exposed
- `toArray`
- `map` (mongo semantics)
- `count` (deprecated, mongo semantics)
- `forEach` (mongo semantics)
- `fetch` (deprecated, synchronous - uses a fiber on the server)
- `countAsync` (meteor semantics)
- `forEachAsync` (meteor semantics)
- `mapAsync` (meteor semantics)
- `fetchAsync` (meteor semantics)
- `observeChanges`
- `observe`
- `_publishCursor`

The resultant cursor can be published and observed as normal.

This package also re-implements the allow-deny package such that you can define the mutation methods and use them as you would expect.

Everything provided by the base meteor packages should work as expected - though (somewhat obviously) nothing provided by monkey patching mongo will work - e.g., redis-oplog, schema validation, etc - it's expected that you extend this class as appropriate and add the required functionality through hooks.


## Redis-oplog
Because it is so ubiquitous, this package does provide support for redis-oplog, but it's opt-in only.
The following methods will result in redis-oplog notifications:
- `insertOne`
- `insertMany`
- `updateOne`
- `updateMany`
- `deleteOne`
- `deleteMany`

```typescript
import { applyRedis, MeteorHookedCollection } from "meteor/znewsham:mongo-collection-hooks";

const collection = new MeteorHookedCollection("myCollection");

if (Meteor.isServer) {
  applyRedis(collection);
}

```
