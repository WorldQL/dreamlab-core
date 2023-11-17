import EventEmitter from 'eventemitter3'
import type Matter from 'matter-js'
import type { NetPlayer } from '~/entities/netplayer'
import type { Player } from '~/entities/player.js'
import type { Entity, RenderTime, Time } from '~/entity.js'
import type { PlayerGear } from '~/managers/playerGear.js'
import type {
  BareSpawnableFunction,
  SpawnableEntity,
} from '~/spawnable/spawnableEntity.js'

export interface ClientEvents {
  onRenderFrame: [time: RenderTime]
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
  onRegister: [name: string, fn: BareSpawnableFunction]
  onInstantiate: [entity: Entity]
  onDestroy: [entity: Entity]
  onSpawn: [entity: SpawnableEntity]

  onPhysicsStep: [time: Time]
  onCollisionStart: CollisionEvent
  onCollisionActive: CollisionEvent
  onCollisionEnd: CollisionEvent

  onPlayerCollisionStart: PlayerCollisionEvent
  onPlayerCollisionActive: PlayerCollisionEvent
  onPlayerCollisionEnd: PlayerCollisionEvent

  onPlayerJoin: [player: NetPlayer]
  onPlayerLeave: [player: NetPlayer]

  onPlayerAttack: [player: Player, gear: PlayerGear]
}

class ClientEventManager extends EventEmitter<ClientEvents> {}
class ServerEventManager extends EventEmitter<ServerEvents> {}
class CommonEventManager extends EventEmitter<CommonEvents> {}

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
