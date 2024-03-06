import { getGlobalGame } from '~/_internal/global-state'
import type {
  ClientEventManager,
  CommonEventManager,
  EventsManager,
  ServerEventManager,
} from '~/events'
import type { Game } from '~/game'
import type { NetClient } from '~/network/client'
import type { NetServer } from '~/network/server'

// #region Magic Functions
export function game(): Game<boolean>
export function game(type: 'client', force: true): Game<false>
export function game(type: 'client', force?: false): Game<false> | undefined
export function game(type: 'server', force: true): Game<true>
export function game(type: 'server', force?: false): Game<true> | undefined
export function game(
  type?: 'client' | 'server',
  force?: boolean,
): Game<boolean> | undefined {
  const game = getGlobalGame()
  if (game === undefined || game === 'pending') {
    throw new Error('failed to get game')
  }

  if (type === undefined) return game
  if (type === 'client') {
    if (force === true) {
      if (!game.client) throw new Error('not in a client context')
      return game
    }

    return game.client ? game : undefined
  }

  if (type === 'server') {
    if (force === true) {
      if (!game.server) throw new Error('not in a server context')
      return game
    }

    return game.server ? game : undefined
  }

  throw new Error('invalid parameter: type')
}

export const isServer = (): boolean => {
  const $game = game()
  return $game.server !== undefined
}

export const isClient = (): boolean => {
  const $game = game()
  return $game.client !== undefined
}

export const debug = () => game().debug.value
export const physics = () => game().physics

export function events(): EventsManager<boolean>
export function events(type: 'common'): CommonEventManager
export function events(type: 'client'): ClientEventManager | undefined
export function events(type: 'server'): ServerEventManager | undefined
export function events(
  type?: 'client' | 'common' | 'server',
):
  | ClientEventManager
  | CommonEventManager
  | EventsManager<boolean>
  | ServerEventManager
  | undefined {
  const $game = game()

  if (!type) return $game.events
  if (type === 'common') return $game.events.common
  if (type === 'client') return $game.events?.client
  if (type === 'server') return $game.events?.server

  throw new Error('invalid parameter: type')
}

export const inputs = () => {
  const $game = game()
  return $game.client?.inputs
}

const magicClient =
  <T>(name: string, fn: (game: Game<false>) => T) =>
  () => {
    const $game = game('client')
    if (!$game) {
      throw new Error(`tried to access \`${name}()\` on the server`)
    }

    return fn($game)
  }

export const container = magicClient(
  'container',
  game => game.client.render.container,
)
export const canvas = magicClient('canvas', game => game.client.render.canvas)
export const stage = magicClient('stage', game => game.client.render.stage)
export const camera = magicClient('camera', game => game.client.render.camera)

export function network(type: 'client'): NetClient | undefined
export function network(type: 'server'): NetServer | undefined
export function network(
  type: 'client' | 'server',
): NetClient | NetServer | undefined {
  const $game = game()

  if (type === 'client') return $game.client?.network
  if (type === 'server') return $game.server?.network

  throw new Error('invalid parameter: type')
}
// #endregion

// #region Type-Safe Class Members
const onlyClient = Symbol.for('onlyClient')
type ClientOnly<T> = T | typeof onlyClient

function clientOnly<T>(factory: () => T): ClientOnly<T> {
  if (!isClient()) return onlyClient
  return factory()
}

export { clientOnly as unstable_clientOnly }
// #endregion
