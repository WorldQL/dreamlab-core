import { createId } from '@paralleldrive/cuid2'
import Matter from 'matter-js'
import type { Body } from 'matter-js'
import { AnimatedSprite, Graphics, Sprite } from 'pixi.js'
import type { Camera } from '~/entities/camera.js'
import {
  PLAYER_ANIMATION_SPEED,
  PLAYER_MASS,
  PLAYER_SPRITE_ANCHOR,
  PLAYER_SPRITE_SCALE,
} from '~/entities/player.js'
import type {
  KnownAnimation,
  PlayerCommon,
  PlayerSize,
} from '~/entities/player.js'
import { createEntity, dataManager, isEntity } from '~/entity.js'
import type { Entity } from '~/entity.js'
import type { PlayerGear } from '~/managers/playerGear'
import { v, Vec } from '~/math/vector.js'
import type { LooseVector, Vector } from '~/math/vector.js'
import type { Physics } from '~/physics.js'
import { bones } from '~/textures/playerAnimations.js'
import type { Bone, PlayerAnimationMap } from '~/textures/playerAnimations.js'
import type { Debug } from '~/utils/debug.js'
import { drawBox } from '~/utils/draw.js'

interface Data {
  debug: Debug
  physics: Physics
  body: Body
}

interface Render {
  camera: Camera

  sprite: AnimatedSprite
  gfxBounds: Graphics

  itemSprite: Sprite
}

const symbol = Symbol.for('@dreamlab/core/entities/netplayer')
export const isNetPlayer = (netplayer: unknown): netplayer is NetPlayer => {
  if (!isEntity(netplayer)) return false
  return symbol in netplayer && netplayer[symbol] === true
}

export interface NetPlayer extends PlayerCommon, Entity<Data, Render> {
  get [symbol](): true

  get peerID(): string
  get entityID(): string

  get body(): Body
  get itemInHand(): PlayerGear
  get currentAnimation(): string
  get facingDirection(): number

  setItemInHand(item: PlayerGear): void
  setPosition(vector: LooseVector): void
  setVelocity(vector: LooseVector): void
  setFlipped(flipped: boolean): void
  setAnimation(animation: KnownAnimation): void
}

export const createNetPlayer = (
  peerID: string,
  entityID: string | undefined,
  animations: PlayerAnimationMap<KnownAnimation> | undefined,
  { width = 80, height = 370 }: Partial<PlayerSize> = {},
) => {
  const _entityID = entityID ?? createId()

  let isFlipped = false
  let currentAnimation: KnownAnimation = 'idle'
  let playerItem: PlayerGear
  let animationChanged = false
  let currentFrame = 0
  let spriteSign = 1

  const body = Matter.Bodies.rectangle(0, 0, width, height, {
    label: 'player',
    render: { visible: false },

    inertia: Number.POSITIVE_INFINITY,
    inverseInertia: 0,
    mass: PLAYER_MASS,
    inverseMass: 1 / PLAYER_MASS,
    friction: 0,
  })

  const bonePosition = (bone: Bone): Vector => {
    if (!animations) {
      throw new Error(`missing animations for netplayer: ${_entityID}`)
    }

    const animation = animations[currentAnimation]

    const animW = animation.width
    const animH = animation.height
    const position = animation.boneData.bones[bone][currentFrame]!

    const flip = spriteSign
    const normalized = {
      x: flip === 1 ? position.x : animW - position.x,
      y: position.y,
    }

    const offsetFromCenter: Vector = {
      x: (1 - (normalized.x / animW) * 2) * (animW / -2),
      y: (1 - (normalized.y / animH) * 2) * (animH / -2),
    }

    const offsetFromAnchor = Vec.add(offsetFromCenter, {
      x: flip * ((1 - PLAYER_SPRITE_ANCHOR[0] * 2) * (animW / 2)),
      y: (1 - PLAYER_SPRITE_ANCHOR[1] * 2) * (animH / 2),
    })

    const scaled = Vec.mult(offsetFromAnchor, PLAYER_SPRITE_SCALE)
    return Vec.add(body.position, scaled)
  }

  const boneMap = {} as Readonly<Record<Bone, Vector>>
  for (const bone of bones) {
    Object.defineProperty(boneMap, bone, {
      get: () => bonePosition(bone),
    })
  }

  Object.freeze(boneMap)

  const netPlayer: NetPlayer = createEntity<NetPlayer, Data, Render>({
    get [symbol]() {
      return true as const
    },

    get peerID(): string {
      return peerID
    },

    get entityID(): string {
      return _entityID
    },

    get position(): Vector {
      const { body } = dataManager.getData(this)
      return Vec.clone(body.position)
    },

    get size() {
      return { width, height }
    },

    get itemInHand() {
      return playerItem
    },

    get currentAnimation() {
      return currentAnimation
    },

    get facingDirection() {
      return -spriteSign
    },

    setItemInHand(item: PlayerGear) {
      playerItem = item
    },

    setPosition(vector: LooseVector) {
      const { body } = dataManager.getData(this)
      Matter.Body.setPosition(body, v(vector))
    },

    setVelocity(vector: LooseVector) {
      const { body } = dataManager.getData(this)
      Matter.Body.setVelocity(body, v(vector))
    },

    setFlipped(flipped) {
      isFlipped = flipped
    },

    setAnimation(animation) {
      currentAnimation = animation
      animationChanged = true
    },

    get body(): Body {
      const { body } = dataManager.getData(this)
      return body
    },

    init({ game, physics }) {
      const debug = game.debug

      Matter.Composite.add(physics.world, body)

      return { debug, physics, body }
    },

    initRenderContext(_, { stage, camera }) {
      if (!animations) {
        throw new Error(`missing animations for netplayer: ${_entityID}`)
      }

      const sprite = new AnimatedSprite(animations[currentAnimation].textures)
      sprite.animationSpeed = PLAYER_ANIMATION_SPEED
      sprite.scale.set(PLAYER_SPRITE_SCALE)
      sprite.anchor.set(...PLAYER_SPRITE_ANCHOR)
      sprite.play()

      const item = playerItem
      const itemSprite = item ? new Sprite(item.texture) : new Sprite()
      itemSprite.width = 200
      itemSprite.height = 200

      const gfxBounds = new Graphics()
      drawBox(gfxBounds, { width, height }, { stroke: '#00f' })

      const zIndex = 5
      sprite.zIndex = zIndex
      gfxBounds.zIndex = zIndex + 1

      stage.addChild(sprite)
      stage.addChild(gfxBounds)
      stage.addChild(itemSprite)

      return { camera, sprite, gfxBounds, itemSprite }
    },

    teardown({ physics, body }) {
      Matter.Composite.remove(physics.world, body)
    },

    teardownRenderContext({ sprite, gfxBounds }) {
      sprite.destroy()
      gfxBounds.destroy()
    },

    onRenderFrame(
      { smooth },
      { debug, body },
      { camera, sprite, gfxBounds, itemSprite },
    ) {
      if (!animations) {
        throw new Error(`missing animations for netplayer: ${_entityID}`)
      }

      const scale = isFlipped ? -1 : 1
      const newScale = scale * PLAYER_SPRITE_SCALE
      if (sprite.scale.x !== newScale) {
        sprite.scale.x = newScale
        spriteSign = Math.sign(sprite.scale.x)
      }

      if (animationChanged) {
        animationChanged = false
        sprite.textures = animations[currentAnimation].textures
        const getSpeedMultiplier = (animation_name: string) => {
          if (playerItem?.speedMultiplier) {
            return playerItem.speedMultiplier
          }

          switch (animation_name) {
            case 'greatsword':
              return 2.2
            case 'punch':
              return 2
            default:
              return 1
          }
        }

        sprite.animationSpeed =
          PLAYER_ANIMATION_SPEED * getSpeedMultiplier(currentAnimation)
        sprite.loop = currentAnimation !== 'jump'

        sprite.gotoAndPlay(0)
      }

      currentFrame = sprite.currentFrame
      const smoothed = Vec.add(body.position, Vec.mult(body.velocity, smooth))
      const pos = Vec.add(smoothed, camera.offset)

      sprite.position = pos
      gfxBounds.position = pos
      gfxBounds.alpha = debug.value ? 0.5 : 0

      if (playerItem) {
        itemSprite.visible = Boolean(
          currentAnimation === 'greatsword' ||
            currentAnimation === 'bow' ||
            currentAnimation === 'shoot',
        )

        const currentItem = playerItem
        if (itemSprite.texture !== currentItem.texture) {
          itemSprite.texture = currentItem.texture
        }

        const handMapping: Record<string, 'handLeft' | 'handRight'> = {
          left: 'handLeft',
          right: 'handRight',
        }

        const currentHandKey = currentItem.bone ?? 'left'
        const mappedHand = handMapping[currentHandKey]

        const pos = Vec.add(
          {
            x: boneMap[mappedHand as 'handLeft' | 'handRight'].x,
            y: boneMap[mappedHand as 'handLeft' | 'handRight'].y,
          },
          camera.offset,
        )

        itemSprite.position = pos

        const animation = animations[currentAnimation]
        const handOffsets =
          animation.boneData.handOffsets[
            mappedHand as 'handLeft' | 'handRight'
          ][currentFrame]

        let handRotation = Math.atan2(
          handOffsets!.y.y - handOffsets!.x.y,
          handOffsets!.y.x - handOffsets!.x.x,
        )
        let itemRotation = currentItem.rotation * (Math.PI / 180)

        itemRotation *= scale === -1 ? -1 : 1
        handRotation *= scale === -1 ? -1 : 1
        itemSprite.rotation = handRotation + itemRotation

        const initialDimensions = {
          width: itemSprite.width,
          height: itemSprite.height,
        }
        itemSprite.scale.x = -scale
        Object.assign(itemSprite, initialDimensions)

        itemSprite.anchor.set(currentItem.anchorX, currentItem.anchorY)
      } else {
        itemSprite.visible = false
      }
    },
  })

  return netPlayer
}
