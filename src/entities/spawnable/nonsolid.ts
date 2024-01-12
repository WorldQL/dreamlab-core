import { Container, Graphics } from 'pixi.js'
import type { Sprite } from 'pixi.js'
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
  width: z.number().positive().min(1).default(100),
  height: z.number().positive().min(1).default(100),
  spriteSource: SpriteSourceSchema.optional(),
})

interface Data {
  debug: Debug
}

interface Render {
  camera: Camera
  container: Container
  gfx: Graphics
  sprite: Sprite | undefined
}

export const createNonsolid = createSpawnableEntity<
  Args,
  SpawnableEntity<Data, Render, Args>,
  Data,
  Render
>(ArgsSchema, ({ transform }, args) => ({
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
    const { width, height, spriteSource } = args

    const container = new Container()
    container.sortableChildren = true
    container.zIndex = transform.zIndex

    const gfx = new Graphics()
    gfx.zIndex = 100
    drawBox(gfx, { width, height }, { stroke: 'blue' })

    const sprite = spriteSource
      ? createSprite(spriteSource, { width, height })
      : undefined

    container.addChild(gfx)
    if (sprite) container.addChild(sprite)
    stage.addChild(container)

    transform.addZIndexListener(() => {
      container.zIndex = transform.zIndex
    })

    return { camera, container, gfx, sprite }
  },

  onArgsUpdate(path, _previous, _data, render) {
    if (render && path.startsWith('spriteSource')) {
      const { width, height, spriteSource } = args

      render.sprite?.destroy()
      render.sprite = spriteSource
        ? createSprite(spriteSource, { width, height })
        : undefined

      if (render.sprite) render.container.addChild(render.sprite)
    }

    if (render && (path === 'width' || path === 'height')) {
      const { width, height } = args
      drawBox(render.gfx, { width, height }, { stroke: 'blue' })
      if (render.sprite) {
        render.sprite.width = width
        render.sprite.height = height
      }
    }
  },

  onResize({ width, height }) {
    args.width = width
    args.height = height
  },

  teardown(_) {
    // No-op
  },

  teardownRenderContext({ gfx, sprite }) {
    gfx.destroy()
    sprite?.destroy()
  },

  onRenderFrame(_, { debug }, { camera, container, gfx }) {
    const pos = Vec.add(transform.position, camera.offset)

    container.position = pos
    container.angle = transform.rotation
    gfx.alpha = debug.value ? 0.5 : 0
  },
}))
