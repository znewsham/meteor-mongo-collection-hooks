import { check, Match } from "meteor/check";
// @ts-expect-error
import { LocalCollection } from "meteor/minimongo";
import { EJSON } from "meteor/ejson";
import { Meteor } from "meteor/meteor";
import { MeteorHookedCollection } from "../server";
import type { OptionalUnlessRequiredId, Document, Filter, UpdateFilter } from "mongodb";
import { AmendedDeleteOptions, AmendedInsertOneOptions, AmendedUpdateOptions } from "mongo-collection-hooks/es2015";
import type { Stringable } from "observe-mongo/es2015";
import { NestedProjectionOfTSchema } from "mongo-collection-helpers";

const validationContexts = new WeakMap<MeteorHookedCollection, ValidationContext>();

type FunctionWithTransform = Function & { transform?: Function }

export type Validators = {
  allow: FunctionWithTransform[],
  deny: FunctionWithTransform[],
  transform?: (doc: any) => any
}

type ValidationContext = {
  restricted: boolean,
  insecure: boolean | undefined,
  validators: {
    insert: Validators,
    update: Validators,
    remove: Validators,
    upsert: Validators,
    fetch: string[] | undefined,
    fetchAllFields: boolean
  }
};

function getValidationContext(): ValidationContext {
  return {
    restricted: false,
    insecure: undefined,
    validators: {
      insert: { allow: [], deny: [] },
      update: { allow: [], deny: [] },
      remove: { allow: [], deny: [] },
      upsert: { allow: [], deny: [] }, // dummy arrays; can't set these!
      fetch: [],
      fetchAllFields: false
    }
  };
}

export function getProjection<TSchema extends { _id?: Stringable }>(collection: MeteorHookedCollection<TSchema>): NestedProjectionOfTSchema<TSchema> {
  const validationContext = validationContexts.get(collection as unknown as MeteorHookedCollection);
  if (!validationContext) {
    throw new Error("Can't validate something with no allow/deny rules");
  }
  const fields: NestedProjectionOfTSchema<TSchema> = {};
  if (!validationContext.validators.fetchAllFields) {
    validationContext.validators.fetch?.forEach((fieldName) => {
      // @ts-expect-error
      fields[fieldName] = 1;
    });
  }
  return fields;
}

export function updateFetch<TSchema extends { _id?: Stringable }>(collection: MeteorHookedCollection<TSchema>, fields: string[] | undefined) {
  const validationContext = validationContexts.get(collection as unknown as MeteorHookedCollection);
  if (!validationContext) {
    throw new Error("Can't validate something with no allow/deny rules");
  }

  if (!validationContext.validators.fetchAllFields) {
    if (fields) {
      const set = new Set<string>();
      validationContext.validators.fetch?.forEach(name => set.add(name));
      fields?.forEach(name => set.add(name));
      validationContext.validators.fetch = Array.from(set);
    }
    else {
      validationContext.validators.fetchAllFields = true;
      // clear fetch just to make sure we don't accidentally read it
      validationContext.validators.fetch = undefined;
    }
  }
}

function docToValidate<TSchema extends Document>(validator: FunctionWithTransform, doc: OptionalUnlessRequiredId<TSchema>, generatedId: string | undefined) {
  let ret = doc;
  if (validator.transform) {
    ret = EJSON.clone(doc);
    if (generatedId !== null) {
      ret._id = generatedId;
    }
    ret = validator.transform(ret);
  }
  return ret;
}

function transformDoc(validator: FunctionWithTransform, doc: object | null) {
  if (validator.transform) {
    return validator.transform(doc);
  }
  return doc;
}

export function validateInsert<TSchema extends { _id?: Stringable }>(
  collection: MeteorHookedCollection<TSchema>,
  doc: OptionalUnlessRequiredId<TSchema>,
  options: AmendedInsertOneOptions,
  userId: string | undefined
) {
  const validationContext = validationContexts.get(collection as unknown as MeteorHookedCollection);
  if (!validationContext) {
    throw new Error("Can't validate something with no allow/deny rules");
  }
  let generatedId: string | undefined;
  if (!doc._id) {
    generatedId = collection._makeNewID() as string;
  }
  // call user validators.
  // Any deny returns true means denied.
  if (validationContext.validators.insert.deny.some(validator => validator(userId, docToValidate(validator, doc, generatedId)))) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (validationContext.validators.insert.allow.every(validator => !validator(userId, docToValidate(validator, doc, generatedId)))) {
    throw new Meteor.Error(403, "Access denied");
  }

  // If we generated an ID above, insert it now: after the validation, but
  // before actually inserting.
  if (generatedId !== null) {
    doc = { _id: generatedId, ...doc };
  }
  return doc;
}

const noReplaceError = "Access denied. In a restricted collection you can only" +
      " update documents, not replace them. Use a Mongo update operator, such " +
      "as '$set'.";
const ALLOWED_UPDATE_OPERATIONS = {
  $inc: 1,
  $set: 1,
  $unset: 1,
  $addToSet: 1,
  $pop: 1,
  $pullAll: 1,
  $pull: 1,
  $pushAll: 1,
  $push: 1,
  $bit: 1
};

export function validateUpdate<TSchema extends { _id?: Stringable }>(
  collection: MeteorHookedCollection<TSchema>,
  selector: Filter<TSchema>,
  mutator: UpdateFilter<TSchema>,
  options: AmendedUpdateOptions,
  userId: string | undefined,
  doc: Document | null
) {
  const validationContext = validationContexts.get(collection as unknown as MeteorHookedCollection);
  if (!validationContext) {
    throw new Error("Can't validate something with no allow/deny rules");
  }

  check(mutator, Object);

  options = options || {};

  if (!LocalCollection._selectorIsIdPerhapsAsObject(selector)) {
    throw new Error("validated update should be of a single ID");
  }

  // We don't support upserts because they don't fit nicely into allow/deny
  // rules.
  if (options.upsert) {
    throw new Meteor.Error(
      403,
      "Access denied. Upserts not allowed in a restricted collection."
    );
  }

  const mutatorKeys = Object.keys(mutator);

  // compute modified fields
  const modifiedFields: {[k in string]: true} = {};

  if (mutatorKeys.length === 0) {
    throw new Meteor.Error(403, noReplaceError);
  }
  mutatorKeys.forEach((op) => {
    const params: object = mutator[op];
    if (op.charAt(0) !== "$") {
      throw new Meteor.Error(403, noReplaceError);
    }
    // @ts-expect-error
    if (!ALLOWED_UPDATE_OPERATIONS[op]) {
      throw new Meteor.Error(403, `Access denied. Operator ${op} not allowed in a restricted collection.`);
    }
    Object.keys(params).forEach((field) => {
      // treat dotted fields as if they are replacing their
      // top-level part
      if (field.indexOf(".") !== -1) {
        field = field.substring(0, field.indexOf("."));
      }

      // record the field we are trying to change
      modifiedFields[field] = true;
    });
  });

  const fields = Object.keys(modifiedFields);

  // call user validators.
  // Any deny returns true means denied.
  if (validationContext.validators.update.deny.some((validator) => {
    const factoriedDoc = transformDoc(validator, doc);
    return validator(userId, factoriedDoc, fields, mutator);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (validationContext.validators.update.allow.every((validator) => {
    const factoriedDoc = transformDoc(validator, doc);
    return !validator(
      userId,
      factoriedDoc,
      fields,
      mutator
    );
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
}

export function validateDelete<TSchema extends { _id?: Stringable }>(
  collection: MeteorHookedCollection<TSchema>,
  selector: Filter<TSchema>,
  options: any,
  userId: string | undefined,
  doc: Document | null
) {
  const validationContext = validationContexts.get(collection as unknown as MeteorHookedCollection);
  if (!validationContext) {
    throw new Error("Can't validate something with no allow/deny rules");
  }

  // call user validators.
  // Any deny returns true means denied.
  if (validationContext.validators.remove.deny.some((validator) => {
    return validator(userId, transformDoc(validator, doc));
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (validationContext.validators.remove.allow.every((validator) => {
    return !validator(userId, transformDoc(validator, doc));
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
}

export function defineMutationMethods<TSchema extends { _id?: Stringable }>(
  collection: MeteorHookedCollection<TSchema>,
  // @ts-expect-error
  connection = Meteor.server
) {
  if (validationContexts.has(collection as unknown as MeteorHookedCollection)) {
    throw new Error("Can't redefine mutation methods");
  }
  const validationContext = getValidationContext();
  validationContexts.set(collection as unknown as MeteorHookedCollection, validationContext);
  connection.methods({
    [`/${collection.collectionName}/insertOne`]: (doc: OptionalUnlessRequiredId<TSchema>, options: AmendedInsertOneOptions) => {
      check([doc, options], [Match.Any]);
      return collection.insertOne(doc, { ...options, isInsecure: true, inSimulation: Meteor.isClient });
    },
    [`/${collection.collectionName}/updateOne`]: (selector: Filter<TSchema>, mutator: UpdateFilter<TSchema>, options: AmendedUpdateOptions) => {
      check([selector, mutator, options], [Match.Any]);
      return collection.updateOne(selector, mutator, { ...options, isInsecure: true, inSimulation: Meteor.isClient });
    },
    [`/${collection.collectionName}/deleteOne`]: (selector: Filter<TSchema>, options: AmendedDeleteOptions) => {
      check([selector, options], [Match.Any]);
      return collection.deleteOne(selector, { ...options, isInsecure: true, inSimulation: Meteor.isClient });
    }
  });
}

export type AddValidatorOptions = {[k in keyof ValidationContext["validators"]]?: FunctionWithTransform } & { transform?: (doc: any) => any } & { fetch?: string[] };

export function addValidator<TSchema extends { _id?: Stringable }>(
  collection: MeteorHookedCollection<TSchema>,
  allowOrDeny: "allow" | "deny",
  options: AddValidatorOptions
) {
  const validationContext = validationContexts.get(collection as unknown as MeteorHookedCollection);
  if (!validationContext) {
    throw new Error("Can't specify allow/deny rules on a collection with no methods");
  }

  const validKeysRegEx = /^(?:insert|update|remove|fetch|transform)$/;
  Object.keys(options).forEach((key) => {
    if (!validKeysRegEx.test(key)) {
      throw new Error(`${allowOrDeny}: Invalid key: ${key}`);
    }
  });
  validationContext.restricted = true;


  (["insert", "update", "remove"] as const).forEach((name) => {
    if (Object.hasOwnProperty.call(options, name) && options[name]) {
      if (!(options[name] instanceof Function)) {
        throw new Error(`${allowOrDeny}: Value for \`${name}\` must be a function`);
      }

      if (options.transform === undefined) {
        options[name].transform = collection._transform; // already wrapped
      }
      else {
        options[name].transform = LocalCollection.wrapTransform(options.transform);
      }

      validationContext.validators[name][allowOrDeny].push(options[name]);
    }
  });
  if (options.update || options.remove || options.fetch) {
    if (options.fetch && !(options.fetch instanceof Array)) {
      throw new Error(`${allowOrDeny}: Value for \`fetch\` must be an array`);
    }
    updateFetch(collection, options.fetch);
  }
}
