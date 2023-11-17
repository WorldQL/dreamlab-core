import type { Texture } from 'pixi.js'
import type { KnownAnimation } from '~/entities/player.js'
import { createSprite } from '~/textures/sprites.js'

export interface Gear {
  displayName: string
  texture: Texture
  textureURL: string
  animationName: KnownAnimation
  anchorX: number
  anchorY: number
  rotation: number
  bone: 'handLeft' | 'handRight'
  speedMultiplier: number | undefined
}

export type PlayerGear = Gear | undefined

export const createGear = (
  displayName: string,
  textureURL: string,
  animationName: string,
  speedMultiplier: number | undefined,
  anchorX = 0.5,
  anchorY = 0.5,
  rotation = 0,
  bone: 'handLeft' | 'handRight' = 'handRight',
): PlayerGear => {
  const texture = createSprite(textureURL).texture

  const newItem: PlayerGear = {
    displayName,
    texture,
    textureURL,
    animationName,
    anchorX,
    anchorY,
    rotation,
    bone,
    speedMultiplier,
  }

  return newItem
}
