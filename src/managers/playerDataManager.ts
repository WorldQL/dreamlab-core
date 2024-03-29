/* eslint-disable @typescript-eslint/no-explicit-any */

interface User {
  email: string
  name: string
  displayName: string
  playerData: any
}

interface InputConfig {
  primary: string
  secondary?: string
}

interface Inputs {
  [key: string]: InputConfig
}

interface InputWrapper {
  inputs: Inputs
  inputsRef: {
    current: Inputs
  }
}

interface HandlePoint {
  x: number
  y: number
}

interface ImageTask {
  imageURL: string
}

export interface ObjectItem {
  id: string
  displayName: string
  animationName: string
  imageTasks: ImageTask[]
  handlePoint: HandlePoint
}

export interface PlayerData {
  user: User
  inputs: InputWrapper
  objects: ObjectItem[]
}

export class PlayerDataManager {
  private static playerData: PlayerData = {
    user: {
      email: '',
      name: '',
      displayName: '',
      playerData: {},
    },
    inputs: {
      inputs: {},
      inputsRef: {
        current: {},
      },
    },
    objects: [],
  }

  public static get user(): User {
    return this.playerData.user
  }

  public static get inputs(): InputWrapper {
    return this.playerData.inputs
  }

  public static get objects(): ObjectItem[] {
    return this.playerData.objects
  }

  public static setAll(data: PlayerData | string): PlayerData | undefined {
    let parsedData: PlayerData
    if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data)
      } catch (error) {
        console.error('Failed to parse and set data:', error)
        return
      }
    } else if (typeof data === 'object' && data !== null) {
      parsedData = data
    } else {
      console.error('Invalid data format.')
      return
    }

    this.playerData = parsedData
    return this.playerData
  }

  public static set<T = unknown>(key: keyof PlayerData, jsonStr: string): void {
    try {
      const value: T = JSON.parse(jsonStr)
      this.playerData[key] = value as any
    } catch (error) {
      console.error(`Failed to set value for ${key}:`, error)
    }
  }

  public static get<T = unknown>(key: keyof PlayerData): T {
    return this.playerData[key] as T
  }

  public static deepGet<T = unknown>(path: string): T | undefined {
    const keys = path.split('.')
    let current: any = this.playerData

    for (const key of keys) {
      if (current[key] !== undefined) {
        current = current[key]
      } else {
        return undefined
      }
    }

    return current as T
  }

  public static getAll(): PlayerData {
    return this.playerData
  }
}
