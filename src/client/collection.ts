// @ts-expect-error
import { LocalCollection } from "meteor/minimongo";
import { Meteor } from "meteor/meteor";
import type { Collection, Filter, FindCursor, OptionalUnlessRequiredId, UpdateFilter } from "mongodb";

import { ClientCursor } from "./mongoCursor";
import {
  CompatibleAmendedDeleteOptions,
  CompatibleAmendedFindOneOptions,
  CompatibleAmendedInsertOneOptions,
  CompatibleAmendedUpdateOptions
} from "../lib/collection";

export class ClientCollection<TSchema extends Document = Document> implements Pick<Collection<TSchema>, "findOne" | "find" | "insertOne" | "updateOne" | "deleteOne"> {
  #name;
  #localCollection;
  #connection;
  constructor(
    name: string,
    {
      // @ts-expect-error
      connection = Meteor.connection
    } = {}
  ) {
    this.#name = name;
    this.#connection = connection;
    if (!connection._mongo_livedata_collections) {
      connection._mongo_livedata_collections = {};
    }
    if (!connection._mongo_livedata_collections[this.#name]) {
      connection._mongo_livedata_collections[this.#name] = new LocalCollection(this.#name);
    }
    this.#localCollection = connection._mongo_livedata_collections[this.#name];
    Mongo.Collection.prototype._maybeSetUpReplication.call(this, this.collectionName, {});
  }

  get collectionName() {
    return this.#name;
  }

  get _collection() {
    return this.#localCollection;
  }

  get _connection() {
    return this.#connection;
  }

  findOne<T extends TSchema = TSchema>(filter?: Filter<TSchema>, options?: CompatibleAmendedFindOneOptions<TSchema>): Promise<T | null> {
    return Promise.resolve(this.#localCollection.findOne(filter || {}, options));
  }

  find<T extends TSchema = TSchema>(filter?: Filter<TSchema>, options?: CompatibleAmendedFindOneOptions<TSchema>): FindCursor<T> {
    return new ClientCursor(this.#localCollection.find(filter || {}, options)) as unknown as FindCursor<T>;
  }

  insertOne(doc: OptionalUnlessRequiredId<TSchema>, {
    inSimulation,
    returnStubValue = true,
    throwStubExceptions = false,
    noRetry = false,
    ...options
  }: CompatibleAmendedInsertOneOptions = {}) {
    if (inSimulation) {
      const insert = this.#localCollection.insert(doc);
      return Promise.resolve({
        acknowledged: true,
        insertedId: insert
      });
    }
    // QUESTION: do we really not care about the callback at all?
    return this.#connection.applyAsync(
      `/${this.collectionName}/insertOne`,
      [doc, options],
      {
        returnStubValue,
        throwStubExceptions,
        noRetry
      }
    );
  }

  updateOne(selector: Filter<TSchema>, mutator: UpdateFilter<TSchema>, optionsWithAlwaysAttempt: CompatibleAmendedUpdateOptions) {
    const {
      alwaysAttemptOperation,
      inSimulation,
      returnStubValue = true,
      throwStubExceptions = false,
      noRetry = false,
      ...options
    } = optionsWithAlwaysAttempt;
    if (inSimulation) {
      const { numberAffected, insertedId } = this.#localCollection.update(selector, mutator, { ...options, _returnObject: true, multi: false });
      return Promise.resolve({
        acknowledged: true,
        matchedCount: numberAffected,
        modifiedCount: numberAffected,
        upsertedCount: insertedId ? 1 : 0,
        upsertedId: insertedId
      });
    }
    // QUESTION: do we really not care about the callback at all?
    return this.#connection.applyAsync(
      `/${this.collectionName}/updateOne`,
      [selector, mutator, options],
      {
        returnStubValue,
        throwStubExceptions,
        noRetry
      }
    );
  }

  deleteOne(selector: Filter<TSchema>, optionsWithAlwaysAttempt: CompatibleAmendedDeleteOptions) {
    const {
      alwaysAttemptOperation,
      inSimulation,
      returnStubValue = true,
      throwStubExceptions = false,
      noRetry = false,
      ...options
    } = optionsWithAlwaysAttempt;
    if (inSimulation) {
      const removed = this.#localCollection.remove(selector);
      return Promise.resolve({
        acknowledged: true,
        deletedCount: removed
      });
    }
    // QUESTION: do we really not care about the callback at all?
    return this.#connection.applyAsync.call(
      `/${this.collectionName}/deleteOne`,
      [selector, options],
      {
        returnStubValue,
        throwStubExceptions,
        noRetry
      }
    );
  }
}
