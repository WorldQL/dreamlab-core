import type { Game } from '~/game'
import {
  PlatformerPlayer,
  PlatformerPlayerArgs,
} from '../player-v2/platformer-player.js'
import { Background, BackgroundArgs } from './background.js'
import {
  BackgroundTrigger,
  BackgroundTriggerArgs,
} from './backgroundTrigger.js'
import { ComplexSolidArgs, createComplexSolid } from './complexSolid.js'
import { ForceField, ForceFieldArgs } from './forceField.js'
import { Marker, MarkerArgs } from './marker.js'
import { NonSolid, NonSolidArgs } from './nonsolid'
import { PhysicsBall, PhysicsBallArgs } from './physicsBall.js'
import { PhysicsRect, PhysicsRectArgs } from './physicsRect.js'
import { MovingPlatform, MovingPlatformArgs } from './platform-moving.js'
import { Platform, PlatformArgs } from './platform.js'
import { Solid } from './solid'

export const registerDefaultSpawnables = (game: Game<boolean>) => {
  game.register('@dreamlab/Background', Background, BackgroundArgs)
  game.register(
    '@dreamlab/BackgroundTrigger',
    BackgroundTrigger,
    BackgroundTriggerArgs,
  )
  game.register('@dreamlab/PhysicsBall', PhysicsBall, PhysicsBallArgs)
  game.register('@dreamlab/PhysicsRect', PhysicsRect, PhysicsRectArgs)
  game.register('@dreamlab/ComplexSolid', createComplexSolid, ComplexSolidArgs)
  game.register('@dreamlab/ForceField', ForceField, ForceFieldArgs)
  game.register('@dreamlab/Marker', Marker, MarkerArgs)
  game.register('@dreamlab/Nonsolid', NonSolid, NonSolidArgs)
  game.register('@dreamlab/Platform', Platform, PlatformArgs)
  game.register('@dreamlab/MovingPlatform', MovingPlatform, MovingPlatformArgs)
  game.register('@dreamlab/Solid', Solid, NonSolidArgs)

  game.register(
    '@dreamlab/PlatformerPlayer',
    PlatformerPlayer,
    PlatformerPlayerArgs,
  )
}
