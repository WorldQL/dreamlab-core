import equal from 'fast-deep-equal/es6/index.js'
import type { Jsonifiable } from 'type-fest'
import type { Game } from '~/game.js'
import { network } from '~/labs/magic'
import { isSpawnableEntity } from '~/spawnable/spawnableEntity.js'
import type { SpawnableEntity } from '~/spawnable/spawnableEntity.js'
import { onChange } from '~/utils/object.js'

export const symbol = Symbol.for('@dreamlab/core/syncedValue')
export const setter = Symbol.for('@dreamlab/core/syncedValue/setter')

export interface SyncedValue<T> {
  readonly [symbol]: true
  readonly entityID: string
  readonly key: string

  get value(): T
  set value(v: T)

  /**
   * **Interal Dreamlab use only.**
   * **Not to be used in userscripts.**
   */
  sync(): void
  [setter](value: T): void

  /**
   * **Interal Dreamlab use only.**
   * **Not to be used in userscripts.**
   */
  destroy(): void
}

/**
 * Created a synced value that will be managed by Dreamlab
 *
 * Changes to the value on the server will be replicated to all clients.
 *
 * @param entityID - Entity Unique ID
 * @param key - Unique ID for this synced value
 * @param initialValue - Initial value, must be a JSON compatible type for syncing round trips
 */
export const syncedValue = <T extends Jsonifiable>(
  entityID: string,
  key: string,
  initialValue: T,
): SyncedValue<T> => {
  let destroyed = false
  const sync = (value: T) => {
    if (destroyed) {
      throw new Error('attempt to sync a destroyed synced value')
    }

    void network('client')?.updateSyncedValue(entityID, key, value)
    void network('server')?.broadcastSyncedValue(entityID, key, value)
  }

  function onChanged(this: T): void {
    sync(this)
  }

  let value: T =
    initialValue !== null && typeof initialValue === 'object'
      ? onChange(initialValue, onChanged)
      : initialValue

  const synced: SyncedValue<T> = {
    [symbol]: true,

    get entityID() {
      return entityID
    },

    get key() {
      return key
    },

    get value() {
      if (destroyed) {
        throw new Error('attempt to get a destroyed synced value')
      }

      return value
    },

    set value(newValue) {
      if (destroyed) {
        throw new Error('attempt to set a destroyed synced value')
      }

      const changed = !equal(value, newValue)
      value =
        newValue !== null && typeof newValue === 'object'
          ? onChange(newValue, onChanged)
          : newValue

      if (changed) sync(value)
    },

    sync() {
      sync(value)
    },

    [setter](val) {
      value = val
    },

    destroy() {
      if (destroyed) return
      destroyed = true

      if (value !== null && typeof value === 'object') {
        onChange.unsubscribe(value)
      }
    },
  }

  return synced
}

export const isSyncedValue = (
  value: unknown,
): value is SyncedValue<unknown> => {
  if (value === undefined || value === null) return false
  if (typeof value !== 'object') return false

  return symbol in value && value[symbol] === true
}

/**
 * **Interal Dreamlab use only.**
 * **Not to be used in userscripts.**
 *
 * Send sync packets for a spawnable entity with synced values
 *
 * @param entity - Spawnable Entity
 */
export const syncEntity = (entity: SpawnableEntity): void => {
  for (const value of Object.values(entity)) {
    if (isSyncedValue(value)) value.sync()
  }
}

/**
 * **Interal Dreamlab use only.**
 * **Not to be used in userscripts.**
 *
 * Send sync packets for all spawnable entities with synced values
 *
 * @param game - Server Side Game
 */
export const syncEntities = (game: Game<boolean>): void => {
  const spawnables = game.entities.filter(isSpawnableEntity)
  for (const entity of spawnables) syncEntity(entity)
}

/**
 * **Interal Dreamlab use only.**
 * **Not to be used in userscripts.**
 *
 * Update a synced value from an incoming server packet
 *
 * @param game - Client Side Game
 * @param entityID - Entity Unique ID
 * @param key - Synced Value Key
 * @param value - Value
 */
export const updateSyncedValue = (
  game: Game<boolean>,
  entityID: string,
  key: string,
  value: unknown,
) => {
  const spawnables = game.entities.filter(isSpawnableEntity)
  const entity = spawnables.find(({ uid }) => uid === entityID)
  if (!entity) return

  const syncedValue = Object.values(entity)
    .filter(isSyncedValue)
    .find(value => value.key === key)

  if (!syncedValue) return
  syncedValue[setter](value)
}
