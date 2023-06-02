import { Text, TextStyle } from 'pixi.js'

export interface DebugText {
  get gfx(): Text

  update(content: string): void
  render(scale: number, visible?: boolean): void
}

export const createDebugText = (line: number, zIndex = 10): DebugText => {
  const lineHeight = 24
  const [padX, padY] = [10, 7]

  const style = new TextStyle({
    fontFamily: 'Fira Code',
    fontSize: '1rem',
    lineHeight: 24,
  })

  const text = new Text(undefined, style)
  text.alpha = 0
  if (zIndex) text.zIndex = zIndex

  const x = padX
  const y = padY + line * lineHeight

  const debugText: DebugText = {
    get gfx() {
      return text
    },

    update(content) {
      text.text = content
    },

    render(scale, visible) {
      text.alpha = visible ? 1 : 0

      if (visible) {
        text.position.x = x / scale
        text.position.y = y / scale

        text.scale.set(1 / scale)
      }
    },
  }

  return debugText
}
