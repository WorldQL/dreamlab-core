import * as particles from '@pixi/particle-emitter'
import type { Vector } from 'matter-js'
import type { Sprite } from 'pixi.js'
import { Container, ParticleContainer, Texture } from 'pixi.js'
import { z } from 'zod'
import type { RenderTime } from '~/entity'
import { camera, debug, game, stage } from '~/labs/magic'
import { simpleBoundsTest } from '~/math/bounds'
import type { Bounds } from '~/math/bounds'
import { Vec } from '~/math/vector'
import { updateSpriteSource, updateSpriteWidthHeight } from '~/spawnable/args'
import type {
  ArgsPath,
  PreviousArgs,
  SpawnableContext,
} from '~/spawnable/spawnableEntity'
import { SpawnableEntity } from '~/spawnable/spawnableEntity'
import { createSprite, SpriteSourceSchema } from '~/textures/sprites'
import type { BoxGraphics } from '~/utils/draw'
import { drawBox } from '~/utils/draw'

type Args = typeof ArgsSchema
const ArgsSchema = z.object({
  width: z.number().positive().min(1).default(100),
  height: z.number().positive().min(1).default(100),
  spriteSource: SpriteSourceSchema.optional(),
})

export { ArgsSchema as NonSolidArgs }
export class NonSolid<A extends Args = Args> extends SpawnableEntity<A> {
  protected readonly container: Container | undefined
  protected readonly particleContainer: ParticleContainer | undefined
  private readonly emitter: particles.Emitter | undefined
  protected readonly gfx: BoxGraphics | undefined
  protected sprite: Sprite | undefined

  public constructor(
    ctx: SpawnableContext<A>,
    { stroke = 'blue' }: { stroke?: string } = {},
  ) {
    super(ctx)

    const $game = game('client')
    if ($game) {
      const { width, height, spriteSource } = this.args

      this.container = new Container()
      this.particleContainer = new ParticleContainer()
      this.container.sortableChildren = true
      this.container.zIndex = this.transform.zIndex

      this.gfx = drawBox({ width, height }, { stroke })
      this.gfx.zIndex = 100

      this.sprite = spriteSource
        ? createSprite(spriteSource, { width, height })
        : undefined

      this.container.addChild(this.gfx)
      if (this.sprite) this.container.addChild(this.sprite)
      stage().addChild(this.container)
      stage().addChild(this.particleContainer)
      this.emitter = new particles.Emitter(
        // The PIXI.Container to put the emitter in
        // if using blend modes, it's important to put this
        // on top of a bitmap, and not use the root stage Container
        this.particleContainer,
        // Emitter configuration, edit this to change the look
        // of the emitter
        {
          lifetime: {
            min: 0.5,
            max: 0.5,
          },
          frequency: 0.008,
          spawnChance: 1,
          particlesPerWave: 1,
          emitterLifetime: 10,
          maxParticles: 200,
          pos: {
            x: 0,
            y: 0,
          },
          addAtBack: false,
          behaviors: [
            {
              type: 'alpha',
              config: {
                alpha: {
                  list: [
                    {
                      value: 0.8,
                      time: 0,
                    },
                    {
                      value: 0.1,
                      time: 1,
                    },
                  ],
                },
              },
            },
            {
              type: 'scale',
              config: {
                scale: {
                  list: [
                    {
                      value: 0.5,
                      time: 0,
                    },
                    {
                      value: 0.1,
                      time: 1,
                    },
                  ],
                },
              },
            },
            {
              type: 'color',
              config: {
                color: {
                  list: [
                    {
                      value: '008c38',
                      time: 0,
                    },
                    {
                      value: '031c0d',
                      time: 1,
                    },
                  ],
                },
              },
            },
            {
              type: 'moveSpeed',
              config: {
                speed: {
                  list: [
                    {
                      value: 200,
                      time: 0,
                    },
                    {
                      value: 100,
                      time: 1,
                    },
                  ],
                  isStepped: false,
                },
              },
            },
            {
              type: 'rotationStatic',
              config: {
                min: 0,
                max: 360,
              },
            },
            {
              type: 'spawnShape',
              config: {
                type: 'torus',
                data: {
                  x: 0,
                  y: 0,
                  radius: 10,
                },
              },
            },
            {
              type: 'textureSingle',
              config: {
                texture: Texture.from(
                  'https://s3-assets.dreamlab.gg/uploaded-from-editor/-1706837965983.png',
                ),
              },
            },
          ],
        },
      )
      this.emitter.emit = true

      this.transform.addZIndexListener(() => {
        if (this.container) this.container.zIndex = this.transform.zIndex
      })
    }
  }

  public override bounds(): Bounds | undefined {
    const { width, height } = this.args
    return { width, height }
  }

  public override isPointInside(point: Vector): boolean {
    const { width, height } = this.args
    return simpleBoundsTest({ width, height }, this.transform, point)
  }

  public override onArgsUpdate(
    path: ArgsPath<Args>,
    _: PreviousArgs<Args>,
  ): void {
    updateSpriteWidthHeight(path, this?.sprite, this.args)

    if (this.gfx && (path === 'width' || path === 'height')) {
      this.gfx.redraw(this.args)
    }

    this.sprite = updateSpriteSource(
      path,
      'spriteSource',
      this.container,
      this.sprite,
      this.args.spriteSource,
      this.args,
    )
  }

  public override onResize(bounds: Bounds): void {
    this.args.width = bounds.width
    this.args.height = bounds.height
  }

  public override teardown(): void {
    this.container?.destroy({ children: true })
    this.particleContainer?.destroy({ children: true })
  }

  public override onRenderFrame(time: RenderTime): void {
    const pos = Vec.add(this.transform.position, camera().offset)
    this.emitter?.update(time.delta)

    if (this.container && this.particleContainer) {
      this.container.position = pos
      // this.particleContainer.position = pos
      this.emitter?.updateSpawnPos(pos.x, pos.y)
      this.container.angle = this.transform.rotation
    }

    if (this.gfx) this.gfx.alpha = debug() ? 0.5 : 0
  }
}
