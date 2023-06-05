import { Bodies, Body, Composite, Detector, Query } from 'matter-js'
import type { Engine } from 'matter-js'
import { Graphics } from 'pixi.js'
import type { Sprite } from 'pixi.js'
import { drawBox } from '~/debug/shapes.js'
import type { Debug } from '~/debug/value.js'
import type { Camera } from '~/entities/camera.js'
import { Vector } from '~/math/vector.js'
import { createSpawnableEntity } from '~/spawnable/spawnableEntity.js'
import type {
  PartializeSpawnable,
  SpawnableEntity,
} from '~/spawnable/spawnableEntity.js'
import { createSprite } from '~/utils/textures.js'

interface Data {
  debug: Debug
  physics: Engine

  body: Body
}

interface Render {
  camera: Camera

  gfxBounds: Graphics
  gfxSensorL: Graphics
  gfxSensorR: Graphics

  sprite: Sprite | undefined
}

interface SimpleNPC extends SpawnableEntity<Data, Render> {}

export const createSimpleNPC = createSpawnableEntity<
  [size: number, textureURL?: string],
  SimpleNPC,
  Data,
  Render
>(
  'createSimpleNPC',
  ({ position, zIndex, tags, preview }, size, textureURL) => {
    const mass = 20
    const sensorSize = 4
    const moveForce = 0.01
    const maxSpeed = 0.2

    let collidingL = false
    let collidingR = false
    let currentDirection: 'left' | 'right' = 'right'

    const body = Bodies.rectangle(position.x, position.y, size, size, {
      label: 'Simple NPC',
      render: { visible: false },

      inertia: Number.POSITIVE_INFINITY,
      inverseInertia: 0,
      mass,
      inverseMass: 1 / mass,
      friction: 0,

      // TODO
      // collisionFilter: {
      //   category: 0b100,
      //   mask: -1 & ~playerLayer,
      // },
    })

    const getSensorL = () =>
      Bodies.rectangle(
        body.position.x - size / 2 + sensorSize / 2,
        body.position.y,
        sensorSize,
        size - sensorSize,
      )

    const getSensorR = () =>
      Bodies.rectangle(
        body.position.x + size / 2 - sensorSize / 2,
        body.position.y,
        sensorSize,
        size - sensorSize,
      )

    const npc: PartializeSpawnable<SimpleNPC, Data, Render> = {
      get position() {
        return Vector.clone(body.position)
      },

      get tags() {
        return tags
      },

      isInBounds(position) {
        return Query.point([body], position).length > 0
      },

      init({ game, physics }) {
        Composite.add(physics.world, body)
        return { debug: game.debug, physics, body }
      },

      initRenderContext(_, { camera, stage }) {
        const gfxBounds = new Graphics()
        drawBox(gfxBounds, { width: size, height: size }, { stroke: '#00f' })

        const gfxSensorL = new Graphics()
        const gfxSensorR = new Graphics()

        gfxBounds.zIndex = zIndex + 1
        gfxSensorL.zIndex = zIndex + 2
        gfxSensorR.zIndex = zIndex + 2

        const sprite = textureURL
          ? createSprite(textureURL, { width: size, height: size, zIndex })
          : undefined

        stage.addChild(gfxBounds)
        stage.addChild(gfxSensorL)
        stage.addChild(gfxSensorR)
        if (sprite) stage.addChild(sprite)

        return { camera, gfxBounds, gfxSensorL, gfxSensorR, sprite }
      },

      teardown({ physics, body }) {
        Composite.remove(physics.world, body)
      },

      teardownRenderContext({ gfxBounds, gfxSensorL, gfxSensorR, sprite }) {
        gfxBounds.removeFromParent()
        gfxSensorL.removeFromParent()
        gfxSensorR.removeFromParent()
        sprite?.removeFromParent()

        gfxBounds.destroy()
        gfxSensorL.destroy()
        gfxSensorR.destroy()
        sprite?.destroy()
      },

      onPhysicsStep(_, { physics }) {
        if (preview) return

        const bodies = physics.world.bodies
          .filter(x => x !== body)
          .filter(x => !x.isSensor)
          .filter(x =>
            Detector.canCollide(body.collisionFilter, x.collisionFilter),
          )

        const queryL = Query.region(bodies, getSensorL().bounds)
        collidingL = queryL.length > 0
        const queryR = Query.region(bodies, getSensorR().bounds)
        collidingR = queryR.length > 0

        if (collidingL) currentDirection = 'right'
        else if (collidingR) currentDirection = 'left'

        const direction = currentDirection === 'left' ? -1 : 1
        const targetVelocity = maxSpeed * direction

        const velocityVector = targetVelocity / body.velocity.x
        const forcePercent = Math.min(Math.abs(velocityVector) / 2, 1)
        const newForce = moveForce * forcePercent * direction

        Body.applyForce(body, body.position, Vector.create(newForce, 0))
      },

      onRenderFrame(
        _,
        { debug },
        { camera, gfxBounds, gfxSensorL, gfxSensorR, sprite },
      ) {
        const pos = Vector.add(body.position, camera.offset)
        if (sprite) sprite.position = pos

        const sensorL = getSensorL()
        const sensorR = getSensorR()

        gfxBounds.position = pos
        gfxSensorL.position = Vector.add(sensorL.position, camera.offset)
        gfxSensorR.position = Vector.add(sensorR.position, camera.offset)

        const alpha = debug.value ? 0.5 : 0
        gfxBounds.alpha = alpha
        gfxSensorL.alpha = alpha
        gfxSensorR.alpha = alpha

        const inactive = '#f00'
        const active = '#0f0'

        const sensorLcolor = collidingL ? active : inactive
        drawBox(
          gfxSensorL,
          {
            width: sensorSize,
            height: size - sensorSize,
          },
          { fill: sensorLcolor, fillAlpha: 1, strokeAlpha: 0 },
        )

        const sensorRcolor = collidingR ? active : inactive
        drawBox(
          gfxSensorR,
          {
            width: sensorSize,
            height: size - sensorSize,
          },
          { fill: sensorRcolor, fillAlpha: 1, strokeAlpha: 0 },
        )
      },
    }

    return npc
  },
)