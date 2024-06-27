import { HookedCollection, AmendedUpdateOptions, AmendedFindOneOptions, AmendedDeleteOptions, AmendedInsertOneOptions, HookedFindCursor, AmendedFindOptions } from "mongo-collection-hooks";
import { Mongo } from "meteor/mongo";
import type { DeleteResult, Filter, InsertOneResult, OptionalUnlessRequiredId, UpdateFilter, UpdateResult, Document, IndexSpecification, CreateIndexesOptions } from "mongodb";
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
    find<T extends Document = TSchema>(filter?: Filter<TSchema>, options?: CompatibleAmendedFindOptions<TSchema>): HookedFindCursor<T>;
    allow(options: any): void;
    deny(options: any): void;
    _makeNewID(): any;
    insertOne(doc: OptionalUnlessRequiredId<TSchema>, options?: CompatibleAmendedInsertOneOptions): Promise<InsertOneResult<TSchema>>;
    deleteOne(filter: Filter<TSchema>, options?: CompatibleAmendedDeleteOptions): Promise<DeleteResult>;
    updateOne(filter: Filter<TSchema>, mutator: UpdateFilter<TSchema> | Partial<TSchema>, options?: CompatibleAmendedUpdateOptions): Promise<UpdateResult<TSchema>>;
}

export * from "mongo-collection-hooks";
