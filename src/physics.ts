import Matter from 'matter-js'
import type { Body, Engine, World } from 'matter-js'
import { isSpawnableEntity } from '~/spawnable/spawnableEntity.js'
import type {
  PartializeSpawnable,
  SpawnableEntity,
} from '~/spawnable/spawnableEntity.js'

export interface Physics {
  get engine(): Engine
  get world(): World

  getBodies(entity: SpawnableEntity): Body[]
  register<E extends SpawnableEntity<Data, Render>, Data, Render>(
    entity: E | PartializeSpawnable<E, Data, Render>,
    ...bodies: Body[]
  ): void
  unregister<E extends SpawnableEntity<Data, Render>, Data, Render>(
    entity: E | PartializeSpawnable<E, Data, Render>,
    ...bodies: Body[]
  ): void
}

export const createPhysics = (): Physics => {
  const engine = Matter.Engine.create()
  const entities = new Map<string, Set<Body>>()

  const physics: Physics = {
    get engine() {
      return engine
    },

    get world() {
      return engine.world
    },

    register(entity, ...bodies) {
      if (!isSpawnableEntity(entity)) {
        throw new TypeError('entity is not a spawnableentity')
      }

      const set = entities.get(entity.uid) ?? new Set()
      for (const body of bodies) {
        set.add(body)
      }

      entities.set(entity.uid, set)
      Matter.Composite.add(engine.world, bodies)
    },

    unregister(entity, ...bodies) {
      if (!isSpawnableEntity(entity)) {
        throw new TypeError('entity is not a spawnableentity')
      }

      const set = entities.get(entity.uid) ?? new Set()
      for (const body of bodies) {
        set.delete(body)
      }

      entities.set(entity.uid, set)
      Matter.Composite.remove(engine.world, bodies)
    },

    getBodies(entity) {
      if (!isSpawnableEntity(entity)) {
        throw new TypeError('entity is not a spawnableentity')
      }

      const set = entities.get(entity.uid) ?? new Set()
      return [...set.values()]
    },
  }

  return physics
}