import { AmendedFindOptions, HookedFindCursor } from "mongo-collection-hooks/es2015";
import type {
  ObserveChangesCallbacks,
  ObserveChangesMutatingCallbacks,
  ObserveChangesNonMutatingCallbacks,
  ObserveDriverConstructor,
  ObserveOptions,
  ObserveCallbacks,
  ObserveMutatingCallbacks,
  ObserveNonMutatingCallbacks,
  Stringable,
  CursorDescription,
  NestedProjectionOfTSchema
} from "observe-mongo/es2015";

import type {
  WithCursorDescription
} from "observe-mongo/es2015/redis";

import { Mongo } from "meteor/mongo";
import { Meteor } from "meteor/meteor";
import { Promise as MeteorPromise } from "meteor/promise";
import type {  Filter, ObjectId } from "mongodb";
import { HookedFindCursorOptions } from "mongo-collection-hooks/es2015";


export abstract class CompatibleMeteorFindCursor<
  TSchema = { _id: string },
  ObserveSchema extends{ _id: Stringable } = TSchema extends { _id: Stringable } ? TSchema : { _id: Stringable }
> extends HookedFindCursor<TSchema> implements Omit<Mongo.Cursor<TSchema>, "count" | "forEach" | "map" | "observe" | "observeChanges">, WithCursorDescription<TSchema> {
  #filter;
  #options: CursorDescription<TSchema>["options"] = {};
  #originalOptions: HookedFindCursorOptions<TSchema>;

  // this is the meteor transform (e.g., propagated from the collection)
  #transform: (doc: TSchema) => any = <TSchema>(doc: TSchema) => doc;

  #mapTransform: undefined | ((doc: TSchema) => any)
  #cursor;
  constructor(
    filter: Filter<TSchema> | undefined,
    cursor: any,
    options: HookedFindCursorOptions<TSchema>
  ) {
    super(filter, cursor, options);
    this.#filter = filter;
    this.#cursor = cursor;
    if (options.transform) {
      this.#transform = options.transform;
    }
    this.#originalOptions = options;
    this.#options = {
      skip: options.invocationOptions?.skip,
      limit: options.invocationOptions?.limit,
      projection: options.invocationOptions?.fields || options.invocationOptions?.projection,
      sort: options.invocationOptions?.sort,
      disableOplog: options.invocationOptions?.disableOplog
    };
  }

  get cursorDescription() {
    return {
      filter: this.#filter,
      options: {
        skip: this.#options.skip,
        limit: this.#options.limit,
        projection: this.#options.projection,
        sort: this.#options.sort,
      }
    };
  }

  get _mapTransform() {
    return this.#mapTransform;
  }

  get _originalOptions() {
    return this.#originalOptions;
  }

  get _options() {
    return this.#options;
  }

  get _cursor() {
    return this.#cursor;
  }

  get _filter() {
    return this.#filter;
  }

  get _transform() {
    return this.#transform;
  }

  /**
   * @deprecated Use toArray instead and convert to promises. This is the way.
   */
  fetch() {
    if (Meteor.isClient) {
      return this.#cursor.fetch();
    }
    return MeteorPromise.await(this.toArray());
  }

  getTransform() {
    return this.#transform;
  }

  // we're going to support the parts of the async collection that make sense - e.g., we're NOT going to support index on iterators.

  /** @deprecated use native mongo */
  countAsync(applySkipLimit?: boolean | undefined): Promise<number> {
    return this.count(applySkipLimit ? { skip: this.#options.skip, limit: this.#options.limit } : {})
  }

  /** @deprecated use native mongo */
  forEachAsync(callback: (doc: TSchema, index: number, cursor: Mongo.Cursor<TSchema>) => void, thisArg?: any): Promise<void> {
    return this.forEach((doc) => thisArg
      ? callback.call(thisArg, doc, -1, this as unknown as Mongo.Cursor<TSchema>)
      : callback(doc, -1, this as unknown as Mongo.Cursor<TSchema>)
    );
  }

  /** @deprecated use native mongo */
  mapAsync<M>(callback: (doc: TSchema, index: number, cursor: Mongo.Cursor<TSchema, TSchema>) => M, thisArg?: any): Promise<M[]> {
    return this.map((doc) => thisArg
      ? callback.call(thisArg, doc, -1, this as unknown as Mongo.Cursor<TSchema>)
      : callback(doc, -1, this as unknown as Mongo.Cursor<TSchema>)
    ).toArray();
  }

  /** @deprecated use native mongo */
  fetchAsync(): Promise<TSchema[]> {
    return this.toArray();
  }

  #applyMapTransform = <T>(transform: (doc: TSchema) => T) => {
    const oldTransform = this.#mapTransform;

    this.#mapTransform = oldTransform ? (doc => transform(oldTransform(doc))) : transform;
  }

  map<T>(transform: (doc: TSchema) => T): CompatibleMeteorFindCursor<T> {
    this.#applyMapTransform(transform);
    return super.map(transform) as CompatibleMeteorFindCursor<T>;
  }

  [Symbol.iterator](): Iterator<TSchema> {
    throw new Error("You can't use sync iterator");
  }

  abstract observe(
    callbacks: ObserveNonMutatingCallbacks<ObserveSchema>,
    options?: { nonMutatingCallbacks: true } & ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;
  abstract observe(
    callbacks: ObserveMutatingCallbacks<ObserveSchema>,
    options?: { nonMutatingCallbacks: false } & ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;
  abstract observe(
    callbacks: ObserveCallbacks<ObserveSchema>,
    options?: ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;

  abstract observeChanges(
    callbacks: ObserveChangesNonMutatingCallbacks<ObserveSchema["_id"], Omit<ObserveSchema, "_id">>,
    options?: { nonMutatingCallbacks: true } & ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;
  abstract observeChanges(
    callbacks: ObserveChangesMutatingCallbacks<ObserveSchema["_id"], Omit<ObserveSchema, "_id">>,
    options?: { nonMutatingCallbacks: false } & ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;
  abstract observeChanges(
    callbacks: ObserveChangesCallbacks<ObserveSchema["_id"], Omit<ObserveSchema, "_id">>,
    options?: ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;

  abstract clone(): CompatibleMeteorFindCursor<TSchema, ObserveSchema>;
}
