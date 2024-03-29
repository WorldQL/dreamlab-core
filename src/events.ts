import { EventEmitter } from 'eventemitter3'
import type Matter from 'matter-js'
import type { NetPlayer, Player } from '~/entities/player'
import type { Entity, RenderTime, Time } from '~/entity.js'
import type { Gear } from '~/managers/gear.js'
import type {
  SpawnableConstructor,
  SpawnableEntity,
} from '~/spawnable/spawnableEntity.js'

export interface ClientEvents {
  onRenderFrame: [time: RenderTime]

  onPlayerCollisionStart: PlayerCollisionEvent
  onPlayerCollisionActive: PlayerCollisionEvent
  onPlayerCollisionEnd: PlayerCollisionEvent
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ServerEvents {
  // TODO
}

type CollisionEvent = [
  pair: readonly [a: SpawnableEntity, b: SpawnableEntity],
  raw: Matter.Collision,
]

type PlayerCollisionEvent = [
  pair: readonly [player: Player, other: Matter.Body],
  raw: Matter.Collision,
]

export interface CommonEvents {
  onRegister: [name: string, fn: SpawnableConstructor]
  onInstantiate: [entity: Entity]
  onDestroy: [entity: Entity]
  onSpawn: [entity: SpawnableEntity]

  onTransformChanged: [entity: Entity, noBroadcast?: boolean]
  onArgsChanged: [
    entity: SpawnableEntity,
    path: string,
    value: unknown,
    noBroadcast?: boolean,
  ]
  onTagsChanged: [entity: SpawnableEntity, tags: string[]]
  onLabelChanged: [entity: SpawnableEntity, label: string | undefined]
  onDefinitionChanged: [entity: SpawnableEntity]

  onPhysicsStep: [time: Time]
  onCollisionStart: CollisionEvent
  onCollisionActive: CollisionEvent
  onCollisionEnd: CollisionEvent
  onTickSkipped: []
  onTickTooLong: [deltaMs: number]

  onPlayerJoin: [player: NetPlayer]
  onPlayerLeave: [player: NetPlayer]

  onPlayerAttack: [player: Player, gear: Gear | undefined]
}

export class ClientEventManager extends EventEmitter<ClientEvents> {}
export class ServerEventManager extends EventEmitter<ServerEvents> {}
export class CommonEventManager extends EventEmitter<CommonEvents> {}

export interface EventsManager<Server extends boolean> {
  client: Server extends false ? ClientEventManager : undefined
  server: Server extends true ? ServerEventManager : undefined
  common: CommonEventManager
}

type Events = ClientEvents & CommonEvents & ServerEvents
export type Event<E extends {} = Events> = keyof E

export type EventArgs<
  T extends Event<E>,
  E extends {} = Events,
> = T extends keyof E ? (E[T] extends unknown[] ? E[T] : never) : never

export type EventHandler<T extends Event<E>, E extends {} = Events> = (
  ...args: EventArgs<T, E>
) => void

export const createEventsManager = <Server extends boolean>(
  isServer: Server,
): EventsManager<Server> => {
  return {
    // @ts-expect-error Generic type coersion
    client: isServer === false ? new ClientEventManager() : undefined,

    // @ts-expect-error Generic type coersion
    server: isServer === true ? new ServerEventManager() : undefined,
    common: new CommonEventManager(),
  }
}
