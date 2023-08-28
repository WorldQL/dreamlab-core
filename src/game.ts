import cuid2 from '@paralleldrive/cuid2'
import Matter from 'matter-js'
import { Application } from 'pixi.js'
import type { IApplicationOptions } from 'pixi.js'
import { createCamera } from '~/entities/camera.js'
import { registerDefaultSpawnables } from '~/entities/spawnable/index.js'
import { dataManager, isEntity } from '~/entity.js'
import type { Entity, InitContext, RenderContext } from '~/entity.js'
import { InputManager } from '~/input/manager.js'
import { v } from '~/math/vector.js'
import type { LooseVector } from '~/math/vector.js'
import type { BareNetClient, NetClient } from '~/network/client'
import type { BareNetServer, NetServer } from '~/network/server'
import { createPhysics } from '~/physics.js'
import type { Physics } from '~/physics.js'
import { SpawnableDefinitionSchema } from '~/spawnable/definition.js'
import type {
  LooseSpawnableDefinition,
  SpawnableContext,
} from '~/spawnable/definition.js'
import { isSpawnableEntity } from '~/spawnable/spawnableEntity.js'
import type {
  BareSpawnableFunction,
  SpawnableEntity,
  SpawnableFunction,
  UID,
} from '~/spawnable/spawnableEntity.js'
import type { Debug } from '~/utils/debug.js'
import { createDebug } from '~/utils/debug.js'

interface ClientOptions {
  /**
   * HTML `div` element for the Pixi.js canvas to mount inside
   */
  container: HTMLDivElement

  /**
   * Desired canvas dimensions
   */
  dimensions: { width: number; height: number }

  /**
   * Additional options to pass to Pixi.js
   */
  graphicsOptions?: Partial<IApplicationOptions>
}

interface ServerOptions {
  container?: never
  dimensions?: never
  graphicsOptions?: never
}

interface CommonOptions<Server extends boolean> {
  /**
   * Run the game in server mode, disabling any rendering logic
   */
  isServer: Server

  /**
   * Physics Tickrate in Hz [default: 60]
   */
  physicsTickrate?: number

  /**
   * Debug mode
   */
  debug?: boolean
}

type Options<Server extends boolean> = CommonOptions<Server> &
  (Server extends true ? ServerOptions : ClientOptions)

type RenderContextExt = RenderContext & { app: Application }
async function initRenderContext<Server extends boolean>(
  options: Options<Server>,
): Promise<Server extends false ? RenderContextExt : undefined>
async function initRenderContext<Server extends boolean>(
  options: Options<Server>,
): Promise<RenderContextExt | undefined> {
  if (options.isServer === true) return undefined
  const { container, dimensions, graphicsOptions } = options as Options<false>

  const app = new Application({
    ...graphicsOptions,

    resizeTo: container,
    autoDensity: true,
  })

  app.stage.sortableChildren = true
  const canvas = app.view as HTMLCanvasElement

  const camera = createCamera(dimensions.width, dimensions.height)
  const ctx: RenderContextExt = {
    app,
    stage: app.stage,
    canvas,
    container,
    camera,
  }

  return ctx
}

type TickListener = (delta: number) => Promise<void> | void

interface GameClient {
  get inputs(): InputManager
  get render(): RenderContextExt
  get network(): NetClient | undefined
}

interface GameServer {
  get network(): NetServer | undefined
}

export interface Game<Server extends boolean> {
  get debug(): Debug
  get physics(): Physics

  get client(): Server extends true ? undefined : GameClient
  get server(): Server extends true ? GameServer : undefined

  /**
   * List of all entities
   */
  get entities(): Entity[]

  /**
   * Initialize the network interface
   */
  initNetwork(
    network: Server extends true ? BareNetServer : BareNetClient,
  ): void

  /**
   * Register a spawnable function with this game instance
   *
   * @param name - Entity name
   * @param spawnableFn - Spawnable Function
   */
  register<
    Args extends unknown[],
    E extends SpawnableEntity<Data, Render>,
    Data,
    Render,
  >(
    name: string,
    spawnableFn: SpawnableFunction<Args, E, Data, Render>,
  ): void

  /**
   * Instantiate an entity
   *
   * @param entity - Entity
   */
  instantiate<Data, Render, E extends Entity<Data, Render>>(
    entity: E,
  ): Promise<void>

  /**
   * Destroy an entity
   *
   * @param entity - Entity
   */
  destroy<Data, Render, E extends Entity<Data, Render>>(
    entity: E,
  ): Promise<void>

  /**
   * Spawn a new entity
   *
   * @param definition - Entity Definition
   * @param preview - Spawn in Preview mode
   */
  spawn(
    definition: LooseSpawnableDefinition,
    preview?: boolean,
  ): Promise<SpawnableEntity | undefined>

  /**
   * Spawn multiple entities in one go
   *
   * @param definitions - Entity Definitions
   */
  spawnMany(
    ...definitions: LooseSpawnableDefinition[]
  ): Promise<SpawnableEntity[]>

  /**
   * Lookup a spawnable entity by UID
   *
   * @param uid - Entity UID
   */
  lookup(uid: UID): SpawnableEntity | undefined

  /**
   * Query spawnable entities at a single point
   *
   * @param position - Position to query
   */
  queryPosition(position: LooseVector): SpawnableEntity[]

  /**
   * Query spawnable entities by tag
   *
   * @param query - Type of Query
   * @param fn - Tags predicate
   * @param tags - List of tags to check
   */
  queryTags(query: 'fn', fn: (tags: string[]) => boolean): SpawnableEntity[]
  queryTags(query: 'all' | 'any', tags: string[]): SpawnableEntity[]

  /**
   * Query a single spawnable entity with a type predicate
   *
   * @param fn - Type predicate
   */
  queryType<T extends SpawnableEntity = SpawnableEntity>(
    fn: (arg: SpawnableEntity) => arg is T,
  ): T | undefined

  /**
   * Query multiple spawnable entities with a type predicate
   *
   * @param fn - Type predicate
   */
  queryTypeAll<T extends SpawnableEntity = SpawnableEntity>(
    fn: (arg: SpawnableEntity) => arg is T,
  ): T[]

  /**
   * Add a listener function for physics ticks
   *
   * @param listener - Listener Function
   */
  addTickListener(listener: TickListener): void

  /**
   * Remove a tick listener
   *
   * @param listener - Listener Function
   */
  removeTickListener(listener: TickListener): void

  /**
   * Destroy all entities and stop all game logic
   */
  shutdown(): Promise<void>
}

export async function createGame<Server extends boolean>(
  options: Options<Server>,
): Promise<Game<Server>> {
  const debug = createDebug(options.debug ?? false)
  const { physicsTickrate = 60 } = options

  const physics = createPhysics()
  physics.engine.gravity.scale *= 3

  const renderContext = await initRenderContext(options)
  const entities: Entity[] = []
  const spawnables = new Map<string, SpawnableEntity>()

  const inputs = new InputManager()
  const unregister = renderContext ? inputs.registerListeners() : undefined

  const spawnableFunctions = new Map<string, BareSpawnableFunction>()
  const tickListeners: Set<TickListener> = new Set()

  const physicsTickDelta = 1_000 / physicsTickrate
  let time = performance.now()
  let physicsTickAcc = 0

  let network: (Server extends true ? NetServer : NetClient) | undefined

  const onTick = async () => {
    const now = performance.now()
    const delta = now - time

    time = now
    physicsTickAcc += delta

    while (physicsTickAcc >= physicsTickDelta) {
      physicsTickAcc -= physicsTickDelta
      Matter.Engine.update(physics.engine, physicsTickDelta)

      for (const tickListener of tickListeners) {
        void tickListener(physicsTickDelta)
      }

      const timeState = { delta: physicsTickDelta / 1_000, time: time / 1_000 }
      for (const entity of entities) {
        if (typeof entity.onPhysicsStep !== 'function') continue

        const data = dataManager.getData(entity)
        entity.onPhysicsStep(timeState, data)
      }
    }

    if (renderContext) {
      const timeState = { delta: delta / 1_000, time: time / 1_000 }
      for (const entity of entities) {
        if (typeof entity.onRenderFrame !== 'function') continue

        const data = dataManager.getData(entity)
        const render = dataManager.getRenderData(entity)

        entity.onRenderFrame(timeState, data, render)
      }
    }
  }

  let interval: NodeJS.Timer | undefined
  if (renderContext) {
    const { app } = renderContext

    app.ticker.add(onTick)
    app.start()
  } else {
    interval = setInterval(onTick, 1_000 / physicsTickrate / 2)
  }

  const sortEntities = () => {
    entities.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  }

  const clientData: GameClient | undefined = options.isServer
    ? undefined
    : {
        inputs,
        network: network as NetClient | undefined,
        render: renderContext as RenderContextExt,
      }

  const serverData: GameServer | undefined = !options.isServer
    ? undefined
    : {
        network: network as NetServer | undefined,
      }

  const game: Game<Server> = {
    get debug() {
      return debug
    },

    get physics() {
      return physics
    },

    get client() {
      if (options.isServer || clientData === undefined) {
        return undefined as Server extends true ? undefined : GameClient
      }

      return clientData as Server extends true ? undefined : GameClient
    },

    get server() {
      if (!options.isServer || serverData === undefined) {
        return undefined as Server extends true ? GameServer : undefined
      }

      return serverData as Server extends true ? GameServer : undefined
    },

    get entities() {
      return [...entities, ...spawnables.values()]
    },

    initNetwork(net) {
      const type = options.isServer ? 'server' : 'client'
      network = { type, ...net } as Server extends true ? NetServer : NetClient
    },

    register(name, spawnableFn) {
      if (spawnableFunctions.has(name)) {
        throw new Error(`duplicate spawnable function: ${name}`)
      }

      spawnableFunctions.set(
        name,
        spawnableFn as unknown as BareSpawnableFunction,
      )
    },

    async instantiate(entity) {
      if (!isEntity(entity)) {
        throw new Error('not an entity')
      }

      const init: InitContext = {
        game: this,
        physics,
      }

      const data = await entity.init(init)
      dataManager.setData(entity, data)

      if (renderContext) {
        const { app: _, ...ctx } = renderContext

        const render = await entity.initRenderContext(init, ctx)
        dataManager.setRenderData(entity, render)
      }

      entities.push(entity)
      sortEntities()
    },

    async destroy(entity) {
      if (!isEntity(entity)) {
        throw new Error('not an entity')
      }

      if (isSpawnableEntity(entity)) spawnables.delete(entity.uid)
      const idx = entities.indexOf(entity)

      if (idx === -1) return
      entities.splice(idx, 1)
      sortEntities()

      if (renderContext) {
        const render = dataManager.getRenderData(entity)
        await entity.teardownRenderContext(render)
      }

      const data = dataManager.getData(entity)
      await entity.teardown(data)
    },

    async spawn(loose, preview = false) {
      const definition = SpawnableDefinitionSchema.parse(loose)
      const fn = spawnableFunctions.get(definition.entity)

      if (fn === undefined) {
        console.warn(`unknown spawnable function: ${definition.entity}`)
        return undefined
      }

      const context: SpawnableContext = {
        uid: definition.uid ?? cuid2.createId(),
        transform: definition.transform,
        tags: definition.tags ?? [],
        zIndex: definition.zIndex ?? 0,

        preview,
        definition,
      }

      const entity = fn(context, ...definition.args)
      await this.instantiate(entity)
      spawnables.set(entity.uid, entity)

      return entity
    },

    async spawnMany(...definitions) {
      const jobs = definitions.map(async def => this.spawn(def, false))
      const entities = await Promise.all(jobs)

      return entities.filter(
        (entity): entity is SpawnableEntity => entity !== undefined,
      )
    },

    lookup(uid) {
      return spawnables.get(uid)
    },

    queryPosition(position) {
      const pos = v(position)
      return [...spawnables.values()].filter(
        entity => !entity.preview && entity.isInBounds(pos),
      )
    },

    queryTags(query, fnOrTags) {
      if (query === 'fn') {
        if (typeof fnOrTags !== 'function') {
          throw new TypeError('`fn` must be a function')
        }

        return [...spawnables.values()].filter(entity => fnOrTags(entity.tags))
      }

      if (!Array.isArray(fnOrTags)) {
        throw new TypeError('`tags` must be an array')
      }

      const isStringArray = fnOrTags.every(x => typeof x === 'string')
      if (!isStringArray) {
        throw new TypeError('`tags` must be an array of strings')
      }

      return [...spawnables.values()].filter(entity => {
        if (query === 'all') {
          return fnOrTags.every(tag => entity.tags.includes(tag))
        }

        if (query === 'any') {
          return fnOrTags.some(tag => entity.tags.includes(tag))
        }

        return false
      })
    },

    queryType(fn) {
      // eslint-disable-next-line unicorn/no-array-callback-reference
      return [...spawnables.values()].find(fn)
    },

    queryTypeAll(fn) {
      // eslint-disable-next-line unicorn/no-array-callback-reference
      return [...spawnables.values()].filter(fn)
    },

    addTickListener(listener) {
      tickListeners.add(listener)
    },

    removeTickListener(listener) {
      tickListeners.delete(listener)
    },

    async shutdown() {
      unregister?.()

      const jobs = entities.map(async entity => this.destroy(entity))
      await Promise.all(jobs)

      Matter.Composite.clear(physics.world, false, true)
      Matter.Engine.clear(physics.engine)

      if (renderContext) {
        const { app } = renderContext

        app.stop()
        app.destroy()
      }

      if (interval) clearInterval(interval)
    },
  }

  registerDefaultSpawnables(game)
  if (renderContext) await game.instantiate(renderContext.camera)

  return game
}
