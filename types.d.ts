import {
    HookedCollection,
    AmendedUpdateOptions,
    AmendedFindOneOptions,
    AmendedDeleteOptions,
    AmendedInsertOneOptions,
    HookedFindCursor,
    AmendedFindOptions,
} from "mongo-collection-hooks/es2015";

import type {
    ObserveChangesCallbacks,
    ObserveChangesNonMutatingCallbacks,
    ObserveChangesMutatingCallbacks,
    ObserveDriverConstructor,
    ObserveOptions,
    ObserveCallbacks,
    ObserveNonMutatingCallbacks,
    ObserveMutatingCallbacks,
    Stringable,
    CursorDescription,
    NestedProjectionOfTSchema
  } from "observe-mongo/es2015";

import { Mongo } from "meteor/mongo";
import type {
    DeleteResult,
    Filter,
    InsertOneResult,
    OptionalUnlessRequiredId,
    UpdateFilter,
    UpdateResult,
    Document,
    IndexSpecification,
    CreateIndexesOptions
} from "mongodb";


export * from "observe-mongo/es2015";
export * from "mongo-collection-hooks/es2015";

export class CompatibleMeteorFindCursor<
  TSchema extends { _id?: Stringable } = { _id: string },
  ObserveSchema extends{ _id: Stringable } = TSchema extends { _id: Stringable } ? TSchema : { _id: Stringable }
> extends HookedFindCursor<TSchema> implements Omit<Mongo.Cursor<TSchema>, "count" | "forEach" | "map">, WithCursorDescription<TSchema> {
  constructor(
    filter: Filter<TSchema> | undefined,
    cursor: any,
    options: HookedFindCursorOptions<TSchema>
  );

  get cursorDescription(): CursorDescription

  /**
   * @deprecated Use toArray instead and convert to promises. This is the way.
   */
  fetch(): TSchema[]

  getTransform(): ((doc) => any);

  countAsync(applySkipLimit?: boolean | undefined): Promise<number>;
  forEachAsync(callback: (doc: TSchema, index: number, cursor: Mongo.Cursor<TSchema>) => void, thisArg?: any);
  mapAsync<M>(callback: (doc: TSchema, index: number, cursor: Mongo.Cursor<TSchema, TSchema>) => M, thisArg?: any);
  fetchAsync(): Promise<TSchema[]>;

  map<T>(transform: (doc: TSchema) => T): CompatibleMeteorFindCursor<T>;

  abstract observe(
    callbacks: ObserveNonMutatingCallbacks<ObserveSchema["_id"], Omit<ObserveSchema, "_id">>,
    options?: { nonMutatingCallbacks: true } & ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;
  abstract observe(
    callbacks: ObserveMutatingCallbacks<ObserveSchema["_id"], Omit<ObserveSchema, "_id">>,
    options?: { nonMutatingCallbacks: false } & ObserveOptions<ObserveSchema>
  ): Meteor.LiveQueryHandle;

  abstract observe(
    callbacks: ObserveCallbacks<ObserveSchema["_id"], Omit<ObserveSchema, "_id">>,
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

  clone(): CompatibleMeteorFindCursor<TSchema, ObserveSchema["_id"], Omit<ObserveSchema, "_id">>;
}

type IDGeneration = string | ((name: string) => Mongo.ObjectID | string);
type MutationOptions = {
    inSimulation?: boolean;
    isInsecure?: boolean;
};
type CompatibleAmendedFindOptions<TSchema extends Document> = AmendedFindOptions<TSchema> & {
    fields?: Document;
};
type CompatibleAmendedFindOneOptions<TSchema extends Document> = AmendedFindOneOptions<TSchema> & {
    fields?: Document;
};
type CompatibleAmendedInsertOneOptions = AmendedInsertOneOptions & MutationOptions;
type CompatibleAmendedDeleteOptions = AmendedDeleteOptions & MutationOptions;
type CompatibleAmendedUpdateOptions = AmendedUpdateOptions & MutationOptions;
export class MeteorHookedCollection<TSchema extends Document> extends HookedCollection<TSchema> {
    #private;
    constructor(name: any, { transform, defineMutationMethods: shouldDefineMutationMethods, connection, driver, idGeneration }?: {
        transform?: any;
        defineMutationMethods?: boolean;
        connection?: any;
        driver?: any;
        idGeneration?: IDGeneration;
    });
    get _name(): string;
    get _transform(): any;
    _ensureIndex(indexSpec: IndexSpecification, options?: CreateIndexesOptions | undefined): Promise<string>;
    _ensureIndexAsync(indexSpec: IndexSpecification, options?: CreateIndexesOptions | undefined): void;
    findOne<T extends Document = TSchema>(filter?: Filter<TSchema>, options?: CompatibleAmendedFindOneOptions<TSchema>): Promise<T | null>;
    find<T extends Document = TSchema>(filter?: Filter<TSchema>, options?: CompatibleAmendedFindOptions<TSchema>): CompatibleMeteorFindCursor<T>;
    find(filter?: Filter<TSchema>, options?: CompatibleAmendedFindOptions<TSchema>): CompatibleMeteorFindCursor<TSchema>;
    allow(options: any): void;
    deny(options: any): void;
    _makeNewID(): any;
    insertOne(doc: OptionalUnlessRequiredId<TSchema>, options?: CompatibleAmendedInsertOneOptions): Promise<InsertOneResult<TSchema>>;
    deleteOne(filter: Filter<TSchema>, options?: CompatibleAmendedDeleteOptions): Promise<DeleteResult>;
    updateOne(filter: Filter<TSchema>, mutator: UpdateFilter<TSchema> | Partial<TSchema>, options?: CompatibleAmendedUpdateOptions): Promise<UpdateResult<TSchema>>;
}

export * from "mongo-collection-hooks/es2015";
