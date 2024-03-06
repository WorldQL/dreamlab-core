import EventEmitter from 'eventemitter3'
import Matter from 'matter-js'
import type { CamelCase } from 'type-fest'
import type { RenderTime, Time } from '~/entity'
import { isEntity } from '~/entity'
import { events, inputs, physics } from '~/labs/magic'
import type { Gear } from '~/managers/gear'
import type { LooseVector, Vector } from '~/math/vector'
import { v, Vec } from '~/math/vector'
import type { KnownAnimation } from './animations'
import { isAttackAnimation } from './animations'
import { BasePlayer } from './base-player'

const symbol = Symbol.for('@dreamlab/core/entities/player')
export const isPlayer = (player: unknown): player is Player => {
  if (!isEntity(player)) return false
  return symbol in player && player[symbol] === true
}

export enum PlayerInput {
  Attack = '@player/attack',
  Crouch = '@player/crouch',
  Jog = '@player/jog',
  Jump = '@player/jump',
  ToggleNoclip = '@player/toggle-noclip',
  WalkLeft = '@player/walk-left',
  WalkRight = '@player/walk-right',
}

type Inputs = `${PlayerInput}` extends `@player/${infer T}` ? T : never
type InputMap = Record<CamelCase<Inputs>, boolean>

export interface PlayerEvents {
  onMove: [position: Vector, velocity: Vector, flipped: boolean]
  onInput: [inputs: InputMap]

  onCharacterIdChange: [characterId: string | undefined]
  onToggleNoclip: [enabled: boolean]
  onTeleport: [oldPosition: Vector, newPosition: Vector]
  onAnimationChanged: [animation: KnownAnimation]
  onGearChanged: [item: Gear | undefined]
}

export class Player extends BasePlayer {
  public readonly [symbol] = true as const

  public readonly events = new EventEmitter<PlayerEvents>()

  public constructor(...args: ConstructorParameters<typeof BasePlayer>) {
    super(...args)

    physics().registerPlayer(this)

    const $inputs = inputs()
    if ($inputs) {
      $inputs.registerInput(PlayerInput.WalkLeft, 'Walk Left', 'KeyA')
      $inputs.registerInput(PlayerInput.WalkRight, 'Walk Right', 'KeyD')
      $inputs.registerInput(PlayerInput.Jump, 'Jump', 'Space')
      $inputs.registerInput(PlayerInput.Crouch, 'Crouch', 'KeyS')
      $inputs.registerInput(PlayerInput.Jog, 'Jog', 'ShiftLeft')
      $inputs.registerInput(PlayerInput.Attack, 'Attack', 'MouseLeft')
      $inputs.registerInput(
        PlayerInput.ToggleNoclip,
        'Toggle Noclip',
        'Backquote',
      )

      $inputs.addListener(PlayerInput.ToggleNoclip, this.#onToggleNoclip)
    }
  }

  public override teardown(): void {
    super.teardown()
    physics().clearPlayer()

    inputs()?.removeListener(PlayerInput.ToggleNoclip, this.#onToggleNoclip)
    this.events.removeAllListeners()
  }

  public override get characterId(): string | undefined {
    return super.characterId
  }

  public override set characterId(value: string | undefined) {
    if (this.characterId === value) return

    super.characterId = value
    this.events.emit('onCharacterIdChange', value)
  }

  public override get gear(): Gear | undefined {
    return super.gear
  }

  public override set gear(value: Gear | undefined) {
    if (this.gear === value) return

    super.gear = value
    this.events.emit('onGearChanged', value)
  }

  public teleport(position: LooseVector, resetVelocity = true): void {
    const previousPosition = Vec.clone(this.body.position)
    Matter.Body.setPosition(this.body, v(position))

    if (resetVelocity) {
      Matter.Body.setVelocity(this.body, { x: 0, y: 0 })
    }

    this.events.emit('onTeleport', previousPosition, this.body.position)
  }

  readonly #onToggleNoclip = (pressed: boolean) => {
    if (!pressed) return

    this.#noclip = !this.#noclip
    this.events.emit('onToggleNoclip', this.#noclip)
  }

  private static readonly MAX_SPEED = 1
  private static readonly JUMP_FORCE = 5
  private static readonly FEET_SENSOR = 4

  private direction: -1 | 0 | 1 = 0

  #hasJumped = false
  #jumpTicks = 0
  #isJogging = false
  #noclip = false
  #attack = false
  #isAnimationLocked = false

  public override onPhysicsStep(_: Time): void {
    const {
      body,
      bounds: { width, height },
    } = this

    const $inputs = inputs()
    const left = $inputs?.getInput(PlayerInput.WalkLeft) ?? false
    const right = $inputs?.getInput(PlayerInput.WalkRight) ?? false
    const jump = $inputs?.getInput(PlayerInput.Jump) ?? false
    const attack = $inputs?.getInput(PlayerInput.Attack) ?? false
    const isJogging = $inputs?.getInput(PlayerInput.Jog) ?? false
    const crouch = $inputs?.getInput(PlayerInput.Crouch) ?? false

    this.direction = left ? -1 : right ? 1 : 0
    const xor = left ? !right : right

    if (this.direction !== 0) {
      this._facing = this.direction === -1 ? 'left' : 'right'
    }

    // TODO(Charlotte): factor out movement code into its own place,
    // so that we can apply it to NetPlayers for prediction (based on inputs)
    // on both the client and server
    body.isStatic = this.#noclip
    body.isSensor = this.#noclip
    if (!this.#noclip) {
      if (xor) {
        const targetVelocity = Player.MAX_SPEED * this.direction
        if (targetVelocity !== 0) {
          const velocityVector = targetVelocity / body.velocity.x
          const forcePercent = Math.min(Math.abs(velocityVector) / 2, 1)
          const newForce = (isJogging ? 2 : 0.5) * forcePercent * this.direction

          Matter.Body.applyForce(body, body.position, Vec.create(newForce, 0))
        }
      }

      if (Math.sign(body.velocity.x) !== this.direction) {
        Matter.Body.applyForce(
          body,
          body.position,
          Vec.create(-body.velocity.x / 20, 0),
        )
      }

      const minVelocity = 0.000_01
      if (Math.abs(body.velocity.x) <= minVelocity) {
        Matter.Body.setVelocity(body, Vec.create(0, body.velocity.y))
      }

      const feet = Matter.Bodies.rectangle(
        body.position.x,
        body.position.y + height / 2 + Player.FEET_SENSOR / 2,
        width - Player.FEET_SENSOR,
        Player.FEET_SENSOR,
      )

      const bodies = physics()
        .world.bodies.filter(other => other !== body)
        .filter(other => !other.isSensor)
        .filter(other =>
          Matter.Detector.canCollide(
            body.collisionFilter,
            other.collisionFilter,
          ),
        )

      let didCollide = false
      for (const collisionCandidate of bodies) {
        if (Matter.Collision.collides(collisionCandidate, feet)) {
          didCollide = true
          break
        }
      }

      const isColliding = didCollide

      if (isColliding && !jump) {
        this.#hasJumped = false
      }

      if (isColliding && jump && !this.#hasJumped) {
        this.#hasJumped = true
        this.#jumpTicks = 0
      }

      if (jump || this.#hasJumped) {
        this.#jumpTicks++
      }

      if (this.#hasJumped && !jump) {
        this.#jumpTicks = 999
      }

      if (this.#hasJumped) {
        if (this.#jumpTicks === 1) {
          Matter.Body.applyForce(
            body,
            body.position,
            Vec.create(0, -0.5 * Player.JUMP_FORCE),
          )
        } else if (this.#jumpTicks <= 8) {
          Matter.Body.applyForce(
            body,
            body.position,
            Vec.create(0, (-1 / 10) * Player.JUMP_FORCE),
          )
        }
      }

      this.#attack = attack
    }

    if (
      (this.currentAnimation === 'greatsword' && this._currentFrame >= 16) ||
      (this.currentAnimation === 'punch' && this._currentFrame >= 3) ||
      (this.currentAnimation === 'bow' &&
        (this._currentFrame === 8 || this._currentFrame === 9)) ||
      (this.currentAnimation === 'shoot' &&
        this._currentFrame > 0 &&
        this._currentFrame < 4)
    ) {
      events().common.emit('onPlayerAttack', this as Player, this.gear)
    }

    if (!this.#noclip) {
      // temporary fix for jittery noclipping netplayers in edit mode.
      // TODO: Send a proper packet that communicates a player is in edit mode.
      // We can even have it display an indicator to other player's that they're editing!

      this.events.emit(
        'onMove',
        body.position,
        body.velocity,
        this.facing !== 'left',
      )

      this.events.emit('onInput', {
        jump,
        crouch,
        walkLeft: left,
        walkRight: right,
        toggleNoclip: false,
        attack,
        jog: false,
      })
    }
  }

  private getAnimation(): KnownAnimation {
    if (this.#noclip) return 'idle'
    if (this.#hasJumped && !this.#attack) return 'jump'

    const animationName = this.gear
      ? this.gear.animationName.toLowerCase()
      : 'punch'
    if (
      this.#attack &&
      ['greatsword', 'bow', 'punch', 'shoot'].includes(animationName)
    )
      return animationName as KnownAnimation
    if (this.direction !== 0) return this.#isJogging ? 'jog' : 'walk'

    return 'idle'
  }

  public override onRenderFrame(time: RenderTime): void {
    if (!this.sprite || !this.animations) {
      super.onRenderFrame(time)
      return
    }

    const frames = this.animations[this.currentAnimation].textures.length - 1
    const isLastFrame = this.sprite.currentFrame === frames

    if (
      this.#isAnimationLocked &&
      (isLastFrame || !isAttackAnimation(this.currentAnimation))
    ) {
      this.#isAnimationLocked = false
    }

    const newAnimation = this.getAnimation()
    if (newAnimation !== this.currentAnimation && !this.#isAnimationLocked) {
      if (isAttackAnimation(this.currentAnimation)) {
        this.#isAnimationLocked = true
      }

      this.currentAnimation = newAnimation
      this.events.emit('onAnimationChanged', newAnimation)
    }

    super.onRenderFrame(time)
    if (this.container) this.container.alpha = this.#noclip ? 0 : 1
  }
}
