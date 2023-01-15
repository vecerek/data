import * as Chunk from "@fp-ts/data/Chunk"
import type { Differ } from "@fp-ts/data/Differ"
import type * as CP from "@fp-ts/data/Differ/ChunkPatch"
import * as Equal from "@fp-ts/data/Equal"
import { pipe } from "@fp-ts/data/Function"
import * as Hash from "@fp-ts/data/Hash"

/** @internal */
export const ChunkPatchTypeId: CP.TypeId = Symbol.for("@fp-ts/data/Differ/ChunkPatch") as CP.TypeId

function variance<A, B>(a: A): B {
  return a as unknown as B
}

class Empty<Value, Patch> implements CP.ChunkPatch<Value, Patch> {
  readonly _tag = "Empty"
  readonly _Value: (_: Value) => Value = variance
  readonly _Patch: (_: Patch) => Patch = variance
  readonly _id: CP.TypeId = ChunkPatchTypeId;

  [Hash.symbol]() {
    return Hash.string(`ChunkPatch(Empty)`)
  }

  [Equal.symbol](that: unknown) {
    return typeof that === "object" && that !== null && "_id" in that && that["_id"] === this._id &&
      "_tag" in that && that["_tag"] === this._id
  }
}

class AndThen<Value, Patch> implements CP.ChunkPatch<Value, Patch> {
  readonly _tag = "AndThen"
  readonly _Value: (_: Value) => Value = variance
  readonly _Patch: (_: Patch) => Patch = variance
  readonly _id: CP.TypeId = ChunkPatchTypeId

  constructor(
    readonly first: CP.ChunkPatch<Value, Patch>,
    readonly second: CP.ChunkPatch<Value, Patch>
  ) {}

  [Hash.symbol]() {
    return Hash.string(`ChunkPatch(AndThen)`)
  }

  [Equal.symbol](that: unknown) {
    return typeof that === "object" && that !== null && "_id" in that && that["_id"] === this._id &&
      "_tag" in that && that["_tag"] === this._id &&
      Equal.equals(this.first, (that as this).first) &&
      Equal.equals(this.second, (that as this).second)
  }
}

class Append<Value, Patch> implements CP.ChunkPatch<Value, Patch> {
  readonly _tag = "Append"
  readonly _Value: (_: Value) => Value = variance
  readonly _Patch: (_: Patch) => Patch = variance
  readonly _id: CP.TypeId = ChunkPatchTypeId
  constructor(readonly values: Chunk.Chunk<Value>) {}

  [Hash.symbol]() {
    return Hash.string(`ChunkPatch(Append)`)
  }

  [Equal.symbol](that: unknown) {
    return typeof that === "object" && that !== null && "_id" in that && that["_id"] === this._id &&
      "_tag" in that && that["_tag"] === this._id &&
      Equal.equals(this.values, (that as this).values)
  }
}

class Slice<Value, Patch> implements CP.ChunkPatch<Value, Patch> {
  readonly _tag = "Slice"
  readonly _Value: (_: Value) => Value = variance
  readonly _Patch: (_: Patch) => Patch = variance
  readonly _id: CP.TypeId = ChunkPatchTypeId
  constructor(readonly from: number, readonly until: number) {}

  [Hash.symbol]() {
    return Hash.string(`ChunkPatch(Slice)`)
  }

  [Equal.symbol](that: unknown) {
    return typeof that === "object" && that !== null && "_id" in that && that["_id"] === this._id &&
      "_tag" in that && that["_tag"] === this._id &&
      Equal.equals(this.from, (that as this).from) &&
      Equal.equals(this.until, (that as this).until)
  }
}

class Update<Value, Patch> implements CP.ChunkPatch<Value, Patch> {
  readonly _tag = "Update"
  readonly _Value: (_: Value) => Value = variance
  readonly _Patch: (_: Patch) => Patch = variance
  readonly _id: CP.TypeId = ChunkPatchTypeId
  constructor(readonly index: number, readonly patch: Patch) {}

  [Hash.symbol]() {
    return Hash.string(`ChunkPatch(AndThen)`)
  }

  [Equal.symbol](that: unknown) {
    return typeof that === "object" && that !== null && "_id" in that && that["_id"] === this._id &&
      "_tag" in that && that["_tag"] === this._id &&
      Equal.equals(this.index, (that as this).index) &&
      Equal.equals(this.patch, (that as this).patch)
  }
}

type Instruction =
  | Empty<any, any>
  | AndThen<any, any>
  | Append<any, any>
  | Slice<any, any>
  | Update<any, any>

/** @internal */
export function empty<Value, Patch>(): CP.ChunkPatch<Value, Patch> {
  return new Empty()
}

/** @internal */
export function diff<Value, Patch>(
  oldValue: Chunk.Chunk<Value>,
  newValue: Chunk.Chunk<Value>,
  differ: Differ<Value, Patch>
): CP.ChunkPatch<Value, Patch> {
  let i = 0
  let patch = empty<Value, Patch>()
  while (i < oldValue.length && i < newValue.length) {
    const oldElement = Chunk.unsafeGet(i)(oldValue)
    const newElement = Chunk.unsafeGet(i)(newValue)
    const valuePatch = differ.diff(oldElement, newElement)
    if (!Equal.equals(valuePatch, differ.empty)) {
      patch = pipe(patch, combine(new Update(i, valuePatch)))
    }
    i = i + 1
  }
  if (i < oldValue.length) {
    patch = pipe(patch, combine(new Slice(0, i)))
  }
  if (i < newValue.length) {
    patch = pipe(patch, combine(new Append(Chunk.drop(i)(newValue))))
  }
  return patch
}

/** @internal */
export function combine<Value, Patch>(that: CP.ChunkPatch<Value, Patch>) {
  return (self: CP.ChunkPatch<Value, Patch>): CP.ChunkPatch<Value, Patch> => {
    return new AndThen(self, that)
  }
}

/** @internal */
export function patch<Value, Patch>(oldValue: Chunk.Chunk<Value>, differ: Differ<Value, Patch>) {
  return (self: CP.ChunkPatch<Value, Patch>): Chunk.Chunk<Value> => {
    let chunk = oldValue
    let patches: Chunk.Chunk<CP.ChunkPatch<Value, Patch>> = Chunk.of(self)
    while (Chunk.isNonEmpty(patches)) {
      const head: Instruction = Chunk.headNonEmpty(patches) as Instruction
      const tail = Chunk.tailNonEmpty(patches)
      switch (head._tag) {
        case "Empty": {
          patches = tail
          break
        }
        case "AndThen": {
          patches = Chunk.prepend(head.first)(Chunk.prepend(head.second)(tail))
          break
        }
        case "Append": {
          chunk = Chunk.concat(head.values)(chunk)
          patches = tail
          break
        }
        case "Slice": {
          const array = Chunk.toReadonlyArray(chunk)
          chunk = Chunk.unsafeFromArray(array.slice(head.from, head.until))
          patches = tail
          break
        }
        case "Update": {
          const array = Chunk.toReadonlyArray(chunk) as Array<Value>
          array[head.index] = differ.patch(head.patch, array[head.index]!)
          chunk = Chunk.unsafeFromArray(array)
          patches = tail
          break
        }
      }
    }
    return chunk
  }
}
