import { createId } from '@paralleldrive/cuid2'
import Matter from 'matter-js'
import { isEntity } from '~/entity'
import { physics } from '~/labs/magic'
import type { Bounds } from '~/math/bounds'
import type { LooseVector } from '~/math/vector'
import { v } from '~/math/vector'
import type { KnownAnimation } from './animations'
import { BasePlayer } from './base-player'

const symbol = Symbol.for('@dreamlab/core/entities/net-player')
export const isNetPlayer = (netplayer: unknown): netplayer is NetPlayer => {
  if (!isEntity(netplayer)) return false
  return symbol in netplayer && netplayer[symbol] === true
}

export class NetPlayer extends BasePlayer {
  public readonly [symbol] = true as const

  public readonly entityId: string
  public readonly nickname: string

  public constructor(
    public readonly connectionId: string,
    public readonly playerId: string,
    entityId: string | undefined,
    characterId: string | undefined,
    nickname: string | undefined,
    bounds?: Partial<Bounds>,
  ) {
    super(characterId, bounds)

    this.entityId = entityId ?? createId()
    this.nickname = nickname ?? 'Player'

    Matter.Composite.add(physics().world, this.body)
  }

  public override teardown(): void {
    super.teardown()
    Matter.Composite.remove(physics().world, this.body)
  }

  public setPosition(vector: LooseVector): void {
    Matter.Body.setPosition(this.body, v(vector))
  }

  public setVelocity(vector: LooseVector): void {
    Matter.Body.setVelocity(this.body, v(vector))
  }

  public setFlipped(flipped: boolean): void {
    this._facing = flipped ? 'right' : 'left'
  }

  public setAnimation(animation: KnownAnimation): void {
    this.currentAnimation = animation
  }
}
