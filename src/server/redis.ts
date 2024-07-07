import { BulkWriteError } from "mongo-collection-hooks/es2015";

import { Vent } from "meteor/cultofcoders:redis-oplog";
import RedisSubscriptionManager from "meteor/cultofcoders:redis-oplog/lib/redis/RedisSubscriptionManager";
import OptimisticInvocation from "meteor/cultofcoders:redis-oplog/lib/mongo/OptimisticInvocation";
// @ts-expect-error
import { DDPServer } from "meteor/ddp-server";
import { MeteorHookedCollection } from "../lib/collection";

import { getSubManager } from "./subManager";


import {
  RedisOptions,
  Events,
  RedisPipe,
} from "observe-mongo/es2015/redis";
import { getChannels } from "observe-mongo/es2015/redis";
import type { Stringable } from "observe-mongo/es2015";

export { getChannels };

export async function handleRemove(defaultChannel: string, _ids: string[], options: RedisOptions) {
  if (options?.pushToRedis !== false) {
    await Promise.all(_ids.map(async (_id) => {
      const channels = getChannels(defaultChannel, options, [_id]);
      const optimistic = options?.optimistic !== false;
      await Promise.all(channels.map(async (channel) => {
        const event = {
          [RedisPipe.EVENT]: Events.REMOVE,
          [RedisPipe.DOC]: { _id },
          [RedisPipe.UID]: RedisSubscriptionManager.uid
        };
        Vent.emit(channel, event);
        if (optimistic) {
          if (getSubManager()) {
            await getSubManager().process(channel, event, { optimistic });
          }
          OptimisticInvocation.withValue(true, () => RedisSubscriptionManager.process(channel, event, false));
        }
      }));
    }));
  }
}

export async function handleUpdate(defaultChannel: string, _ids: string[], fields: string[], options: RedisOptions) {
  if (options?.pushToRedis !== false) {
    await Promise.all(_ids.map(async (_id) => {
      const channels = getChannels(defaultChannel, options, [_id]);
      const optimistic = options?.optimistic !== false;
      await Promise.all(channels.map(async (channel) => {
        const event = {
          [RedisPipe.EVENT]: Events.UPDATE,
          [RedisPipe.DOC]: { _id },
          [RedisPipe.FIELDS]: fields,
          [RedisPipe.UID]: RedisSubscriptionManager.uid
        };
        Vent.emit(channel, event);
        if (optimistic) {
          if (getSubManager()) {
            const result = await (getSubManager().process(channel, event, { optimistic }));
          }
          OptimisticInvocation.withValue(true, () => RedisSubscriptionManager.process(channel, event, false));
        }
      }));
    }));
  }
}

export async function handleInserts(defaultChannel: string, insertedIds: string[], options: RedisOptions) {
  if (options?.pushToRedis !== false) {
    const channels = getChannels(defaultChannel, options);
    const optimistic = options?.optimistic !== false;
    await Promise.all(insertedIds.map(async (id) => {
      await Promise.all(channels.map(async (channel) => {
        const event = {
          [RedisPipe.EVENT]: Events.INSERT,
          [RedisPipe.DOC]: { _id: id },
          [RedisPipe.UID]: RedisSubscriptionManager.uid
        };
        Vent.emit(channel, event);
        if (optimistic) {
          if (getSubManager()) {
            await getSubManager().process(channel, event, { optimistic });
          }
          OptimisticInvocation.withValue(true, () => RedisSubscriptionManager.process(channel, event, false));
        }
      }));
    }));
  }
}


export function applyRedis<TSchema extends Document & { _id: Stringable }>(collection: MeteorHookedCollection<TSchema>) {
  const defaultChannel = collection.collectionName;
  collection.on("after.insertOne", async ({
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
    await handleInserts(defaultChannel, insertedIds as unknown as string[], options as RedisOptions);
  }, { tags: ["redis"] });

  collection.on("after.insertMany", async ({
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
    await handleInserts(defaultChannel, insertedIds as unknown as string[], options as RedisOptions);
  }, { tags: ["redis"] });

  collection.on("after.deleteOne", async ({
    args: [, options],
    _id
  }) => {
    await handleRemove(defaultChannel, [_id as unknown as string], options as RedisOptions);
  }, { tags: ["redis"], includeId: true });

  collection.on("after.deleteMany", async ({
    args: [, options],
    _ids
  }) => {
    // TODO: what about partial deletion?
    await handleRemove(defaultChannel, _ids as unknown as string[], options as RedisOptions);
  }, { tags: ["redis"], includeIds: true });

  collection.on("after.updateOne", async ({
    args: [, mutator, options],
    _id,
  }) => {
    const fields = Array.from(new Set(Object.values(mutator).flatMap($mutator => Object.keys($mutator))));
    // TODO: what about partial deletion?
    await handleUpdate(defaultChannel, [_id as unknown as string], fields, options as RedisOptions || {});
  }, { tags: ["redis"], includeId: true });

  collection.on("after.updateMany", async ({
    args: [, mutator, options],
    _ids
  }) => {
    const fields = Array.from(new Set(Object.values(mutator).flatMap($mutator => Object.keys($mutator))));
    // TODO: what about partial deletion?
    await handleUpdate(defaultChannel, _ids as unknown as string[], fields, options as RedisOptions || {});
  }, { tags: ["redis"], includeIds: true });
}
