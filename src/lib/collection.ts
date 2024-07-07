import type {
  DeleteResult,
  Filter,
  InsertOneResult,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateResult,
  Document,
  IndexSpecification,
  CreateIndexesOptions,
  ObjectId
} from "mongodb";

import {
  HookedCollection,
  AmendedUpdateOptions,
  AmendedFindOneOptions,
  AmendedDeleteOptions,
  AmendedInsertOneOptions,
  AmendedFindOptions
} from "mongo-collection-hooks/es2015";
import type { Stringable } from "observe-mongo/es2015";

import { Mongo, MongoInternals } from "meteor/mongo";
import { DDP } from "meteor/ddp";
import { Random } from "meteor/random";
import { Meteor } from "meteor/meteor";
import { getBackingCollection, CompatibleMeteorFindCursor } from "meteor/znewsham:mongo-collection-hooks";

import {
  AddValidatorOptions,
  addValidator,
  defineMutationMethods,
  getProjection,
  validateDelete,
  validateInsert,
  validateUpdate
} from "./validation";


function alreadyInSimulation() {
  const CurrentInvocation =
    // @ts-expect-error
    DDP._CurrentMethodInvocation
    // For backwards compatibility, as explained in this issue:
    // https://github.com/meteor/meteor/issues/8947
    // @ts-expect-error
    || DDP._CurrentInvocation;

  const enclosing = CurrentInvocation.get();
  return enclosing && enclosing.isSimulation;
}

function stringIdGeneration(name: string | undefined) {
  const src = name
    // @ts-expect-error
    ? DDP.randomStream(`/collection/${name}`)
    // @ts-expect-error
    : Random.insecure;
  return src.id();
}

function objectIdGeneration(name: string | undefined): ObjectId {
  const src = name
  // @ts-expect-error
    ? DDP.randomStream(`/collection/${name}`)
    // @ts-expect-error
    : Random.insecure;
  return new Mongo.ObjectID(src.hexString(24)) as ObjectId;
}

type IDGeneration = "MONGO" | "STRING" | ((name: string) => Stringable);


type MutationOptions = {
  inSimulation?: boolean,
  isInsecure?: boolean
}

type MethodOptions = {
  returnStubValue?: boolean,
  throwStubExceptions?: false,
  noRetry?: false,
}

export type CompatibleAmendedFindOptions<TSchema extends Document> = AmendedFindOptions<TSchema> & {
  fields?: Document,
}

export type CompatibleAmendedFindOneOptions<TSchema extends Document> = AmendedFindOneOptions<TSchema> & {
  fields?: Document,
}

export type CompatibleAmendedInsertOneOptions = AmendedInsertOneOptions & MutationOptions & MethodOptions;
export type CompatibleAmendedDeleteOptions = AmendedDeleteOptions & MutationOptions & MethodOptions;
export type CompatibleAmendedUpdateOptions = AmendedUpdateOptions & MutationOptions & MethodOptions;

function assertOptionsAreMutationArgs(options: {} | undefined): asserts options is MutationOptions {

}

export class MeteorHookedCollection<TSchema extends { _id?: Stringable } = Document & { _id?: string }> extends HookedCollection<TSchema> {
  #transform;
  #driver;
  #idGeneration: ((name: string) => Stringable);
  constructor(
    name: string,
    {
      transform,
      defineMutationMethods: shouldDefineMutationMethods = true,
      // @ts-expect-error
      connection = Meteor.isServer ? Meteor.server : Meteor.connection,
      driver = Meteor.isServer ? MongoInternals.defaultRemoteCollectionDriver() : undefined,
      idGeneration = stringIdGeneration
    }: { transform?: any, defineMutationMethods?: boolean, connection?: any, driver?: any, idGeneration?: IDGeneration } = {}
  ) {
    const collection = getBackingCollection(name, Meteor.isServer ? driver.mongo : connection);
    super(collection, {
      findCursorImpl: CompatibleMeteorFindCursor,
      transform
    });
    if (idGeneration === "STRING") {
      this.#idGeneration = stringIdGeneration;
    }
    else if (idGeneration === "MONGO") {
      this.#idGeneration = objectIdGeneration;
    }
    else if (typeof idGeneration === "string") {
      throw new Error("Unrecognized ID generation");
    }
    else {
      this.#idGeneration = idGeneration;
    }
    this.#driver = driver;
    this.#transform = transform;
    if (shouldDefineMutationMethods) {
      this.#defineMutationMethods(connection);
    }
  }

  get _name() {
    return this.collectionName;
  }

  get _transform() {
    return this.#transform;
  }

  #defineMutationMethods = (connection: any) => {
    // TODO: we probably want to ensure these go at the start
    //       right now this is fine because it happens in the constructor first
    defineMutationMethods(this, connection);
    if (Meteor.isClient) {
      return;
    }
    this.on("before.insertOne", ({
      args: [doc, options]
    }) => {
      assertOptionsAreMutationArgs(options);
      if (!options?.isInsecure) {
        return;
      }
      validateInsert(this, doc, options, (Meteor.userId && Meteor.userId()) || undefined);
      // the doc may have been updated to have an _id
      return [doc, options];
    }, {
      tags: ["allow-deny"]
    });

    this.on("before.update", async ({
      args: [selector, mutator, options],
      getDocument
    }) => {
      assertOptionsAreMutationArgs(options);
      if (!options?.isInsecure) {
        return;
      }
      validateUpdate(this, selector, mutator, options, (Meteor.userId && Meteor.userId()) || undefined, await getDocument());
    }, {
      tags: ["allow-deny"],
      shouldRun({ argsOrig: [, , options] }) {
        assertOptionsAreMutationArgs(options);
        return options?.isInsecure || false;
      },
      projection: () => getProjection(this)
    });

    this.on("before.delete", async ({
      args: [selector, options],
      getDocument
    }) => {
      assertOptionsAreMutationArgs(options);
      if (!options?.isInsecure) {
        return;
      }
      validateDelete(this, selector, options, Meteor.userId && Meteor.userId() || undefined, await getDocument());
    }, {
      tags: ["allow-deny"],
      shouldRun({ argsOrig: [, options]}) {
        assertOptionsAreMutationArgs(options);
        return options?.isInsecure || false;
      },
      projection: () => getProjection(this)
    });
  }

  _ensureIndex(indexSpec: IndexSpecification, options?: CreateIndexesOptions | undefined) {
    return this.createIndex(indexSpec, options);
  }

  findOne<T extends Document = TSchema>(filter?: Filter<TSchema>, options?: CompatibleAmendedFindOneOptions<TSchema>): Promise<T | null> {
    const optionsWithFields = {
      ...options,
    };
    if (optionsWithFields?.fields) {
      optionsWithFields.projection = optionsWithFields.fields;
    }
    return super.findOne(filter, optionsWithFields);
  }

  find<T extends Document = TSchema>(filter?: Filter<TSchema>, options?: CompatibleAmendedFindOptions<TSchema>): CompatibleMeteorFindCursor<T> {
    const optionsWithDriver = {
      ...options,
      _driver: this.#driver,
      _collection: this
    };
    if (optionsWithDriver?.fields) {
      optionsWithDriver.projection = optionsWithDriver.fields;
    }
    return super.find(filter, optionsWithDriver) as CompatibleMeteorFindCursor<T>;
  }

  allow(options: AddValidatorOptions) {
    addValidator(this, "allow", options);
  }

  deny(options: AddValidatorOptions) {
    addValidator(this, "deny", options);
  }

  _makeNewID(): Stringable {
    return this.#idGeneration(this.collectionName);
  }

  insertOne(doc: OptionalUnlessRequiredId<TSchema>, options?: CompatibleAmendedInsertOneOptions): Promise<InsertOneResult<TSchema>> {
      const optionsWithInSimulation = {
      inSimulation: Meteor.isClient && alreadyInSimulation(),
      ...options
    };
    if (!doc._id && Meteor.isServer) {
      doc._id = this._makeNewID();
    }
    return super.insertOne(doc, optionsWithInSimulation);
  }

  deleteOne(filter: Filter<TSchema>, options?: CompatibleAmendedDeleteOptions): Promise<DeleteResult> {
    const optionsWithInSimulation = {
      alwaysAttemptOperation: Meteor.isClient,
      inSimulation: Meteor.isClient && alreadyInSimulation(),
      ...options
    };
    return super.deleteOne(filter, optionsWithInSimulation);
  }


  updateOne(filter: Filter<TSchema>, mutator: UpdateFilter<TSchema> | Partial<TSchema>, options?: CompatibleAmendedUpdateOptions): Promise<UpdateResult<TSchema>> {
  // updateOne(filter, mutator, options) {
    if (options?.upsert) {
      throw new Error("Upsert not supported on the client");
    }
    const optionsWithInSimulation = {
      alwaysAttemptOperation: Meteor.isClient,
      inSimulation: Meteor.isClient && alreadyInSimulation(),
      ...options
    };
    return super.updateOne(filter, mutator, optionsWithInSimulation);
  }
}
