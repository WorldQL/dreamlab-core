import Matter from 'matter-js'
import { AnimatedSprite, Container, Sprite } from 'pixi.js'
import { z } from 'zod'
import type { RenderTime, Time } from '~/entity'
import {
  camera,
  debug,
  inputs,
  isClient,
  isServer,
  physics,
  stage,
} from '~/labs/magic'
import type { Gear } from '~/managers/gear'
import type { Bounds } from '~/math/bounds'
import { Vec } from '~/math/vector'
import type { Vector } from '~/math/vector'
import type { SyncedValue } from '~/network/sync'
import { syncedValue } from '~/network/sync'
import type {
  PreviousArgs,
  SpawnableContext,
} from '~/spawnable/spawnableEntity'
import { SpawnableEntity } from '~/spawnable/spawnableEntity'
import type { Bone, PlayerAnimationMap } from '~/textures/playerAnimations'
import { bones, loadCharacterAnimations } from '~/textures/playerAnimations'
import { drawBox } from '~/utils/draw'
import type { BoxGraphics } from '~/utils/draw'
import { PlayerInput } from '../player'
import { getSpeedMultiplier, isAttackAnimation } from '../player/animations'
import type { KnownAnimation } from '../player/animations'

type Args = typeof ArgsSchema
const ArgsSchema = z.object({
  local: z.string(),
  characterId: z.string().optional(),
})

export { ArgsSchema as PlatformerPlayerArgs }
export class PlatformerPlayer extends SpawnableEntity<Args> {
  protected static readonly WIDTH = 80
  protected static readonly HEIGHT = 370

  protected static readonly MASS = 50
  protected static readonly SPRITE_SCALE = 0.9
  protected static readonly ANIMATION_SPEED = 0.4
  protected static readonly SPRITE_ANCHOR = [0.45, 0.535] as const
  protected readonly stroke: string = 'blue'

  private get local(): boolean {
    return this.args.local === this.uid
  }

  public readonly body: Matter.Body
  public readonly bones: Readonly<Record<Bone, Vector>>
  protected _currentFrame = 0
  protected _facing: SyncedValue<'left' | 'right'> = syncedValue(
    this.uid,
    'facing',
    'left',
  )

  public get facing(): 'left' | 'right' {
    return this._facing.value
  }

  protected _characterId: string | undefined
  public get characterId(): string | undefined {
    return this._characterId
  }

  public set characterId(value: string | undefined) {
    if (this.args.characterId !== value) this.args.characterId = value
    if (this._characterId === value) return

    this._characterId = value
    void this._loadAnimations()
  }

  protected animations: PlayerAnimationMap<KnownAnimation> | undefined
  private _currentAnimation: SyncedValue<KnownAnimation> = syncedValue(
    this.uid,
    'currentAnimation',
    'idle',
  )

  public get currentAnimation(): KnownAnimation {
    return this._currentAnimation.value
  }

  protected set currentAnimation(value: KnownAnimation) {
    if (this._currentAnimation.value === value) return
    this._currentAnimation.value = value

    if (!this.sprite || !this.animations) return

    this.sprite.textures = this.animations[value].textures
    this.sprite.animationSpeed =
      PlatformerPlayer.ANIMATION_SPEED * getSpeedMultiplier(value, this.gear)

    this.sprite.loop = value !== 'jump'
    this.sprite.gotoAndPlay(0)
  }

  protected _gear: Gear | undefined
  public get gear(): Gear | undefined {
    return this._gear
  }

  public set gear(value: Gear | undefined) {
    this._gear = value
    if (this.gearSprite && value) this.gearSprite.texture = value.texture
  }

  protected container: Container | undefined
  protected gfx: BoxGraphics | undefined
  protected sprite: AnimatedSprite | undefined
  protected gearSprite: Sprite | undefined

  readonly #bonePosition = (bone: Bone): Vector => {
    if (!this.animations) {
      throw new Error('player has no animations')
    }

    const animation = this.animations[this.currentAnimation]
    const animW = animation.width
    const animH = animation.height
    const position = animation.boneData.bones[bone][this._currentFrame]

    if (!position) {
      throw new Error(
        `missing bone data for "${this.currentAnimation}" at frame ${this._currentFrame}`,
      )
    }

    const flip = this.sprite ? Math.sign(this.sprite.scale.x) : 1
    const normalized = {
      x: flip === 1 ? position.x : animW - position.x,
      y: position.y,
    }

    const offsetFromCenter: Vector = {
      x: (1 - (normalized.x / animW) * 2) * (animW / -2),
      y: (1 - (normalized.y / animH) * 2) * (animH / -2),
    }

    const offsetFromAnchor = Vec.add(offsetFromCenter, {
      x: flip * ((1 - PlatformerPlayer.SPRITE_ANCHOR[0] * 2) * (animW / 2)),
      y: (1 - PlatformerPlayer.SPRITE_ANCHOR[1] * 2) * (animH / 2),
    })

    const scaled = Vec.mult(offsetFromAnchor, PlatformerPlayer.SPRITE_SCALE)
    return Vec.add(this.body.position, scaled)
  }

  public constructor(ctx: SpawnableContext<Args>) {
    super(ctx)

    const width = PlatformerPlayer.WIDTH
    const height = PlatformerPlayer.HEIGHT

    this.body = Matter.Bodies.rectangle(0, 0, width, height, {
      label: 'player',
      render: { visible: false },

      inertia: Number.POSITIVE_INFINITY,
      inverseInertia: 0,
      mass: PlatformerPlayer.MASS,
      inverseMass: 1 / PlatformerPlayer.MASS,
      friction: 0,

      collisionFilter: {
        category: 0x002,
      },
    })

    physics().register(this, this.body)
    physics().linkTransform(this.body, this.transform)

    if (isClient()) {
      this.container = new Container()
      this.container.sortableChildren = true
      this.container.zIndex = 10

      this.gfx = drawBox({ width, height }, { stroke: this.stroke })
      this.container.addChild(this.gfx)

      this.gearSprite = new Sprite(this.gear?.texture)
      this.gearSprite.width = 200
      this.gearSprite.height = 200

      stage().addChild(this.gearSprite)
      stage().addChild(this.container)
    }

    this.characterId = this.args.characterId
    void this._loadAnimations()

    const boneMap = {} as Readonly<Record<Bone, Vector>>
    for (const bone of bones) {
      Object.defineProperty(boneMap, bone, {
        get: () => this.#bonePosition(bone),
      })
    }

    this.bones = Object.freeze(boneMap)

    if (isClient()) {
      const $inputs = inputs()

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

      // $inputs.addListener(PlayerInput.ToggleNoclip, this.#onToggleNoclip)
    }
  }

  public override teardown(): void {
    this.container?.destroy({ children: true })
  }

  public override bounds(): Bounds {
    return { width: PlatformerPlayer.WIDTH, height: PlatformerPlayer.HEIGHT }
  }

  public override isPointInside(_: Vector): boolean {
    return false
  }

  public override onArgsUpdate(
    path: string,
    _previousArgs: PreviousArgs<Args>,
  ): void {
    if (path === 'characterId') this.characterId = this.args.characterId
  }

  private async _loadAnimations(): Promise<void> {
    // Only load animations on the client
    if (!isClient() || !this.container) return

    this.animations = await loadCharacterAnimations(this._characterId)
    const textures = this.animations[this._currentAnimation.value].textures

    if (this.sprite) this.sprite.textures = textures
    else {
      this.sprite = new AnimatedSprite(textures)
      this.sprite.zIndex = 10
      this.sprite.animationSpeed = PlatformerPlayer.ANIMATION_SPEED
      this.sprite.scale.set(PlatformerPlayer.SPRITE_SCALE)
      this.sprite.anchor.set(...PlatformerPlayer.SPRITE_ANCHOR)
      this.sprite.play()

      this.container.addChild(this.sprite)
    }
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
    if (isServer()) return
    if (!this.local) return

    const { body } = this
    const { width, height } = this.bounds()

    const $inputs = inputs()
    const left = $inputs?.getInput(PlayerInput.WalkLeft) ?? false
    const right = $inputs?.getInput(PlayerInput.WalkRight) ?? false
    const jump = $inputs?.getInput(PlayerInput.Jump) ?? false
    const attack = $inputs?.getInput(PlayerInput.Attack) ?? false
    const isJogging = $inputs?.getInput(PlayerInput.Jog) ?? false
    // const crouch = $inputs?.getInput(PlayerInput.Crouch) ?? false

    this.direction = left ? -1 : right ? 1 : 0
    const xor = left ? !right : right

    if (this.direction !== 0) {
      this._facing.value = this.direction === -1 ? 'left' : 'right'
    }

    // TODO(Charlotte): factor out movement code into its own place,
    // so that we can apply it to NetPlayers for prediction (based on inputs)
    // on both the client and server
    body.isStatic = this.#noclip
    body.isSensor = this.#noclip
    if (!this.#noclip) {
      if (xor) {
        const targetVelocity = PlatformerPlayer.MAX_SPEED * this.direction
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
        body.position.y + height / 2 + PlatformerPlayer.FEET_SENSOR / 2,
        width - PlatformerPlayer.FEET_SENSOR,
        PlatformerPlayer.FEET_SENSOR,
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
            Vec.create(0, -0.5 * PlatformerPlayer.JUMP_FORCE),
          )
        } else if (this.#jumpTicks <= 8) {
          Matter.Body.applyForce(
            body,
            body.position,
            Vec.create(0, (-1 / 10) * PlatformerPlayer.JUMP_FORCE),
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
      // events().common.emit('onPlayerAttack', this as Player, this.gear)
    }

    if (!this.#noclip) {
      // temporary fix for jittery noclipping netplayers in edit mode.
      // TODO: Send a proper packet that communicates a player is in edit mode.
      // We can even have it display an indicator to other player's that they're editing!
      // this.events.emit(
      //   'onMove',
      //   body.position,
      //   body.velocity,
      //   this.facing !== 'left',
      // )
      // this.events.emit('onInput', {
      //   jump,
      //   crouch,
      //   walkLeft: left,
      //   walkRight: right,
      //   toggleNoclip: false,
      //   attack,
      //   jog: false,
      // })
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

  public override onRenderFrame({ smooth }: RenderTime): void {
    if (!this.container) return
    if (!this.sprite) return
    if (!this.gfx) return
    if (!this.gearSprite) return

    if (this.animations && this.local) {
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
        // this.events.emit('onAnimationChanged', newAnimation)
      }
    }

    this._currentFrame = this.sprite.currentFrame

    const scale = this._facing.value === 'left' ? 1 : -1
    const newScale = scale * PlatformerPlayer.SPRITE_SCALE
    if (this.sprite.scale.x !== newScale) {
      this.sprite.scale.x = newScale
    }

    const smoothed = Vec.add(
      this.body.position,
      Vec.mult(this.body.velocity, smooth),
    )

    const pos = Vec.add(smoothed, camera().offset)
    this.container.position = pos
    this.gfx.alpha = debug() ? 0.5 : 0

    // TODO: Feet sensor

    if (this.gear && this.animations) {
      this.gearSprite.visible =
        isAttackAnimation(this.currentAnimation) &&
        this.currentAnimation !== 'punch'

      const handMapping: Record<string, 'handLeft' | 'handRight'> = {
        handLeft: 'handLeft',
        handRight: 'handRight',
      }

      const currentGear = this.gear
      const currentHandKey = currentGear.bone ?? 'handLeft'
      const mappedHand = handMapping[currentHandKey]

      const pos = Vec.add(
        {
          x: this.bones[mappedHand as 'handLeft' | 'handRight'].x,
          y: this.bones[mappedHand as 'handLeft' | 'handRight'].y,
        },
        camera().offset,
      )

      this.gearSprite.position = pos

      const animation = this.animations[this.currentAnimation]
      const handOffsets =
        animation.boneData.handOffsets[mappedHand as 'handLeft' | 'handRight'][
          this._currentFrame
        ]

      let handRotation = Math.atan2(
        handOffsets!.y.y - handOffsets!.x.y,
        handOffsets!.y.x - handOffsets!.x.x,
      )
      let itemRotation = -currentGear.rotation * (Math.PI / 180)

      itemRotation *= scale === -1 ? -1 : 1
      handRotation *= scale === -1 ? -1 : 1
      this.gearSprite.rotation = handRotation + itemRotation

      const initialDimensions = {
        width: this.gearSprite.width,
        height: this.gearSprite.height,
      }

      this.gearSprite.scale.x = -scale
      Object.assign(this.gearSprite, initialDimensions)

      this.gearSprite.anchor.set(currentGear.anchor.x, currentGear.anchor.y)
    } else {
      this.gearSprite.visible = false
    }
  }
}
