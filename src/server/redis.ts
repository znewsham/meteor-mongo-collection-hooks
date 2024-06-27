import { BulkWriteError } from "mongo-collection-hooks";
// @ts-expect-error
import { Vent, Events, RedisPipe } from "meteor/cultofcoders:redis-oplog";
// @ts-expect-error
import RedisSubscriptionManager from "meteor/cultofcoders:redis-oplog/lib/redis/RedisSubscriptionManager";
// @ts-expect-error
import OptimisticInvocation from "meteor/cultofcoders:redis-oplog/lib/mongo/OptimisticInvocation";
// @ts-expect-error
import { DDPServer } from "meteor/ddp-server";
import { MeteorHookedCollection } from "../lib/collection";

type RedisOptions = {
  channel?: string,
  channels?: string[],
  namespace?: string,
  namespaces?: string[],
  optimistic?: boolean,
  pushToRedis?: boolean
}

export function getChannels(defaultChannel: string, options: RedisOptions = {}, docIds?: string[]) {
  const channels: string[] = [];
  if (options.channel) {
    channels.push(options.channel);
  }
  if (options.channels) {
    channels.push(...options.channels);
  }

  if (options.namespace) {
    channels.push(`${options.namespace}::${defaultChannel}`);
  }
  if (options.namespaces) {
    channels.push(...options.namespaces.map(namespace => `${namespace}::${defaultChannel}`));
  }
  if (channels.length === 0) {
    channels.push(defaultChannel);
    if (docIds) {
      docIds.forEach(docId => channels.push(`${defaultChannel}::${docId}`));
    }
  }
  return channels;
}

export function handleRemove(defaultChannel: string, _ids: string[], options: RedisOptions) {
  _ids.forEach((_id) => {
    const channels = getChannels(defaultChannel, options, [_id]);
    const optimistic = options?.optimistic !== false;
    channels.forEach((channel) => {
      const event = {
        [RedisPipe.EVENT]: Events.REMOVE,
        [RedisPipe.DOC]: { _id },
        [RedisPipe.UID]: optimistic ? null : RedisSubscriptionManager.uid
      };
      Vent.emit(channel, event);
      if (optimistic) {
        OptimisticInvocation.withValue(true, () => RedisSubscriptionManager.process(channel, event, false));
      }
    });
  });
}

export function handleUpdate(defaultChannel: string, _ids: string[], fields: string[], options: RedisOptions) {
  _ids.forEach((_id) => {
    const channels = getChannels(defaultChannel, options, [_id]);
    const optimistic = options?.optimistic !== false;
    channels.forEach((channel) => {
      const event = {
        [RedisPipe.EVENT]: Events.UPDATE,
        [RedisPipe.DOC]: { _id },
        [RedisPipe.FIELDS]: fields,
        [RedisPipe.UID]: optimistic ? null : RedisSubscriptionManager.uid
      };
      Vent.emit(channel, event);
      if (optimistic) {
        OptimisticInvocation.withValue(true, () => RedisSubscriptionManager.process(channel, event, false));
      }
    });
  });
}

export function handleInserts(defaultChannel: string, insertedIds: string[], options: RedisOptions) {
  if (options?.pushToRedis !== false) {
    const fence = DDPServer._CurrentWriteFence.get();
    if (fence) {

    }
    const channels = getChannels(defaultChannel, options);
    const optimistic = options?.optimistic !== false;
    insertedIds.forEach((id) => {
      channels.forEach((channel) => {
        const event = {
          [RedisPipe.EVENT]: Events.INSERT,
          [RedisPipe.DOC]: { _id: id },
          [RedisPipe.UID]: optimistic ? null : RedisSubscriptionManager.uid
        };
        Vent.emit(channel, event);
        if (optimistic) {
          OptimisticInvocation.withValue(true, () => RedisSubscriptionManager.process(channel, event, false));
        }
      });
    });
  }
}


export function applyRedis<TSchema extends Document>(collection: MeteorHookedCollection<TSchema>) {
  const defaultChannel = collection.collectionName;
  collection.on("after.insertOne", ({
    args: [, options],
    resultOrig,
    error
  }) => {
    let insertedIds = resultOrig?.insertedId ? [resultOrig.insertedId] : [];
    if (error instanceof BulkWriteError) {
      insertedIds = Object.values(error.insertedIds);
    }
    else if (error) {
      return;
    }
    handleInserts(defaultChannel, insertedIds as unknown as string[], options as RedisOptions);
  }, { tags: ["redis"] });

  collection.on("after.insertMany", ({
    args: [, options],
    resultOrig,
    error
  }) => {
    let insertedIds = Object.values(resultOrig?.insertedIds || {});
    if (error instanceof BulkWriteError) {
      insertedIds = Object.values(error.insertedIds);
    }
    else if (error) {
      return;
    }
    handleInserts(defaultChannel, insertedIds as unknown as string[], options as RedisOptions);
  }, { tags: ["redis"] });

  collection.on("after.deleteOne", ({
    args: [, options],
    _id
  }) => {
    handleRemove(defaultChannel, [_id as unknown as string], options as RedisOptions);
  }, { tags: ["redis"], includeId: true });

  collection.on("after.deleteMany", ({
    args: [, options],
    _ids
  }) => {
    // TODO: what about partial deletion?
    handleRemove(defaultChannel, _ids as unknown as string[], options as RedisOptions);
  }, { tags: ["redis"], includeIds: true });

  collection.on("after.updateOne", ({
    args: [, mutator, options],
    _id,
  }) => {
    const fields = Array.from(new Set(Object.values(mutator).flatMap($mutator => Object.keys($mutator))));
    // TODO: what about partial deletion?
    handleUpdate(defaultChannel, [_id as unknown as string], fields, options as RedisOptions || {});
  }, { tags: ["redis"], includeId: true });

  collection.on("after.updateMany", ({
    args: [, mutator, options],
    _ids
  }) => {
    const fields = Array.from(new Set(Object.values(mutator).flatMap($mutator => Object.keys($mutator))));
    // TODO: what about partial deletion?
    handleUpdate(defaultChannel, _ids as unknown as string[], fields, options as RedisOptions || {});
  }, { tags: ["redis"], includeIds: true });
}
