import { Promise as MeteorPromise } from "meteor/promise";
// @ts-expect-error
import { Minimongo } from "meteor/minimongo";
import type { Filter, ObjectId } from "mongodb";

import {
  ObserveCallbacks,
  ObserveNonMutatingCallbacks,
  ObserveMutatingCallbacks,
  ObserveChangesCallbacks,
  ObserveChangesNonMutatingCallbacks,
  ObserveChangesMutatingCallbacks,
  ObserveDriverConstructor,
  ObserveOptions,
  Stringable,
  observeChanges,
  observeFromObserveChanges,
  ObserveHandle
} from "observe-mongo/es2015";
import {
  RedisObserverDriverOptions,
  SubscriptionManager,
  PubSubManager,
  RedisObserverDriver,
  canUseRedisOplog
} from "observe-mongo/es2015/redis";
import { CompatibleMeteorFindCursor as CompatibleMeteorFindCursorCommon } from "../lib/cursor";
import { MeteorHookedCollection } from "../lib/collection";
import { HookedFindCursorOptions } from "mongo-collection-hooks/es2015";
import { getSubManager, setSubManager } from "./subManager";

type CompatibleMeteorFindCursorOptions<
  CursorSchema extends { _id?: Stringable },
  CollectionSchema extends { _id?: Stringable }
> = Omit<HookedFindCursorOptions<CursorSchema>, "invocationOptions"> & {
  invocationOptions?: HookedFindCursorOptions<CursorSchema>["invocationOptions"] & {
    _collection?: MeteorHookedCollection<CollectionSchema>,
    _observeDriverClass?: CursorSchema extends { _id: Stringable } ? ObserveDriverConstructor<CursorSchema> : never
  }
}

export class CompatibleMeteorFindCursor<
  TSchema extends { _id?: Stringable },
  ObserveSchema extends { _id: Stringable } = TSchema extends { _id: Stringable } ? TSchema : { _id: Stringable }
> extends CompatibleMeteorFindCursorCommon<TSchema, ObserveSchema> {
  #collection: MeteorHookedCollection<{ _id?: Stringable }>;
  #observeDriverClass: ObserveDriverConstructor<ObserveSchema> | undefined;

  constructor(
    filter: Filter<TSchema> | undefined,
    cursor: any,
    options: CompatibleMeteorFindCursorOptions<TSchema, { _id?: Stringable }>
  ) {
    if (!options.invocationOptions?._collection) {
      throw new Error("Must provide a collection");
    }
    super(filter, cursor, options);

    this.#observeDriverClass = options.invocationOptions?._observeDriverClass;
    this.#collection = options.invocationOptions?._collection;
  }

  observe(
    callbacks: ObserveNonMutatingCallbacks<ObserveSchema>,
    options?: { nonMutatingCallbacks: true } & ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;
  observe(
    callbacks: ObserveMutatingCallbacks<ObserveSchema>,
    options?: { nonMutatingCallbacks: false } & ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;
  observe(callbacks: ObserveCallbacks<ObserveSchema>, options?: ObserveOptions<ObserveSchema>) {
    return MeteorPromise.await(observeFromObserveChanges(callbacks, this, options));
  }

  _publishCursor(sub: any) {
    const cursor: CompatibleMeteorFindCursor<TSchema, ObserveSchema> = this;
    const collection = this.#collection?.collectionName;
    const observeHandle = cursor.observeChanges({
      added(id: ObserveSchema["_id"], fields: Omit<ObserveSchema, "_id">) {
        sub.added(collection, id, fields);
      },
      changed(id: ObserveSchema["_id"], fields: Partial<Omit<ObserveSchema, "_id">>) {
        sub.changed(collection, id, fields);
      },
      removed(id: ObserveSchema["_id"]) {
        sub.removed(collection, id);
      }
    },
    // Publications don't mutate the documents
    // This is tested by the `livedata - publish callbacks clone` test
    { nonMutatingCallbacks: true });

    // We don't call sub.ready() here: it gets called in livedata_server, after
    // possibly calling _publishCursor on multiple returned cursors.

    // register stop callback (expects lambda w/ no args).
    sub.onStop(function () {
      observeHandle.stop();
    });

    // return the observeHandle in case it needs to be stopped early
    return observeHandle;
  }

  observeChanges(
    callbacks: ObserveChangesCallbacks<ObserveSchema["_id"], Omit<ObserveSchema, "_id">>,
    options?: ObserveOptions<ObserveSchema>
  ): ObserveHandle {
    // @ts-expect-error - we document an interface that's correct (e.g. 1|0) but we allow true|false as well.
    if (this.cursorDescription.options.projection?._id === false || this.cursorDescription.options.projection?._id === 0) {
      throw new Error("You can't observe a cursor without an _id");
    }
    const extraOptions: Partial<RedisObserverDriverOptions<ObserveSchema>> = {
      driverClass: options?.driverClass || this.#observeDriverClass,

      // @ts-expect-error - not sure how to resolve, TSchema must be a document :shrug:
      transform: this._transform
    };
    if (
      // @ts-expect-error
      Package["cultofcoders:redis-oplog"]
      && canUseRedisOplog(this, { Matcher: Minimongo.Matcher })
    ) {
      extraOptions.driverClass = options?.driverClass || this.#observeDriverClass || (RedisObserverDriver as unknown as ObserveDriverConstructor<ObserveSchema>);

      const RedisSubscriptionManagerModule = MeteorPromise.await(import ("meteor/cultofcoders:redis-oplog/lib/redis/RedisSubscriptionManager"));

      // @ts-expect-error
      const pubSubManager: PubSubManager = Package["cultofcoders:redis-oplog"].Config.pubSubManager
      if (!pubSubManager) {
        throw new Error("Can't call observeChanges before initialising redis-oplog");
      }
      extraOptions.Matcher = Minimongo.Matcher;
      extraOptions.Sorter = Minimongo.Sorter;
      extraOptions.compileProjection = Minimongo.LocalCollection._compileProjection;
      if (!getSubManager()) {
        setSubManager(new SubscriptionManager(pubSubManager, RedisSubscriptionManagerModule.default.uid));
      }
      extraOptions.manager = getSubManager();
    }
    const optionsToUse: ObserveOptions<ObserveSchema> = {
      clone: EJSON.clone,
      equals: (doc1: ObserveSchema, doc2: ObserveSchema) => EJSON.equals(doc1 as EJSON, doc2 as EJSON),
      multiplexerId: () => EJSON.stringify({
        namespace: this.namespace,
        ...this.cursorDescription
      }),
      ...extraOptions as RedisObserverDriverOptions<ObserveSchema>,
      ordered: options?.ordered || false,
    };

    return MeteorPromise.await(observeChanges(
      this as unknown as CompatibleMeteorFindCursor<ObserveSchema>,
      this.#collection,
      callbacks,
      optionsToUse
    ));
  }

  get _originalOptions(): CompatibleMeteorFindCursorOptions<TSchema, { _id?: Stringable }> {
    return super._originalOptions as CompatibleMeteorFindCursorOptions<TSchema, { _id?: Stringable }>;
  }

  clone(): CompatibleMeteorFindCursor<TSchema, ObserveSchema> {
    return new CompatibleMeteorFindCursor<TSchema, ObserveSchema>(
      this._filter,
      this._cursor.clone(),
      this._originalOptions
    );
  }
}
