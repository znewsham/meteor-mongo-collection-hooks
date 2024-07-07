import type { FindCursor } from "mongodb";

export class ClientCursor<TSchema = Document> implements Pick<FindCursor<TSchema>, "next" | "toArray" | "forEach" | "map" | "count"> {
  #meteorCursor;
  #mapTransform = (doc: TSchema) => doc;
  #i = 0;
  #iterator: Iterator<TSchema> | undefined;
  constructor(meteorCursor: any) {
    this.#meteorCursor = meteorCursor;
  }

  get options() {
    return {
      skip: this.#meteorCursor.skip,
      limit: this.#meteorCursor.limit,
      fields: this.#meteorCursor.fields || {}
    };
  }

  async next(): Promise<TSchema | null> {
    if (!this.#iterator) {
      this.#iterator = this.#meteorCursor[Symbol.iterator]() as Iterator<TSchema>;
    }

    const nextItem = this.#iterator.next();
    this.#i++;
    if (nextItem.done) {
      this.#iterator = undefined;
      this.#i = 0;
      return null;
    }
    return nextItem.value;
  }

  /**
   * @deprecated Use toArray instead and convert to promises. This is the way.
   */
  fetch(): TSchema[] {
    return this.#meteorCursor.fetch().slice(this.#i).map((doc: TSchema) => this.#mapTransform(doc));
  }

  toArray() {
    return Promise.resolve(this.#meteorCursor.fetch().slice(this.#i).map((doc: TSchema) => this.#mapTransform(doc)));
  }

  forEach(iterator: (doc: TSchema) => void) {
    return Promise.resolve(this.#meteorCursor.slice(this.#i).forEach(iterator));
  }

  #applyMapTransform = <T>(transform: (doc: TSchema) => T) => {
    const oldTransform = this.#mapTransform;

    // @ts-expect-error
    this.#mapTransform = (doc => transform(oldTransform(doc)));
  }

  map<T>(transform: (doc: TSchema) => T): FindCursor<T> {
    this.#applyMapTransform(transform);
    return this as unknown as FindCursor<T>;
  }

  count() {
    return Promise.resolve(this.#meteorCursor.count());
  }

  observe(...args: any[]) {
    return this.#meteorCursor.observe(...args);
  }

  observeChanges(...args: any[]) {
    return this.#meteorCursor.observeChanges(...args);
  }
}
