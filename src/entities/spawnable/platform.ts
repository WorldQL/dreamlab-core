import Matter from 'matter-js'
import { isNetPlayer, isPlayer } from '~/entities/player'
import type { RenderTime, Time } from '~/entity'
import { game } from '~/labs/magic'
import type { SpawnableContext } from '~/spawnable/spawnableEntity'
import { Solid, SolidArgs } from './solid'

type Args = typeof ArgsSchema
const ArgsSchema = SolidArgs.extend({})

export { ArgsSchema as PlatformArgs }
export class Platform<A extends Args = Args> extends Solid<A> {
  private isPlatformActive = false

  public constructor(ctx: SpawnableContext<A>) {
    super(ctx)
    this.body.friction = 0
    this.body.label = 'platform'
  }

  public override onPhysicsStep(_: Time): void {
    const $game = game('client')
    if (!$game) {
      return
    }

    Matter.Body.setAngle(this.body, 0)
    Matter.Body.setAngularVelocity(this.body, 0)

    // TODO: Can we avoid looking this up every tick?
    const player = $game.entities.find(isPlayer)
    if (!player) return

    const playerBody = player.body
    const playerHeight = player.bounds.height
    const playerWidth = player.bounds.width

    const platformHeight = this.body.bounds.max.y - this.body.bounds.min.y

    let platformShouldCollideWithNetPlayers = false

    const netPlayers = $game.entities.filter(isNetPlayer)
    for (const netPlayer of netPlayers) {
      const netPlayerWithinXBoundsOfPlatform =
        netPlayer.position.x + playerWidth > this.body.bounds.min.x &&
        netPlayer.position.x - playerWidth < this.body.bounds.max.x

      const netPlayerAbovePlatform =
        netPlayer.position.y + playerHeight / 2 <
        this.body.position.y - platformHeight / 2 + 1 // when resting on a platform we're technically not on top of it, 1 unit fixes this.

      const netPlayerYDistance = netPlayer.position.y - this.body.position.y
      if (
        netPlayerAbovePlatform &&
        netPlayerYDistance > -350 &&
        netPlayerWithinXBoundsOfPlatform
      ) {
        platformShouldCollideWithNetPlayers = true
        break
      }
    }

    const inputs = $game.client?.inputs
    const isCrouching = inputs?.getInput('@player/crouch') ?? false

    const playerAbovePlatform =
      playerBody.position.y + playerHeight / 2 <
      this.body.position.y - platformHeight / 2 + 1 // when resting on a platform we're technically not on top of it, 1 unit fixes this.

    if (this.isPlatformActive) {
      if (isCrouching) {
        this.isPlatformActive = false
      }

      if (!playerAbovePlatform) {
        this.isPlatformActive = false
      }
    } else if (!isCrouching) {
      const playerMovingDownward = playerBody.velocity.y > 0

      this.isPlatformActive = playerAbovePlatform && playerMovingDownward
    }

    // by default, don't collide with netplayers on active platforms
    let activePlatformMask = 0b11111111111111111111111111111011
    let inactivePlatformMask = 0
    if (platformShouldCollideWithNetPlayers) {
      activePlatformMask = 0b11111111111111111111111111111111
      inactivePlatformMask = 0b100
    }

    this.body.collisionFilter.mask = this.isPlatformActive
      ? 0b11111111111111111111111111111111 & activePlatformMask
      : 0b11111111111111111111111111111001 | inactivePlatformMask
  }

  public override onRenderFrame(time: RenderTime) {
    super.onRenderFrame(time)

    const platformAlpha = this.isPlatformActive ? 1 : 0.5
    this.gfx!.alpha = game().debug.value ? platformAlpha : 0
  }
}
