import { Graphics } from 'pixi.js'
import type { Container, Sprite } from 'pixi.js'
import { z } from 'zod'
import type { Camera } from '~/entities/camera.js'
import { simpleBoundsTest } from '~/math/bounds.js'
import { Vec } from '~/math/vector.js'
import { createSpawnableEntity } from '~/spawnable/spawnableEntity.js'
import type { SpawnableEntity } from '~/spawnable/spawnableEntity.js'
import { createSprite, SpriteSourceSchema } from '~/textures/sprites.js'
import type { Debug } from '~/utils/debug.js'
import { drawBox } from '~/utils/draw.js'

type Args = typeof ArgsSchema
const ArgsSchema = z.object({
  width: z.number().positive().min(1),
  height: z.number().positive().min(1),
  spriteSource: SpriteSourceSchema.optional(),
  zIndex: z.number().default(0),
})

interface Data {
  debug: Debug
}

interface Render {
  camera: Camera
  stage: Container
  gfx: Graphics
  sprite: Sprite | undefined
}

export const createNonsolid = createSpawnableEntity<
  Args,
  SpawnableEntity<Data, Render, Args>,
  Data,
  Render
>(ArgsSchema, ({ transform, tags }, args) => ({
  get tags() {
    return tags
  },

  rectangleBounds() {
    return { width: args.width, height: args.height }
  },

  isPointInside(point) {
    return simpleBoundsTest(
      { width: args.width, height: args.height },
      transform,
      point,
    )
  },

  init({ game }) {
    return { debug: game.debug }
  },

  initRenderContext(_, { stage, camera }) {
    const { width, height, spriteSource, zIndex } = args

    const gfx = new Graphics()
    gfx.zIndex = zIndex + 1
    drawBox(gfx, { width, height }, { stroke: 'blue' })

    const sprite = spriteSource
      ? createSprite(spriteSource, { width, height, zIndex })
      : undefined

    stage.addChild(gfx)
    if (sprite) stage.addChild(sprite)

    return { camera, stage, gfx, sprite }
  },

  onArgsUpdate(path, _data, render) {
    const { width, height, spriteSource, zIndex } = args

    if (render && path === 'spriteSource') {
      render.sprite?.destroy()
      render.sprite = spriteSource
        ? createSprite(spriteSource, { width, height, zIndex })
        : undefined

      if (render.sprite) render.stage.addChild(render.sprite)
    }

    if (render && path === 'zIndex') {
      render.gfx.zIndex = zIndex + 1
      if (render.sprite) render.sprite.zIndex = zIndex
    }
  },

  onResize({ width, height }, _, render) {
    args.width = width
    args.height = height

    if (!render) return
    drawBox(render.gfx, { width, height }, { stroke: 'blue' })
    if (render.sprite) {
      render.sprite.width = width
      render.sprite.height = height
    }
  },

  teardown(_) {
    // No-op
  },

  teardownRenderContext({ gfx, sprite }) {
    gfx.destroy()
    sprite?.destroy()
  },

  onRenderFrame(_, { debug }, { camera, gfx, sprite }) {
    const pos = Vec.add(transform.position, camera.offset)

    gfx.position = pos
    gfx.angle = transform.rotation
    gfx.alpha = debug.value ? 0.5 : 0

    if (sprite) {
      sprite.position = pos
      sprite.angle = transform.rotation
    }
  },
}))
