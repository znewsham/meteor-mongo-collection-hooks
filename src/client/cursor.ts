import type { Filter, ObjectId } from "mongodb";
// @ts-expect-error
import { LocalCollection } from "meteor/minimongo";

import type { ObserveCallbacks, ObserveChangesCallbacks, ObserveOnlyOptions, ObserveOptions, Stringable } from "observe-mongo/es2015";
import { CompatibleMeteorFindCursor as CompatibleMeteorFindCursorCommon } from "../lib/cursor";
import { HookedFindCursorOptions } from "mongo-collection-hooks/es2015/hookedFindCursor.js";
export class CompatibleMeteorFindCursor<
  TSchema extends { _id?: Stringable },
  ObserveSchema extends { _id: Stringable } = TSchema extends { _id: Stringable } ? TSchema : { _id: Stringable }
> extends CompatibleMeteorFindCursorCommon<TSchema, ObserveSchema> {
  constructor(
    filter: Filter<TSchema> | undefined,
    cursor: any,
    options: HookedFindCursorOptions<TSchema>
  ) {
    super(filter, cursor, options);
  }

  observe(callbacks: ObserveCallbacks<ObserveSchema>, options?: ObserveOptions<ObserveSchema> & ObserveOnlyOptions) {
    if (options?.suppressInitial) {
      // @ts-expect-error
      callbacks._suppress_initial = true;
    }
    if (options?.noIndices) {
      // @ts-expect-error
      callbacks._no_indices = true;
    }
    return LocalCollection._observeFromObserveChanges(this, callbacks);
  }

  observeChanges(
    callbacks: ObserveChangesCallbacks<ObserveSchema["_id"], Omit<ObserveSchema, "_id">>,
    options?: ObserveOptions<ObserveSchema>
  ) {
    if (options?.suppressInitial) {
      // @ts-expect-error
      callbacks._suppress_initial = true;
    }
    return this._cursor.observeChanges(callbacks, options);
  }

  clone(): CompatibleMeteorFindCursor<TSchema, ObserveSchema> {
    return new CompatibleMeteorFindCursor<TSchema, ObserveSchema>(
      this._filter,
      this._cursor.clone(),
      this._originalOptions
    );
  }
}
